/* Bunker Pilot — first-time Setup guide engine (v1.76; v1.80 adds auto-focus, arrow pointer, draggable card, popup auto-minimize and "add more?" questions; v1.82 passes the popup fields already visited to sel(state, touched)).
   Part 1: pure logic (no DOM) — progress state machine, validators, auto-start rules. Unit-tested in test-guide.mjs.
   Part 2: createGuide() — the floating card / chip UI. It touches the DOM only when it is called.
   A step is { id, sel (css string or fn(state, touched)->string; touched = Set of ids of the popup fields the person has already filled in), title, text, need?, optional?, okMsg?, check?(state,ctx)->true|false|'message', when?(state)->bool,
     ask?: { count(state)->n, min?, question(state,n)->string, yesLabel?, noLabel?, yesHint? } }.
   ask = a Yes/No question ("do you still need to add more tanks of this type?") that must be answered before Next unlocks; it comes back whenever count() changes.
   ask.gate = true (v1.85) turns it into a confirmation: the Yes button CONFIRMS (Next unlocks), the No button ("Not yet") shows ask.yesHint and keeps the question. */
/* Step lists live in guide-steps.js, keyed by tab id. Next is locked until check() passes. */

export const GUIDE_KEY = 'bunker-guide-v1';
export const GUIDE_POS_KEY = 'bunker-guide-pos-v1';
export const GUIDE_TABS = ['setup', 'voyage', 'tanks', 'bunkering', 'eca', 'dashboard', 'results'];
export const GUIDE_TAB_LABELS = { setup: 'Setup', voyage: 'Ports', tanks: 'Tank Condition', bunkering: 'Bunkering & Lube Oil', eca: 'ECA / SECA', dashboard: 'Dashboard', results: 'Results' };

/* ---------- Part 1: pure logic ---------- */
export function defaultProgress() { return { v: 1, tabs: {}, minimized: false, skippedAll: false, active: null, asks: {} }; }

export function normProgress(raw) {
  const p = defaultProgress();
  if (!raw || typeof raw !== 'object') return p;
  p.minimized = !!raw.minimized;
  p.skippedAll = !!raw.skippedAll;
  p.active = GUIDE_TABS.includes(raw.active) ? raw.active : null;
  if (raw.asks && typeof raw.asks === 'object') for (const k of Object.keys(raw.asks)) if (Number.isInteger(raw.asks[k]) && raw.asks[k] >= 0) p.asks[k] = raw.asks[k];
  const t = raw.tabs && typeof raw.tabs === 'object' ? raw.tabs : {};
  for (const id of GUIDE_TABS) {
    const x = t[id];
    if (!x || typeof x !== 'object') continue;
    const status = ['active', 'done', 'skipped'].includes(x.status) ? x.status : null;
    if (!status) continue;
    const step = Number.isInteger(x.step) && x.step >= 0 ? x.step : 0;
    p.tabs[id] = { status, step };
  }
  return p;
}

export function tabInfo(progress, tab) { return progress.tabs[tab] || { status: 'pending', step: 0 }; }
const clone = p => JSON.parse(JSON.stringify(p));

/* A step applies unless it has a when() that returns false (e.g. a field that is hidden for this vessel). */
export function applicable(step, state) { try { return !step.when || !!step.when(state); } catch { return false; } }

/* ---- "Add more?" questions (v1.80) ---- */
export const askKey = (tab, step) => tab + ':' + step.id;
/* null when the step has no question or nothing exists yet to ask about; otherwise { key, count, pending, question }. */
export function askInfo(step, asks, state, tab) {
  if (!step || !step.ask) return null;
  let n = 0;
  try { n = Math.max(0, Math.floor(Number(step.ask.count(state)) || 0)); } catch { n = 0; }
  if (n < (step.ask.min || 1)) return null;
  const key = tab ? askKey(tab, step) : step.id, a = asks || {};
  const answered = Object.keys(a).some(k => (k === key || k.endsWith(':' + step.id)) && a[k] === n);
  let q = '';
  try { q = step.ask.question(state, n); } catch { q = ''; }
  return { key, count: n, pending: !answered, question: q };
}
/* No = "that is all": remembers the current count. Yes = forget any earlier answer (the question stays until the count grows). */
export function answerAsk(progress, tab, step, state, more) {
  const p = clone(progress), info = askInfo(step, p.asks, state, tab);
  if (!info) return p;
  p.asks = p.asks || {};
  const done = step.ask.gate ? !!more : !more;   // gate: Yes = confirmed; normal: No = "that is all"
  if (done) p.asks[info.key] = info.count; else delete p.asks[info.key];
  return p;
}

/* ---- Placement helpers for the pointer arrow and the draggable card (pure, unit-tested) ---- */
/* Where to draw the pointer arrow for a target rectangle: above it (pointing down), else below (pointing up), else beside it, else none. */
export function arrowPlacement(r, vw, vh, opt) {
  const o = Object.assign({ size: 34, gap: 6, top: 64, bottom: 8 }, opt || {});
  if (!r || !(r.width > 0 || r.height > 0)) return { dir: 'none', x: 0, y: 0 };
  if (r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) return { dir: 'none', x: 0, y: 0 };
  const cx = Math.min(Math.max(r.left + Math.min(r.width / 2, 64), o.size / 2 + 4), vw - o.size / 2 - 4);
  if (r.top - o.gap - o.size >= o.top) return { dir: 'down', x: cx - o.size / 2, y: r.top - o.gap - o.size };
  if (r.bottom + o.gap + o.size <= vh - o.bottom) return { dir: 'up', x: cx - o.size / 2, y: r.bottom + o.gap };
  const cy = Math.min(Math.max(r.top + r.height / 2, o.top + o.size / 2), vh - o.size / 2 - o.bottom);
  if (r.left - o.gap - o.size >= 4) return { dir: 'right', x: r.left - o.gap - o.size, y: cy - o.size / 2 };
  if (r.right + o.gap + o.size <= vw - 4) return { dir: 'left', x: r.right + o.gap, y: cy - o.size / 2 };
  return { dir: 'none', x: 0, y: 0 };
}
/* Keeps a dragged card fully on screen. */
export function clampCardPos(pos, size, vw, vh, margin) {
  const m = margin == null ? 6 : margin;
  const maxX = Math.max(m, vw - size.w - m), maxY = Math.max(m, vh - size.h - m);
  return { x: Math.min(Math.max(pos.x, m), maxX), y: Math.min(Math.max(pos.y, m), maxY) };
}

export function evalStep(step, state, ctx) {
  let r;
  try { r = step && step.check ? step.check(state, ctx || {}) : true; } catch { r = false; }
  if (r === true) {
    const a = ctx && ctx.asks ? askInfo(step, ctx.asks, state) : null;   /* only the live card passes ctx.asks, so silent auto-start rules never wait for an answer */
    return a && a.pending ? { ok: false, msg: 'Answer the question above to continue.' } : { ok: true, msg: '' };
  }
  return { ok: false, msg: typeof r === 'string' && r ? r : (step && step.need) || 'Enter a value to continue.' };
}

export function failingIndex(steps, state, ctx) {
  for (let i = 0; i < steps.length; i++) if (applicable(steps[i], state) && !evalStep(steps[i], state, ctx).ok) return i;
  return -1;
}
export function stepsPass(steps, state, ctx) { return failingIndex(steps, state, ctx) === -1; }

function firstApplicable(steps, state, from) {
  for (let i = Math.max(0, from); i < steps.length; i++) if (applicable(steps[i], state)) return i;
  return -1;
}

/* What to do when a tab is shown: 'none' | 'start' | 'mark-done' | 'resume'.
   A tab whose required fields are ALL already valid (existing vessel data) is marked done without bothering the user. */
export function autoStartDecision(progress, tab, steps, state, ctx) {
  if (progress.skippedAll || !steps || !steps.length) return 'none';
  const st = tabInfo(progress, tab).status;
  if (st === 'done' || st === 'skipped') return 'none';
  if (st === 'active') return 'resume';
  if (!stepsPass(steps, state, ctx)) return 'start';
  /* Silent completion is for existing users whose REQUIRED data is already in. A tab with no applicable required step
     (only explanatory / optional ones, e.g. nothing bunkered yet) still gets its first-time guide. */
  return steps.some(x => applicable(x, state) && !x.optional) ? 'mark-done' : 'start';
}

export function startTab(progress, tab, steps, state) {
  const p = clone(progress);
  const i = firstApplicable(steps, state, 0);
  if (i < 0) { p.tabs[tab] = { status: 'done', step: 0 }; if (p.active === tab) p.active = null; return p; }
  p.tabs[tab] = { status: 'active', step: i };
  p.active = tab; p.skippedAll = false;
  return p;
}
export function markDone(progress, tab) { const p = clone(progress); p.tabs[tab] = { status: 'done', step: 0 }; if (p.active === tab) p.active = null; return p; }

/* Next: blocked until the current step's check passes. On the last step it re-checks every step of the tab
   and sends the user back to the first one that is no longer valid. */
export function advance(progress, tab, steps, state, ctx) {
  const info = tabInfo(progress, tab);
  if (info.status !== 'active') return { progress, result: 'inactive', msg: '' };
  const cur = steps[info.step];
  const ev = evalStep(cur, state, ctx);
  if (!ev.ok) return { progress, result: 'blocked', msg: ev.msg };
  const nxt = firstApplicable(steps, state, info.step + 1);
  const p = clone(progress);
  if (nxt >= 0) { p.tabs[tab] = { status: 'active', step: nxt }; return { progress: p, result: 'next', msg: '' }; }
  const bad = failingIndex(steps, state, ctx);
  if (bad >= 0) { p.tabs[tab] = { status: 'active', step: bad }; return { progress: p, result: 'blocked', msg: evalStep(steps[bad], state, ctx).msg }; }
  p.tabs[tab] = { status: 'done', step: 0 }; if (p.active === tab) p.active = null;
  return { progress: p, result: 'finished', msg: '' };
}

export function back(progress, tab, steps, state) {
  const info = tabInfo(progress, tab);
  if (info.status !== 'active') return progress;
  for (let i = info.step - 1; i >= 0; i--) if (applicable(steps[i], state)) { const p = clone(progress); p.tabs[tab] = { status: 'active', step: i }; return p; }
  return progress;
}
export function skipTab(progress, tab) {
  const p = clone(progress); const info = tabInfo(progress, tab);
  p.tabs[tab] = { status: 'skipped', step: info.step || 0 };
  if (p.active === tab) p.active = null; return p;
}
export function skipAll(progress) { const p = clone(progress); p.skippedAll = true; p.active = null; p.minimized = false; return p; }
export function setMinimized(progress, on) { const p = clone(progress); p.minimized = !!on; return p; }
/* Resume a skipped / unfinished tab at the step where it stopped (a finished tab restarts from its first step). */
export function resumeTab(progress, tab, steps, state) {
  const info = tabInfo(progress, tab);
  let p = clone(progress); p.skippedAll = false; p.minimized = false;
  if (info.status === 'skipped' || info.status === 'active') {
    let i = Math.min(info.step, steps.length - 1);
    if (!applicable(steps[i], state)) { const f = firstApplicable(steps, state, i); i = f >= 0 ? f : firstApplicable(steps, state, 0); }
    if (i < 0) return markDone(p, tab);
    p.tabs[tab] = { status: 'active', step: i }; p.active = tab; return p;
  }
  return startTab(p, tab, steps, state);
}
/* First tab (in GUIDE_TABS order) that has steps and is not done — used by "Resume setup guide" on a tab with no guide. */
export function nextUnfinishedTab(progress, stepsMap) {
  return GUIDE_TABS.find(t => (stepsMap[t] || []).length && tabInfo(progress, t).status !== 'done') || null;
}
export function guideSummary(progress, stepsMap) {
  const tabs = GUIDE_TABS.filter(t => (stepsMap[t] || []).length);
  return { total: tabs.length, done: tabs.filter(t => tabInfo(progress, t).status === 'done').length, skipped: tabs.filter(t => tabInfo(progress, t).status === 'skipped').length };
}

/* ---------- Part 2: UI controller ---------- */
export function createGuide(opts) {
  const STEPS = opts.steps, getState = opts.getState, showTab = opts.showTab, getTab = opts.getTab;
  const store = opts.storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  const ctx = { q: s => document.querySelector(s) };                                   // silent rules (auto-start): questions never block
  const liveCtx = { q: ctx.q, get asks() { return progress.asks; } };                  // the live card: unanswered questions block Next
  let progress = load(), root = null, card = null, chip = null, arrow = null, timer = null, lastKey = '', targetEl = null;
  let autoMin = false, peek = false, lastModal = false, askYes = '', focusKey = '', pos = loadPos(), dragged = !!pos, drag = null;
  let touched = new Set();   // ids of the fields of the open popup the person has finished (blur / change); the guide then points at the next one

  function load() { try { return normProgress(JSON.parse(store.getItem(GUIDE_KEY))); } catch { return defaultProgress(); } }
  function persist() { try { store.setItem(GUIDE_KEY, JSON.stringify(progress)); } catch { /* storage unavailable: keep going in memory */ } }
  function loadPos() { try { const v = JSON.parse(store.getItem(GUIDE_POS_KEY)); return v && Number.isFinite(v.x) && Number.isFinite(v.y) ? v : null; } catch { return null; } }
  function savePos() { try { if (pos) store.setItem(GUIDE_POS_KEY, JSON.stringify(pos)); else store.removeItem(GUIDE_POS_KEY); } catch { /* ignore */ } }
  function commit(p) { progress = p; persist(); render(true); }
  const stepsOf = tab => STEPS[tab] || [];
  const curStep = () => { const t = progress.active, i = t ? tabInfo(progress, t) : null; return i && i.status === 'active' ? stepsOf(t)[i.step] : null; };

  function ensureRoot() {
    if (root) return;
    root = document.createElement('div'); root.id = 'sgRoot'; root.className = 'sg-root'; root.hidden = true;
    root.innerHTML =
      '<section class="sg-card" role="dialog" aria-label="Setup guide" hidden>' +
        '<div class="sg-head" title="Drag to move \u00b7 double-tap to dock again"><span class="sg-grip" aria-hidden="true">\u283f</span><span class="sg-count"></span><button type="button" class="sg-min" data-sg="min" aria-label="Minimize setup guide" title="Minimize">\u2013</button></div>' +
        '<h4 class="sg-title"></h4><p class="sg-text"></p>' +
        '<div class="sg-ask" hidden><p class="sg-ask-q"></p><div class="sg-ask-btns"><button type="button" class="sg-btn" data-sg="askyes"></button><button type="button" class="secondary sg-btn" data-sg="askno"></button></div></div>' +
        '<p class="sg-status" role="status" aria-live="polite"></p>' +
        '<div class="sg-actions"><button type="button" class="secondary sg-btn" data-sg="back">Back</button><button type="button" class="sg-btn sg-next" data-sg="next">Next</button></div>' +
        '<div class="sg-skip"><button type="button" class="linklike" data-sg="skiptab">Skip this tab</button><button type="button" class="linklike" data-sg="skipall">Skip guide</button></div>' +
      '</section>' +
      '<button type="button" class="sg-chip" data-sg="restore" hidden></button>' +
      '<div class="sg-arrow" hidden aria-hidden="true"><svg viewBox="0 0 34 34" width="34" height="34"><path d="M17 31 L4 14 H12 V3 H22 V14 H30 Z" fill="currentColor" stroke="#2a0a10" stroke-width="1.6" stroke-linejoin="round"/></svg></div>';
    document.body.appendChild(root);
    card = root.querySelector('.sg-card'); chip = root.querySelector('.sg-chip'); arrow = root.querySelector('.sg-arrow');
    root.addEventListener('click', e => {
      const b = e.target.closest('[data-sg]'); if (!b) return;
      const act = b.dataset.sg, tab = progress.active, steps = stepsOf(tab);
      if (act === 'min') { if (modalOpen()) { autoMin = true; peek = false; render(false); } else commit(setMinimized(progress, true)); }
      else if (act === 'restore') { if (modalOpen() && autoMin) { autoMin = false; peek = true; render(false); } else api.resume(progress.active); }
      else if (act === 'back') commit(back(progress, tab, steps, getState()));
      else if (act === 'skiptab') commit(skipTab(progress, tab));
      else if (act === 'skipall') commit(skipAll(progress));
      else if (act === 'askyes' || act === 'askno') {
        const st = curStep(), a = st && askInfo(st, progress.asks, getState(), tab); if (!a) return;
        const hint = st.ask.gate ? act === 'askno' : act === 'askyes';   // the button that leads to the "go and do it" hint
        askYes = hint ? a.key + ':' + a.count : '';
        commit(answerAsk(progress, tab, st, getState(), act === 'askyes'));
      }
      else if (act === 'next') {
        const r = advance(progress, tab, steps, getState(), liveCtx);
        if (r.result === 'blocked') { setStatus(r.msg, false); return; }
        commit(r.progress);
        if (r.result === 'finished') flashDone(tab);
      }
    });
    /* dragging the card by its header; double-tap on the header docks it again */
    const head = card.querySelector('.sg-head');
    head.addEventListener('pointerdown', e => {
      if (e.target.closest('button')) return;
      const r = card.getBoundingClientRect();
      drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, w: r.width, h: r.height, moved: false };
      try { head.setPointerCapture(e.pointerId); } catch { /* not supported */ }
      e.preventDefault();
    });
    head.addEventListener('pointermove', e => {
      if (!drag) return;
      drag.moved = true;
      const p = clampCardPos({ x: e.clientX - drag.dx, y: e.clientY - drag.dy }, { w: drag.w, h: drag.h }, window.innerWidth, window.innerHeight);
      placeCard(p, drag.w); pos = p; dragged = true; updateArrow();
    });
    const endDrag = () => { if (drag && drag.moved) savePos(); drag = null; };
    head.addEventListener('pointerup', endDrag); head.addEventListener('pointercancel', endDrag);
    head.addEventListener('dblclick', () => { pos = null; dragged = false; savePos(); card.classList.remove('sg-dragged'); ['left', 'top', 'right', 'bottom', 'width'].forEach(k => card.style[k] = ''); dodge(); updateArrow(); });

    /* popup fields the person has finished: the pointer then moves on to the next field of the popup */
    const markTouched = e => {
      const m = modalEl(), t = e.target;
      if (!m || !t || !t.id || !m.contains(t) || touched.has(t.id)) return;
      touched.add(t.id); setTimeout(() => refresh(), 80);   // after the browser has moved the focus, so a tap on another field is never overridden
    };
    document.addEventListener('focusout', markTouched, true); document.addEventListener('change', markTouched, true);
    /* live re-check while the user types, plus a light poll for fields that commit on blur/recalc */
    ['input', 'change'].forEach(ev => document.addEventListener(ev, () => refresh(), true));
    window.addEventListener('resize', () => { if (dragged && pos && !card.hidden) { const r = card.getBoundingClientRect(); pos = clampCardPos(pos, { w: r.width, h: r.height }, window.innerWidth, window.innerHeight); placeCard(pos, r.width); } dodge(); updateArrow(); });
    window.addEventListener('scroll', () => updateArrow(), true);
    /* a popup (add tank, Plan a bunkering, ...) opened or closed */
    try { new MutationObserver(() => syncModal()).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['hidden'] }); } catch { /* old browser: the poll still notices */ }
    timer = setInterval(refresh, 600);
  }

  function placeCard(p, w) { card.classList.add('sg-dragged'); card.style.left = p.x + 'px'; card.style.top = p.y + 'px'; card.style.right = 'auto'; card.style.bottom = 'auto'; if (w) card.style.width = w + 'px'; }
  function applyPos() {
    if (!dragged || !pos || card.hidden) return;
    const r = card.getBoundingClientRect(), w = Math.min(r.width || 340, window.innerWidth - 12);
    const p = clampCardPos(pos, { w, h: r.height || 200 }, window.innerWidth, window.innerHeight); placeCard(p, w);
  }

  /* ---- popups ---- */
  const modalEl = () => document.querySelector('.modal:not([hidden])');
  function modalOpen() { return !!modalEl(); }
  function syncModal() {
    const m = modalOpen(); if (m === lastModal) return; lastModal = m;
    document.body.classList.toggle('sg-modal', m);
    autoMin = m; peek = false;      /* a popup opens -> the guide folds into its chip so the person can type; closing the popup brings it back */
    touched = new Set(); lastKey = ''; focusKey = '';    /* re-aim: the next target may be inside the popup (or back on the page) */
    if (root && !root.hidden) render(!m);   /* popup closed -> scroll back to the field the guide wants */
  }

  function setStatus(msg, ok, okMsg) {
    const s = card.querySelector('.sg-status'); s.textContent = ok ? (okMsg || '\u2713 Looks good \u2014 tap Next.') : msg; s.className = 'sg-status ' + (ok ? 'ok' : 'need');
  }
  /* Finds the step's input (the selector may depend on the data), opens any folded card around it, and outlines it. */
  function selOf(step) { try { return typeof step.sel === 'function' ? step.sel(getState(), touched) : step.sel; } catch { return ''; } }
  function revealFolds(el) { for (let d = el.closest('details'); d; d = d.parentElement && d.parentElement.closest('details')) if (!d.open) d.open = true; }
  function elOf(step) { const q = selOf(step); try { return q ? document.querySelector(q) : null; } catch { return null; } }
  function placeTarget(step) {
    clearTarget();
    const el = elOf(step);
    if (!el) return;
    revealFolds(el);
    if (el.getClientRects().length) { targetEl = el.closest('.field') || el; targetEl.classList.add('sg-target'); targetEl._sgInput = el; }
  }
  function clearTarget() { if (targetEl) { targetEl.classList.remove('sg-target'); targetEl._sgInput = null; targetEl = null; } if (arrow) arrow.hidden = true; }

  /* The cursor lands in the box the guide points at (once per step, so typing is never interrupted). */
  function focusTarget(step) {
    if (!targetEl || !targetEl.isConnected) return;
    const key = progress.active + ':' + (curStep() ? curStep().id : '') + ':' + selOf(step) + ':' + askYes;
    if (key === focusKey) return;
    const inModal = modalEl();
    if (inModal && !inModal.contains(targetEl)) return;
    const ae = document.activeElement;
    if (inModal && ae && ae !== document.body && inModal.contains(ae) && ae !== targetEl._sgInput && /^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName)) { focusKey = key; return; }   // the person is typing in another box of the popup
    let el = targetEl._sgInput;
    if (el && !/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(el.tagName)) el = targetEl.querySelector('input,select,textarea,button');
    if (!el) return;
    focusKey = key;
    try {
      el.focus({ preventScroll: true });
      if (el.tagName === 'INPUT') {
        if (el.type === 'number' || el.type === 'text' || el.type === 'search') { if (el.type === 'number' && Number(el.value) === 0) el.select(); else if (el.type !== 'number') el.setSelectionRange(el.value.length, el.value.length); }
      }
    } catch { /* element cannot take focus */ }
  }

  /* The pointer arrow sits next to the highlighted field. */
  function updateArrow() {
    if (!arrow) return;
    const m = modalEl(), show = targetEl && targetEl.isConnected && !(card.hidden && chip.hidden) && !(m && !m.contains(targetEl));
    if (!show) { arrow.hidden = true; return; }
    const inp = targetEl._sgInput && targetEl._sgInput.getClientRects().length ? targetEl._sgInput : targetEl;
    const r = inp.getBoundingClientRect();
    const pl = arrowPlacement({ left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }, window.innerWidth, window.innerHeight, { top: 64, bottom: card.hidden ? 8 : 8 });
    if (pl.dir === 'none') { arrow.hidden = true; return; }
    arrow.hidden = false; arrow.dataset.dir = pl.dir;
    arrow.style.left = Math.round(pl.x) + 'px'; arrow.style.top = Math.round(pl.y) + 'px';
  }

  function flashDone(tab) {
    ensureRoot(); root.hidden = false; chip.hidden = false; card.hidden = true; arrow.hidden = true;
    chip.textContent = '\u2713 ' + GUIDE_TAB_LABELS[tab] + ' setup complete'; chip.className = 'sg-chip sg-chip-done';
    setTimeout(() => { if (!progress.active) root.hidden = true; render(false); }, 2600);
  }

  /* The Yes / No question under the text (tanks: "do you still need to add more?"). */
  function renderAsk(step) {
    const box = card.querySelector('.sg-ask'), a = step && askInfo(step, progress.asks, getState(), progress.active);
    if (!a || !a.pending) { box.hidden = true; return; }
    const yes = askYes === a.key + ':' + a.count;
    box.hidden = false;
    box.querySelector('.sg-ask-q').textContent = yes ? (step.ask.yesHint || 'Go ahead \u2014 tap the highlighted button to add it. This question comes back when you are done.') : a.question;
    const by = box.querySelector('[data-sg="askyes"]'), bn = box.querySelector('[data-sg="askno"]');
    by.textContent = step.ask.yesLabel || 'Yes, add another'; bn.textContent = step.ask.noLabel || 'No, that is all';
    by.hidden = yes && !step.ask.gate; bn.hidden = yes && !!step.ask.gate;   // normal ask: the pressed Yes hides itself; gate: the pressed "Not yet" hides itself and Yes stays
  }

  /* Updates the button + message from live data; never moves the page. */
  function refresh() {
    if (!root || root.hidden) return;
    if (modalOpen() !== lastModal) syncModal();
    const tab = progress.active, info = tabInfo(progress, tab), step = stepsOf(tab)[info.step];
    if (!step) return;
    const pointing = !card.hidden || (autoMin && !progress.minimized && getTab() === tab);   // a minimized guide never moves focus or draws arrows
    if (!pointing) { if (arrow) arrow.hidden = true; return; }
    if (!card.hidden) {
      const ev = evalStep(step, getState(), liveCtx);
      card.querySelector('.sg-next').disabled = !ev.ok;
      setStatus(ev.msg, ev.ok, step.optional ? (step.okMsg || 'Optional \u2014 tap Next when ready.') : '');
      renderAsk(step);
    }
    const f = elOf(step), field = f && (f.closest('.field') || f);
    if (!targetEl || !targetEl.isConnected || !targetEl.classList.contains('sg-target') || (field && field !== targetEl)) { placeTarget(step); if (targetEl) { ensureVisible(); focusTarget(step); } }
    updateArrow();
  }

  /* If the card would cover the field it points at (e.g. a button that is fixed at the bottom of the screen),
     the card moves to the top of the screen instead. A card the person has dragged stays where they put it. */
  function dodge() {
    if (!targetEl || !card || card.hidden || dragged) return;
    card.classList.remove('sg-top');
    const r = targetEl.getBoundingClientRect(), c = card.getBoundingClientRect();
    if (!(r.bottom < c.top || r.top > c.bottom || r.right < c.left || r.left > c.right)) card.classList.add('sg-top');
  }
  function ensureVisible() {
    if (!targetEl) return;
    targetEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setTimeout(() => {   // keep the field clear of the card that docks at the bottom of the screen
      if (!targetEl) return;
      if (!card.hidden && !dragged) {
        card.classList.remove('sg-top');
        const r = targetEl.getBoundingClientRect(), limit = card.getBoundingClientRect().top - 12;
        const moved = r.bottom > limit || r.top < 70;
        if (moved) window.scrollBy({ top: r.top - 120, behavior: 'smooth' });
        setTimeout(() => { dodge(); updateArrow(); }, moved ? 600 : 0);
      } else updateArrow();
    }, 450);
  }

  function render(moveToStep) {
    ensureRoot();
    const tab = progress.active, info = tab ? tabInfo(progress, tab) : null;
    clearTarget();
    if (!tab || !info || info.status !== 'active' || progress.skippedAll) { root.hidden = true; card.hidden = true; chip.hidden = true; document.body.classList.remove('sg-card-open'); return; }
    root.hidden = false;
    const steps = stepsOf(tab), step = steps[info.step], total = steps.filter(s => applicable(s, getState())).length;
    const pos1 = steps.slice(0, info.step + 1).filter(s => applicable(s, getState())).length;
    const folded = progress.minimized || getTab() !== tab || (autoMin && !peek);
    if (folded) {
      card.hidden = true; chip.hidden = false; chip.className = 'sg-chip'; document.body.classList.remove('sg-card-open');
      chip.textContent = autoMin && !progress.minimized && getTab() === tab ? 'Setup guide \u00b7 tap to open (popup is open)'
        : progress.minimized ? 'Setup guide \u00b7 ' + GUIDE_TAB_LABELS[tab] + ' ' + pos1 + '/' + total : 'Resume setup guide \u00b7 ' + GUIDE_TAB_LABELS[tab];
      /* while a popup is open the guide still points at the field it wants, if that field is inside the popup */
      if (autoMin && getTab() === tab) { placeTarget(step); if (targetEl) { focusTarget(step); updateArrow(); } }
      return;
    }
    chip.hidden = true; card.hidden = false; document.body.classList.add('sg-card-open');
    card.classList.toggle('sg-over', modalOpen());
    card.querySelector('.sg-count').textContent = 'Setup guide \u00b7 ' + GUIDE_TAB_LABELS[tab] + ' \u00b7 Step ' + pos1 + ' of ' + total;
    card.querySelector('.sg-title').textContent = step.title;
    card.querySelector('.sg-text').textContent = step.text;
    card.querySelector('[data-sg="back"]').disabled = !steps.slice(0, info.step).some(s => applicable(s, getState()));
    card.querySelector('.sg-next').textContent = steps.slice(info.step + 1).some(s => applicable(s, getState())) ? 'Next' : 'Finish';
    renderAsk(step); applyPos();
    placeTarget(step);
    const key = tab + ':' + info.step;
    if (moveToStep !== false && key !== lastKey) { lastKey = key; focusKey = ''; ensureVisible(); }
    if (targetEl) focusTarget(step);
    refresh(); updateArrow();
  }

  const api = {
    /* Called by the app every time a tab is shown. */
    onTabShown(tab) {
      const steps = stepsOf(tab), d = autoStartDecision(progress, tab, steps, getState(), ctx);
      if (d === 'mark-done') { progress = markDone(progress, tab); persist(); }
      else if (d === 'start') { progress = startTab(progress, tab, steps, getState()); progress.minimized = false; persist(); }
      else if (d === 'resume' && progress.active !== tab) { progress = Object.assign(clone(progress), { active: tab }); persist(); }
      lastKey = ''; focusKey = ''; render(true);
    },
    /* "Resume setup guide": picks up this tab's guide, or the first unfinished tab when this tab has none. */
    resume(tab) {
      let t = tab && stepsOf(tab).length ? tab : null;
      if (!t) { t = getTab(); if (!stepsOf(t).length) t = nextUnfinishedTab(progress, STEPS); }
      if (!t) return false;
      const p = resumeTab(progress, t, stepsOf(t), getState());
      progress = p; persist(); autoMin = false; peek = false;
      if (getTab() !== t) showTab(t); else { lastKey = ''; focusKey = ''; render(true); }
      return true;
    },
    /* Restart: forget everything; the current tab's guide starts again even if its fields are already filled in. */
    restart() {
      progress = defaultProgress(); const t = getTab(); askYes = '';
      if (stepsOf(t).length) progress = startTab(progress, t, stepsOf(t), getState());
      persist(); lastKey = ''; focusKey = ''; render(true);
    },
    minimize() { commit(setMinimized(progress, true)); },
    summary() { return guideSummary(progress, STEPS); },
    progress() { return progress; },
    refresh
  };
  return api;
}
