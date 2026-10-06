import assert from 'node:assert/strict';
import { defaultProgress, normProgress, tabInfo, evalStep, failingIndex, stepsPass, autoStartDecision, startTab, markDone, advance, back, skipTab, skipAll, setMinimized, resumeTab, nextUnfinishedTab, guideSummary, applicable, askInfo, answerAsk, askKey, arrowPlacement, clampCardPos } from './guide.js';
import { GUIDE_STEPS, popupField, ADD_TANK_ORDER, hasWaterTank, foSets, foMode, badLeg, seqClash, badTank, bunkerEvents, badBunker, ecaEntering, ecaLeaving, badEcaEntry, planReady, savedVoyageCount, leaveFixed, PB_OTHER_ORDER, PB_FORM_ORDER, finalSaveQuestion } from './guide-steps.js';
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('ok - ' + name); };

const A = { id: 'a', title: 'A', text: '', check: s => s.a > 0 || 'need a' };
const B = { id: 'b', title: 'B', text: '', check: s => !!s.b, need: 'need b' };
const C = { id: 'c', title: 'C', text: '', when: s => s.showC, check: s => !!s.c };
const steps = [A, B, C];

ok('evalStep: true, message, default message, thrown check', () => {
  assert.deepEqual(evalStep(A, { a: 1 }), { ok: true, msg: '' });
  assert.deepEqual(evalStep(A, { a: 0 }), { ok: false, msg: 'need a' });
  assert.equal(evalStep(B, {}).msg, 'need b');
  assert.equal(evalStep({ check: () => { throw new Error('x'); } }, {}).ok, false);
  assert.equal(evalStep({}, {}).ok, true);
});
ok('applicable / failingIndex / stepsPass ignore steps whose when() is false', () => {
  assert.equal(applicable(C, { showC: false }), false);
  assert.equal(failingIndex(steps, { a: 1, b: 1, showC: false }), -1);
  assert.equal(failingIndex(steps, { a: 1, b: 1, showC: true }), 2);
  assert.equal(stepsPass(steps, { a: 1, b: 1, showC: true, c: 1 }), true);
});
ok('autoStartDecision: start, mark-done for already complete data, resume, none', () => {
  const p = defaultProgress();
  assert.equal(autoStartDecision(p, 'setup', steps, { a: 0 }), 'start');
  assert.equal(autoStartDecision(p, 'setup', steps, { a: 1, b: 1 }), 'mark-done');
  assert.equal(autoStartDecision(p, 'setup', [], {}), 'none');
  assert.equal(autoStartDecision(startTab(p, 'setup', steps, {}), 'setup', steps, {}), 'resume');
  assert.equal(autoStartDecision(skipTab(p, 'setup'), 'setup', steps, { a: 0 }), 'none');
  assert.equal(autoStartDecision(markDone(p, 'setup'), 'setup', steps, { a: 0 }), 'none');
  assert.equal(autoStartDecision(skipAll(p), 'setup', steps, { a: 0 }), 'none');
});
ok('advance is BLOCKED until the current field is valid, then moves on', () => {
  let p = startTab(defaultProgress(), 'setup', steps, { showC: false });
  assert.equal(p.active, 'setup');
  let r = advance(p, 'setup', steps, { a: 0 });
  assert.equal(r.result, 'blocked'); assert.equal(r.msg, 'need a'); assert.equal(tabInfo(r.progress, 'setup').step, 0);
  r = advance(p, 'setup', steps, { a: 5 });
  assert.equal(r.result, 'next'); assert.equal(tabInfo(r.progress, 'setup').step, 1);
  r = advance(r.progress, 'setup', steps, { a: 5, b: 0 });
  assert.equal(r.result, 'blocked'); assert.equal(r.msg, 'need b');
});
ok('last step finishes the tab; skipping a non-applicable step; progress object is not mutated', () => {
  const st = { a: 1, b: 1, showC: false };
  let p = startTab(defaultProgress(), 'setup', steps, { a: 0 });
  const before = JSON.stringify(p);
  let r = advance(p, 'setup', steps, st); assert.equal(JSON.stringify(p), before);
  r = advance(r.progress, 'setup', steps, st);
  assert.equal(r.result, 'finished'); assert.equal(tabInfo(r.progress, 'setup').status, 'done'); assert.equal(r.progress.active, null);
});
ok('finishing re-checks every step and returns to one that is no longer valid', () => {
  let p = startTab(defaultProgress(), 'setup', steps, {});
  p = advance(p, 'setup', steps, { a: 1 }).progress;           // now on B
  const r = advance(p, 'setup', steps, { a: 0, b: 1, showC: false });
  assert.equal(r.result, 'blocked'); assert.equal(tabInfo(r.progress, 'setup').step, 0); assert.equal(r.msg, 'need a');
});
ok('back, skip, minimize, skip-all, resume at the saved step', () => {
  let p = startTab(defaultProgress(), 'setup', steps, {});
  p = advance(p, 'setup', steps, { a: 1 }).progress;
  assert.equal(tabInfo(back(p, 'setup', steps, {}), 'setup').step, 0);
  assert.equal(tabInfo(back(startTab(defaultProgress(), 'setup', steps, {}), 'setup', steps, {}), 'setup').step, 0);
  const sk = skipTab(p, 'setup'); assert.equal(tabInfo(sk, 'setup').status, 'skipped'); assert.equal(sk.active, null);
  const rs = resumeTab(sk, 'setup', steps, {}); assert.equal(rs.active, 'setup'); assert.equal(tabInfo(rs, 'setup').step, 1); assert.equal(rs.minimized, false);
  assert.equal(setMinimized(p, true).minimized, true);
  const all = skipAll(p); assert.equal(all.skippedAll, true); assert.equal(all.active, null);
  assert.equal(resumeTab(all, 'setup', steps, {}).skippedAll, false);
  const fin = markDone(p, 'setup'); assert.equal(tabInfo(resumeTab(fin, 'setup', steps, {}), 'setup').step, 0);
});
ok('normProgress sanitises junk from storage', () => {
  assert.deepEqual(normProgress(null), defaultProgress());
  const p = normProgress({ active: 'nope', minimized: 1, tabs: { setup: { status: 'active', step: -4 }, voyage: { status: 'weird' }, eca: 5 } });
  assert.equal(p.active, null); assert.equal(p.minimized, true); assert.equal(tabInfo(p, 'setup').step, 0); assert.equal(tabInfo(p, 'voyage').status, 'pending');
  const q = normProgress(JSON.parse(JSON.stringify(startTab(defaultProgress(), 'tanks', steps, {}))));
  assert.equal(q.active, 'tanks');
});
ok('nextUnfinishedTab and summary use only tabs that have steps', () => {
  const map = { setup: [A], voyage: [B], tanks: [] };
  let p = markDone(defaultProgress(), 'setup');
  assert.equal(nextUnfinishedTab(p, map), 'voyage');
  assert.deepEqual(guideSummary(skipTab(p, 'voyage'), map), { total: 2, done: 1, skipped: 1 });
  assert.equal(nextUnfinishedTab(markDone(p, 'voyage'), map), null);
});
ok('registry: the Setup vessel-name step gates on a real name', () => {
  const s = GUIDE_STEPS.setup[0];
  assert.equal(evalStep(s, { meta: { vesselName: '' } }).ok, false);
  assert.equal(evalStep(s, { meta: { vesselName: ' A ' } }).ok, false);
  assert.equal(evalStep(s, { meta: { vesselName: 'MV Aurora' } }).ok, true);
  for (const k of Object.keys(GUIDE_STEPS)) assert.ok(Array.isArray(GUIDE_STEPS[k]));
});

/* ---------- chunk 3: Setup + Ports steps ---------- */
const step = (tab, id) => GUIDE_STEPS[tab].find(x => x.id === id);
const chk = (tab, id, st) => evalStep(step(tab, id), st).ok;
const msgOf = (tab, id, st) => evalStep(step(tab, id), st).msg;
const mkState = () => ({ meta: { vesselName: '', currentPosition: '' },
  fuels: [{ id: 'fo', foMode: 'vlsfo', seaRate: 0, portRate: 0, reserveDays: 3, reserveRate: 0, hfo: { seaRate: 0, portRate: 0, reserveDays: 3, reserveRate: 0 } },
          { id: 'do', seaRate: 0, portRate: 0, anchorRate: 0, reserveDays: 3, reserveRate: 0 }],
  lubes: [{ id: 'cyl', seaRate: 0, reserveDays: 7, reserveRate: 0 }, { id: 'mesys', seaRate: 0 }, { id: 'gesys', seaRate: 0 }], route: [] });

ok('Setup: a fresh vessel is blocked at every required step (no step passes by default except optional ones)', () => {
  const s = mkState();
  for (const id of ['vessel', 'position', 'fo-sea', 'fo-port', 'fo-reserve', 'do-rates', 'do-reserve', 'cyl-rate', 'cyl-reserve']) assert.equal(chk('setup', id, s), false, id);
  for (const id of ['utc', 'fo-mode', 'mesys', 'gesys']) { assert.equal(chk('setup', id, s), true, id); assert.equal(step('setup', id).optional, true); }
  assert.equal(failingIndex(GUIDE_STEPS.setup, s), 0);
});
ok('Setup: position needs real text', () => {
  const s = mkState(); assert.equal(chk('setup', 'position', s), false);
  s.meta.currentPosition = 'Singapore'; assert.equal(chk('setup', 'position', s), true);
});
ok('Setup: fuel oil sea/port/reserve follow the fuel mode (VLSFO, HFO, both, same-as-VLSFO)', () => {
  const s = mkState(), fo = s.fuels[0];
  fo.seaRate = 20; fo.portRate = 3; fo.reserveRate = 20;
  assert.ok(chk('setup', 'fo-sea', s) && chk('setup', 'fo-port', s) && chk('setup', 'fo-reserve', s));
  fo.foMode = 'hfo'; assert.equal(foMode(s), 'hfo'); assert.deepEqual(foSets(s).map(x => x.label), ['HFO']);
  assert.equal(chk('setup', 'fo-sea', s), false); assert.match(msgOf('setup', 'fo-sea', s), /HFO/);
  fo.hfo.seaRate = 22; fo.hfo.portRate = 3; fo.hfo.reserveRate = 22;
  assert.ok(chk('setup', 'fo-sea', s) && chk('setup', 'fo-port', s) && chk('setup', 'fo-reserve', s));
  fo.foMode = 'both'; assert.deepEqual(foSets(s).map(x => x.label), ['VLSFO', 'HFO']);
  fo.hfo.seaRate = 0; assert.equal(chk('setup', 'fo-sea', s), false);
  fo.sameAsVlsfo = true; assert.deepEqual(foSets(s).map(x => x.label), ['VLSFO']); assert.equal(chk('setup', 'fo-sea', s), true);
  fo.reserveDays = 0; assert.equal(chk('setup', 'fo-reserve', s), false);
});
ok('Setup: dynamic selectors point at the rate set that is missing', () => {
  const s = mkState(), fo = s.fuels[0]; fo.foMode = 'both'; fo.seaRate = 20; fo.portRate = 3;
  let q = step('setup', 'fo-sea').sel(s);
  assert.ok(q.includes('meSea') && q.includes('data-rate-sub="hfo"'));                 // VLSFO ok, HFO missing -> HFO box
  fo.hfo.seaRate = 5; q = step('setup', 'fo-sea').sel(s);
  assert.ok(q.includes('meSea') && q.includes(':not([data-rate-sub])'));               // all ok -> first (VLSFO) set
  q = step('setup', 'fo-reserve').sel(s);                                               // VLSFO reserve/day is 0 -> its reserve-per-day box
  assert.ok(q.includes('data-field="reserveRate"') && q.includes(':not([data-rate-sub])'));
  fo.reserveDays = 0; assert.ok(step('setup', 'fo-reserve').sel(s).includes('data-field="reserveDays"'));
});
ok('Setup: diesel oil needs at least one rate and a reserve; cylinder oil needs a sea rate and a reserve', () => {
  const s = mkState(), d = s.fuels[1], c = s.lubes[0];
  d.portRate = 0.5; assert.equal(chk('setup', 'do-rates', s), true);
  assert.equal(chk('setup', 'do-reserve', s), false); d.reserveRate = 0.5; assert.equal(chk('setup', 'do-reserve', s), true);
  assert.equal(chk('setup', 'cyl-rate', s), false); c.seaRate = 60; assert.equal(chk('setup', 'cyl-rate', s), true);
  assert.equal(chk('setup', 'cyl-reserve', s), false); c.reserveRate = 60; assert.equal(chk('setup', 'cyl-reserve', s), true);
  assert.ok(step('setup', 'cyl-reserve').sel(s).includes('data-field="reserveRate"')); c.reserveDays = 0;
  assert.ok(step('setup', 'cyl-reserve').sel(s).includes('data-field="reserveDays"'));
});
ok('Setup: whole tab passes once everything required is filled (existing users are skipped)', () => {
  const s = mkState(); s.meta.vesselName = 'MV Aurora'; s.meta.currentPosition = 'Manila';
  s.fuels[0].seaRate = 20; s.fuels[0].portRate = 3; s.fuels[0].reserveRate = 20;
  s.fuels[1].seaRate = 1; s.fuels[1].reserveRate = 1; s.lubes[0].seaRate = 60; s.lubes[0].reserveRate = 60;
  assert.equal(stepsPass(GUIDE_STEPS.setup, s), true);
  assert.equal(autoStartDecision(defaultProgress(), 'setup', GUIDE_STEPS.setup, s), 'mark-done');
});
ok('Ports: the first leg is gated step by step', () => {
  const s = mkState();
  assert.equal(chk('voyage', 'add-first', s), false);
  s.route.push({ port: '', distanceNm: 0, speedKn: 0, portStayDays: 0, portStayHours: 0 });
  assert.equal(chk('voyage', 'add-first', s), true); assert.equal(chk('voyage', 'p1-name', s), false);
  s.route[0].port = 'Manila'; assert.equal(chk('voyage', 'p1-name', s), true);
  assert.equal(chk('voyage', 'add-second', s), false);
  s.route.push({ port: '', distanceNm: 0, speedKn: 0, portStayDays: 0, portStayHours: 0 });
  for (const [id, f, v] of [['p2-name', 'port', 'Singapore'], ['p2-distance', 'distanceNm', 1500], ['p2-speed', 'speedKn', 12]]) {
    assert.equal(chk('voyage', id, s), false, id); s.route[1][f] = v; assert.equal(chk('voyage', id, s), true, id);
  }
  assert.equal(chk('voyage', 'p2-stay', s), false); s.route[1].portStayHours = 6; assert.equal(chk('voyage', 'p2-stay', s), true);
  s.route[1].portStayHours = 0; s.route[1].portStayDays = 1; assert.equal(chk('voyage', 'p2-stay', s), true);
  assert.equal(chk('voyage', 'p2-utc', s), true);
});
ok('Ports: steps for port 2 do not pass with fewer than 2 ports', () => {
  const s = mkState(); s.route.push({ port: 'Manila' });
  for (const id of ['p2-name', 'p2-distance', 'p2-speed', 'p2-stay']) assert.equal(chk('voyage', id, s), false, id);
});
ok('Ports: the final step checks every later leg and names the first problem', () => {
  const s = mkState();
  s.route = [{ port: 'Manila' }, { port: 'Singapore', distanceNm: 1500, speedKn: 12 }, { port: 'Colombo', distanceNm: 0, speedKn: 12 }, { port: '', distanceNm: 10, speedKn: 10 }];
  assert.equal(chk('voyage', 'legs', s), false); assert.match(msgOf('voyage', 'legs', s), /Colombo.*distance/);
  assert.equal(step('voyage', 'legs').sel(s), '[data-route-index="2"][data-field="distanceNm"]');
  s.route[2].distanceNm = 800; assert.match(msgOf('voyage', 'legs', s), /Port 4.*name/);
  s.route[3].port = 'Suez'; assert.equal(badLeg(s), null); assert.equal(chk('voyage', 'legs', s), true);
  s.route[3].speedKn = 0; assert.match(msgOf('voyage', 'legs', s), /Suez.*speed/); s.route[3].speedKn = 10;
  assert.equal(step('voyage', 'legs').sel(s), '#addRouteInline');
});
ok('Ports: a fully valid existing route is marked done silently; an empty one starts the guide', () => {
  const s = mkState();
  assert.equal(autoStartDecision(defaultProgress(), 'voyage', GUIDE_STEPS.voyage, s), 'start');
  s.route = [{ port: 'Manila' }, { port: 'Singapore', distanceNm: 1500, speedKn: 12, portStayDays: 1, portStayHours: 0 }];
  assert.equal(autoStartDecision(defaultProgress(), 'voyage', GUIDE_STEPS.voyage, s), 'mark-done');
});

const tk = (o) => ({ id: 't' + Math.random(), group: 'fo', category: 'storage', consumable: true, capacity: 0, rob: 0, unpumpable: 0, sequence: 1, ...o });
ok('Tanks: logbook ROB steps (fuel always, diesel only when used, lube optional)', () => {
  const s = mkState(); s.meta.noonRob = {};
  assert.equal(chk('tanks', 'noon-date', s), true); assert.equal(step('tanks', 'noon-date').optional, true);
  assert.equal(chk('tanks', 'noon-fo', s), false); s.meta.noonRob.fo = 480; assert.equal(chk('tanks', 'noon-fo', s), true);
  assert.equal(applicable(step('tanks', 'noon-do'), s), false); s.fuels[1].seaRate = 1;
  assert.equal(applicable(step('tanks', 'noon-do'), s), true); assert.equal(chk('tanks', 'noon-do', s), false);
  s.meta.noonRob.do = 100; assert.equal(chk('tanks', 'noon-do', s), true); assert.equal(chk('tanks', 'noon-lube', s), true);
});
ok('Tanks: add, capacity, ROB and unpumpable are gated per tank', () => {
  const s = mkState(); s.meta.noonRob = { fo: 300 }; s.tanks = [];
  assert.equal(chk('tanks', 'fo-tank', s), false); assert.equal(chk('tanks', 'fo-cap', s), false);
  s.tanks.push(tk({ name: 'No.1 FO Tank (P)' }), tk({ name: 'No.1 FO Tank (S)', sequence: 2 }));
  assert.equal(chk('tanks', 'fo-tank', s), true); assert.equal(chk('tanks', 'fo-cap', s), false);
  assert.match(msgOf('tanks', 'fo-cap', s), /No\.1 FO Tank \(P\).*capacity/);
  s.tanks[0].capacity = 200; assert.match(msgOf('tanks', 'fo-cap', s), /\(S\)/);
  assert.equal(step('tanks', 'fo-cap').sel(s), '[data-tank-index="1"][data-field="capacityM3"], [data-tank-index="1"][data-field="capacity"]');
  s.tanks[1].capacityM3 = 150; assert.equal(chk('tanks', 'fo-cap', s), true);
  assert.equal(chk('tanks', 'fo-rob', s), false); assert.match(msgOf('tanks', 'fo-rob', s), /300/);
  s.tanks[0].rob = 120; assert.equal(chk('tanks', 'fo-rob', s), true);
  assert.equal(chk('tanks', 'fo-unpump', s), true); assert.equal(step('tanks', 'fo-unpump').optional, true);
});
ok('Tanks: zero ROB is accepted when the logbook also shows none', () => {
  const s = mkState(); s.meta.noonRob = { fo: 0 }; s.tanks = [tk({ capacity: 100 })];
  assert.equal(chk('tanks', 'fo-rob', s), true);
});
ok('Tanks: settling/service tanks do not count as storage tanks', () => {
  const s = mkState(); s.tanks = [tk({ category: 'settling', capacity: 20 })];
  assert.equal(chk('tanks', 'fo-tank', s), false);
});
ok('Tanks: sequence step only appears with 2+ consumable tanks and flags duplicates', () => {
  const s = mkState(); s.tanks = [tk({ capacity: 10 })];
  assert.equal(applicable(step('tanks', 'fo-seq'), s), false);
  s.tanks.push(tk({ capacity: 10 })); assert.equal(applicable(step('tanks', 'fo-seq'), s), true);
  assert.deepEqual(seqClash(s, 'fo'), { i: 1, a: 0, seq: 1 }); assert.equal(chk('tanks', 'fo-seq', s), false);
  assert.match(msgOf('tanks', 'fo-seq', s), /sequence 1/); assert.equal(step('tanks', 'fo-seq').sel(s), '[data-tank-sequence="1"]');
  s.tanks[1].sequence = 2; assert.equal(seqClash(s, 'fo'), null); assert.equal(chk('tanks', 'fo-seq', s), true);
  s.tanks[1].sequence = 1; s.tanks[1].consumable = false; assert.equal(chk('tanks', 'fo-seq', s), true);
});
ok('Tanks: diesel, cylinder and system-oil steps follow the Setup rates', () => {
  const s = mkState();
  for (const g of ['do', 'cyl', 'mesys', 'gesys']) assert.equal(applicable(step('tanks', g + '-tank'), s), false, g);
  s.fuels[1].portRate = 1; s.lubes[0].seaRate = 60; s.lubes[1].seaRate = 5;
  for (const g of ['do', 'cyl', 'mesys']) assert.equal(applicable(step('tanks', g + '-tank'), s), true, g);
  assert.equal(applicable(step('tanks', 'gesys-tank'), s), false);
  s.tanks = [tk({ group: 'cyl', capacity: 8000, rob: 5000 })]; s.meta.noonRob = { cyl: 5000 };
  assert.equal(chk('tanks', 'cyl-tank', s), true); assert.equal(chk('tanks', 'cyl-cap', s), true); assert.equal(chk('tanks', 'cyl-rob', s), true);
  assert.equal(badTank(s, 'cyl', t => t.capacity > 99999).i, 0); assert.equal(badTank(s, 'cyl', () => true), null);
});
ok('Tanks: saving the tank condition is optional and highlights the Save button', () => {
  const st = step('tanks', 'save-condition'); assert.equal(st.optional, true); assert.equal(st.sel, '[data-tank-save]');
  assert.equal(chk('tanks', 'save-condition', mkState()), true);
});
ok('Tanks: a complete existing tank list is marked done silently; a fresh vessel starts the guide', () => {
  const s = mkState(); s.meta.noonRob = {};
  assert.equal(autoStartDecision(defaultProgress(), 'tanks', GUIDE_STEPS.tanks, s), 'start');
  s.meta.noonRob = { fo: 300 }; s.tanks = [tk({ capacity: 400, rob: 300 })];
  assert.equal(autoStartDecision(defaultProgress(), 'tanks', GUIDE_STEPS.tanks, s), 'mark-done');
});
ok('Bunkering: nothing planned is fine; the allocation step only applies once a quantity exists', () => {
  const s = mkState(); s.route = [{ port: 'Manila', bunkers: {} }, { port: 'Singapore' }];
  assert.deepEqual(bunkerEvents(s), []); assert.equal(chk('bunkering', 'bk-ports', s), true); assert.equal(chk('bunkering', 'bk-qty', s), true);
  assert.equal(applicable(step('bunkering', 'bk-alloc'), s), false);
  assert.equal(autoStartDecision(defaultProgress(), 'bunkering', GUIDE_STEPS.bunkering, s), 'start');   // only explanatory steps: still shown once
  assert.equal(applicable(step('bunkering', 'bk-ports'), { route: [] }), false);
});
ok('Bunkering: auto-allocated and per-tank bunkers pass; a manual allocation that does not add up is flagged', () => {
  const s = mkState(); s.route = [{ port: 'Manila' }, { port: 'Singapore', bunkers: { fo: { quantity: 500, autoAllocate: true } } }];
  assert.equal(bunkerEvents(s).length, 1); assert.equal(applicable(step('bunkering', 'bk-alloc'), s), true);
  assert.equal(chk('bunkering', 'bk-alloc', s), true);
  assert.equal(autoStartDecision(defaultProgress(), 'bunkering', GUIDE_STEPS.bunkering, s), 'mark-done');   // required step already satisfied
  assert.equal(step('bunkering', 'bk-ports').sel(s), '[data-open-key="bunkport:1"]');
  s.route[1].bunkers.fo = { quantity: 500, autoAllocate: false, allocations: [{ tankId: 'a', quantity: 200 }, { tankId: 'b', quantity: 250 }] };
  assert.equal(chk('bunkering', 'bk-alloc', s), false); assert.match(msgOf('bunkering', 'bk-alloc', s), /Singapore.*450.*500/);
  assert.equal(step('bunkering', 'bk-alloc').sel(s), '[data-alloc-route="1"][data-alloc-fuel="fo"]');
  s.route[1].bunkers.fo.allocations[1].quantity = 300; assert.equal(badBunker(s), null); assert.equal(chk('bunkering', 'bk-alloc', s), true);
  s.route[1].bunkers.fo = { entryMode: 'tanks', allocations: [{ tankId: 'a', quantity: 10 }], autoAllocate: false }; assert.equal(chk('bunkering', 'bk-alloc', s), true);
  s.route[1].bunkers = { cyl: { mode: 'drums', quantity: 400, autoAllocate: false } }; assert.equal(chk('bunkering', 'bk-alloc', s), true);
});

const ecaPort = (en, o) => ({ port: 'P', eca: { port: { enabled: en, lineToPortNm: 0, ...o }, entering: {}, leaving: {} } });
ok('Engine: a tab with only optional steps is started, not silently completed; required ones still mark-done', () => {
  const opt = [{ id: 'o', optional: true, title: '', text: '' }];
  assert.equal(autoStartDecision(defaultProgress(), 'eca', opt, {}), 'start');
  assert.equal(autoStartDecision(defaultProgress(), 'eca', [...opt, { id: 'r', title: '', text: '', check: () => true }], {}), 'mark-done');
});
ok('ECA: entering / leaving ports are derived from the ticked ports', () => {
  const s = mkState(); s.route = [ecaPort(false), ecaPort(true), ecaPort(true), ecaPort(false)];
  assert.deepEqual(ecaEntering(s), [1]); assert.deepEqual(ecaLeaving(s), [2]);
  s.route = [ecaPort(true), ecaPort(true)]; assert.deepEqual(ecaEntering(s), []); assert.deepEqual(ecaLeaving(s), [1]);
});
ok('ECA: no ECA port ticked means the detail steps are hidden and the tab still starts its guide', () => {
  const s = mkState(); s.route = [ecaPort(false), ecaPort(false)];
  for (const id of ['eca-dist', 'eca-from', 'eca-to', 'eca-limit', 'eca-exit']) assert.equal(applicable(step('eca', id), s), false, id);
  assert.equal(applicable(step('eca', 'eca-port'), s), true); assert.equal(chk('eca', 'eca-port', s), true);
  assert.equal(step('eca', 'eca-port').sel(s), '[data-eca-port="0"][data-eca-pfield="enabled"]');
  assert.equal(autoStartDecision(defaultProgress(), 'eca', GUIDE_STEPS.eca, s), 'start');
  s.route[1].eca.port.enabled = true; assert.equal(step('eca', 'eca-port').sel(s), '[data-eca-port="1"][data-eca-pfield="enabled"]');
});
ok('ECA: distance, current sulphur and compliant sulphur are gated in order, naming the port', () => {
  const s = mkState(); s.route = [ecaPort(false), ecaPort(true, {}), ecaPort(false)]; s.route[1].port = 'Rotterdam';
  assert.equal(chk('eca', 'eca-dist', s), false); assert.match(msgOf('eca', 'eca-dist', s), /Rotterdam.*line/);
  assert.equal(step('eca', 'eca-dist').sel(s), '[data-eca-port="1"][data-eca-pfield="lineToPortNm"]');
  s.route[1].eca.port.lineToPortNm = 40; assert.equal(chk('eca', 'eca-dist', s), true);
  assert.equal(chk('eca', 'eca-from', s), false); assert.equal(chk('eca', 'eca-to', s), false);   // the first unmet field is reported on its own step
  s.route[1].eca.entering.fromSulphurPct = 0.5; assert.equal(chk('eca', 'eca-from', s), true);
  assert.equal(chk('eca', 'eca-to', s), false); assert.equal(step('eca', 'eca-to').sel(s), '[data-eca="1"][data-eca-dir="entering"][data-eca-field="toSulphurPct"]');
  s.route[1].eca.entering.toSulphurPct = 0.8; assert.match(msgOf('eca', 'eca-to', s), /must not have more sulphur/);
  s.route[1].eca.entering.toSulphurPct = 0.1; assert.equal(chk('eca', 'eca-to', s), true); assert.equal(badEcaEntry(s), null);
  assert.equal(chk('eca', 'eca-limit', s), true); assert.equal(step('eca', 'eca-limit').optional, true);
});
ok('ECA: the leaving-distance step is optional and appears for a leaving port', () => {
  const s = mkState(); s.route = [ecaPort(false), ecaPort(true, { lineToPortNm: 30 })];
  assert.equal(applicable(step('eca', 'eca-exit'), s), true); assert.equal(chk('eca', 'eca-exit', s), true);
  assert.equal(step('eca', 'eca-exit').sel(s), '[data-eca-port="1"][data-eca-pfield="exitNm"]');
});
ok('Home: the route step needs two complete ports and a fuel tank with a capacity', () => {
  const s = mkState(); s.tanks = [];
  assert.equal(chk('dashboard', 'home-route', s), false); assert.match(planReady(s), /two ports/);
  s.route = [{ port: 'Manila' }, { port: 'Singapore', distanceNm: 0, speedKn: 12 }]; assert.match(planReady(s), /Singapore.*distance/);
  s.route[1].distanceNm = 1500; assert.match(planReady(s), /tank/);
  s.tanks = [tk({ capacity: 400 })]; assert.equal(planReady(s), true); assert.equal(chk('dashboard', 'home-route', s), true);
  for (const id of ['home-bunker', 'home-plan']) { assert.equal(chk('dashboard', id, s), true, id); assert.equal(step('dashboard', id).optional, true); }
  assert.equal(autoStartDecision(defaultProgress(), 'dashboard', GUIDE_STEPS.dashboard, s), 'mark-done');
});
ok('Results: saving a voyage is required and reads the saved-voyage store', () => {
  const store = {}; globalThis.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } };
  try {
    assert.equal(savedVoyageCount(), 0); assert.equal(chk('results', 'res-save', mkState()), false);
    assert.equal(chk('results', 'res-name', mkState()), true); assert.equal(step('results', 'res-name').optional, true);
    assert.equal(autoStartDecision(defaultProgress(), 'results', GUIDE_STEPS.results, mkState()), 'start');
    store['bunker-saved-voyages-v1'] = JSON.stringify([{ id: 'v1', name: 'x' }]);
    assert.equal(savedVoyageCount(), 1); assert.equal(chk('results', 'res-save', mkState()), true);
    assert.equal(autoStartDecision(defaultProgress(), 'results', GUIDE_STEPS.results, mkState()), 'mark-done');
    store['bunker-saved-voyages-v1'] = '{bad'; assert.equal(savedVoyageCount(), 0);
  } finally { delete globalThis.localStorage; }
  assert.equal(savedVoyageCount(), 0);
});

/* ---- v1.80 engine: "add more?" questions, arrow placement, card clamp ---- */
const AQ = { id: 'q', title: 'Q', text: '', check: s => (s.items || 0) >= 1 || 'add one',
  ask: { count: s => s.items || 0, question: (s, k) => `You have ${k}. More?` } };
ok('askInfo: nothing to ask until an item exists; pending until answered; comes back when the count changes', () => {
  assert.equal(askInfo(AQ, {}, { items: 0 }, 'tanks'), null);
  assert.equal(askInfo({ id: 'x' }, {}, { items: 3 }, 'tanks'), null);
  let a = askInfo(AQ, {}, { items: 1 }, 'tanks');
  assert.equal(a.pending, true); assert.equal(a.count, 1); assert.equal(a.key, 'tanks:q'); assert.equal(a.question, 'You have 1. More?');
  const p = answerAsk(defaultProgress(), 'tanks', AQ, { items: 1 }, false);
  assert.equal(p.asks['tanks:q'], 1);
  assert.equal(askInfo(AQ, p.asks, { items: 1 }, 'tanks').pending, false);
  assert.equal(askInfo(AQ, p.asks, { items: 2 }, 'tanks').pending, true, 'asks again after one more tank is added');
  assert.equal(answerAsk(p, 'tanks', AQ, { items: 1 }, true).asks['tanks:q'], undefined, 'Yes forgets the old answer');
  assert.equal(askKey('tanks', AQ), 'tanks:q');
});
ok('evalStep: a pending question blocks Next only on the live card (ctx.asks), never in silent auto-start', () => {
  assert.equal(evalStep(AQ, { items: 1 }).ok, true);
  assert.equal(evalStep(AQ, { items: 1 }, { asks: {} }).ok, false);
  assert.match(evalStep(AQ, { items: 1 }, { asks: {} }).msg, /Answer the question/);
  assert.equal(evalStep(AQ, { items: 1 }, { asks: { 'tanks:q': 1 } }).ok, true);
  assert.equal(evalStep(AQ, { items: 0 }, { asks: {} }).msg, 'add one', 'the normal check message wins while there is no item');
  assert.equal(autoStartDecision(defaultProgress(), 'tanks', [AQ], { items: 1 }, {}), 'mark-done');
});
ok('advance: blocked while the question is open, moves on after "No more"; Finish re-checks it', () => {
  const two = [AQ, { id: 'z', title: 'Z', text: '', check: () => true }];
  let p = startTab(defaultProgress(), 'tanks', two, { items: 1 });
  let live = { asks: p.asks };
  let r = advance(p, 'tanks', two, { items: 1 }, live);
  assert.equal(r.result, 'blocked');
  p = answerAsk(p, 'tanks', AQ, { items: 1 }, false); live = { asks: p.asks };
  r = advance(p, 'tanks', two, { items: 1 }, live);
  assert.equal(r.result, 'next');
  const stored = JSON.parse(JSON.stringify(p)); assert.equal(normProgress(stored).asks['tanks:q'], 1);
  assert.deepEqual(normProgress({ asks: { a: -1, b: 'x', c: 2 } }).asks, { c: 2 });
});
ok('tank step: the guide asks "do you still need to add more <type> tanks?" for every group once a tank exists', () => {
  for (const g of ['fo', 'do', 'cyl', 'mesys', 'gesys']) {
    const st = step('tanks', g + '-tank'), s = { tanks: [{ group: g, category: 'storage', name: 'T1' }] };
    assert.ok(st.ask, g + ' has a question');
    const a = askInfo(st, {}, s, 'tanks');
    assert.equal(a.pending, true); assert.match(a.question, /Do you still need to add more/);
    assert.equal(askInfo(st, {}, { tanks: [] }, 'tanks'), null);
    assert.equal(askInfo(st, {}, { tanks: [s.tanks[0], { group: g, category: 'settling' }] }, 'tanks').count, 2, 'settling/service tanks of the type count too');
    assert.equal(askInfo(st, {}, { tanks: [{ group: g === 'fo' ? 'do' : 'fo' }] }, 'tanks'), null, 'other types do not count');
  }
  assert.equal(step('tanks', 'fo-tank').sel(), '[data-add-tank="fo"]', 'without a popup the arrow points at + Tank');
});
ok('arrowPlacement: above the field when there is room, below near the top, beside it as a last resort, none off-screen', () => {
  const R = (l, t, w, h) => ({ left: l, top: t, width: w, height: h, right: l + w, bottom: t + h });
  let a = arrowPlacement(R(20, 300, 200, 40), 400, 800); assert.equal(a.dir, 'down'); assert.equal(a.y, 300 - 6 - 34);
  a = arrowPlacement(R(20, 80, 200, 40), 400, 800); assert.equal(a.dir, 'up'); assert.equal(a.y, 120 + 6);
  a = arrowPlacement(R(120, 90, 200, 700), 400, 800); assert.ok(['right', 'left'].includes(a.dir), a.dir);
  assert.equal(arrowPlacement(R(20, 900, 100, 40), 400, 800).dir, 'none');
  assert.equal(arrowPlacement(null, 400, 800).dir, 'none');
  assert.ok(a.x >= 0 && a.x + 34 <= 400);
  const edge = arrowPlacement(R(380, 300, 200, 40), 400, 800); assert.ok(edge.x + 34 <= 400 && edge.x >= 0);
});
ok('clampCardPos keeps a dragged card on screen', () => {
  assert.deepEqual(clampCardPos({ x: -50, y: -9 }, { w: 300, h: 200 }, 400, 800), { x: 6, y: 6 });
  assert.deepEqual(clampCardPos({ x: 390, y: 790 }, { w: 300, h: 200 }, 400, 800), { x: 94, y: 594 });
  assert.deepEqual(clampCardPos({ x: 50, y: 60 }, { w: 300, h: 200 }, 400, 800), { x: 50, y: 60 });
  assert.deepEqual(clampCardPos({ x: 50, y: 60 }, { w: 500, h: 900 }, 400, 800), { x: 6, y: 6 });
});

/* ---- v1.81 (chunk 2): missed Setup and Ports entries ---- */
const optIds = (tab, ids) => ids.forEach(id => { assert.ok(step(tab, id), id); assert.equal(step(tab, id).optional, true, id + ' optional'); });
ok('Setup v1.81: voyage number, rate names, locked-rate note, fuel-oil anchor note and cylinder name are optional explanation steps', () => {
  optIds('setup', ['voyage-no', 'rate-names', 'rates-locked', 'fo-anchor', 'cyl-name']);
  const s = mkState();
  for (const id of ['voyage-no', 'rate-names', 'rates-locked', 'fo-anchor', 'cyl-name']) assert.equal(chk('setup', id, s), true, id);
  assert.equal(step('setup', 'voyage-no').sel, '#voyageNo');
  assert.equal(step('setup', 'rate-names').sel, '[data-rate-id="fo"][data-field="name"]');
  assert.equal(step('setup', 'cyl-name').sel, '[data-rate-id="cyl"][data-field="name"]');
  assert.ok(step('setup', 'fo-anchor').sel(s).includes('boilerPort'));
  assert.ok(step('setup', 'rates-locked').sel(s).includes('meSea'));
  const ids = GUIDE_STEPS.setup.map(x => x.id);
  assert.ok(ids.indexOf('rate-names') < ids.indexOf('fo-sea') && ids.indexOf('rates-locked') < ids.indexOf('fo-sea'));
  assert.ok(ids.indexOf('cyl-name') < ids.indexOf('cyl-rate'));
});
ok('Setup v1.81: the "same rates" box only shows when both fuels are used, and its selector is the checkbox', () => {
  const s = mkState(), st = step('setup', 'fo-same');
  assert.equal(applicable(st, s), false);
  s.fuels[0].foMode = 'hfo'; assert.equal(applicable(st, s), false);
  s.fuels[0].foMode = 'both'; assert.equal(applicable(st, s), true);
  assert.equal(st.sel, '[data-rate-id="fo"][data-field="sameAsVlsfo"]'); assert.equal(st.optional, true);
});
ok('Setup v1.81: diesel in-port and anchor/drift boxes follow the diesel sea rate; they never block', () => {
  const s = mkState(), a = step('setup', 'do-port'), b = step('setup', 'do-anchor');
  assert.equal(applicable(a, s), false); assert.equal(applicable(b, s), false);       // no diesel rate yet -> only the required sea step is shown
  s.fuels[1].seaRate = 1; assert.equal(applicable(a, s), true); assert.equal(applicable(b, s), true);
  assert.equal(a.sel, '[data-rate-id="do"][data-field="portRate"]'); assert.equal(b.sel, '[data-rate-id="do"][data-field="anchorRate"]');
  assert.equal(chk('setup', 'do-port', s), true); assert.equal(chk('setup', 'do-anchor', s), true);
  const ids = GUIDE_STEPS.setup.map(x => x.id); assert.ok(ids.indexOf('do-rates') < ids.indexOf('do-port') && ids.indexOf('do-anchor') < ids.indexOf('do-reserve'));
});
ok('Setup v1.81: ME and GE system oil reserves only apply once a daily make-up is entered', () => {
  const s = mkState();
  for (const id of ['mesys-reserve', 'gesys-reserve']) assert.equal(applicable(step('setup', id), s), false, id);
  s.lubes[1].seaRate = 5; s.lubes[2].seaRate = 8;
  for (const id of ['mesys-reserve', 'gesys-reserve']) { assert.equal(applicable(step('setup', id), s), true, id); assert.equal(chk('setup', id, s), false, id); }
  assert.match(msgOf('setup', 'mesys-reserve', s), /reserve/);
  s.lubes[1].reserveDays = 7; s.lubes[1].reserveRate = 5; assert.equal(chk('setup', 'mesys-reserve', s), true);
  assert.ok(step('setup', 'gesys-reserve').sel(s).includes('data-rate-id="gesys"') && step('setup', 'gesys-reserve').sel(s).includes('reserveDays'));
  s.lubes[2].reserveDays = 7; assert.ok(step('setup', 'gesys-reserve').sel(s).includes('reserveRate'));
  s.lubes[2].reserveRate = 8; assert.equal(chk('setup', 'gesys-reserve', s), true);
});
ok('Setup v1.81: a vessel that does not use ME/GE system oil is still marked done silently', () => {
  const s = mkState(); s.meta.vesselName = 'MV Aurora'; s.meta.currentPosition = 'Manila';
  s.fuels[0].seaRate = 20; s.fuels[0].portRate = 3; s.fuels[0].reserveRate = 20;
  s.fuels[1].seaRate = 1; s.fuels[1].reserveRate = 1; s.lubes[0].seaRate = 60; s.lubes[0].reserveRate = 60;
  assert.equal(autoStartDecision(defaultProgress(), 'setup', GUIDE_STEPS.setup, s), 'mark-done');
  s.lubes[1].seaRate = 5;  // a make-up with no reserve typed yet -> the guide asks for it
  assert.equal(autoStartDecision(defaultProgress(), 'setup', GUIDE_STEPS.setup, s), 'start');
});
ok('Ports v1.81: first-port steps (ETA, distance, speed, stay, UTC) appear with one port and never block', () => {
  const s = mkState(), ids = ['p1-eta', 'p1-distance', 'p1-speed', 'p1-stay', 'p1-utc'];
  optIds('voyage', ids);
  for (const id of ids) assert.equal(applicable(step('voyage', id), s), false, id + ' hidden with no port');
  s.route.push({ port: 'Manila' });
  for (const id of ids) { assert.equal(applicable(step('voyage', id), s), true, id); assert.equal(chk('voyage', id, s), true, id); }
  assert.equal(step('voyage', 'p1-eta').sel, '[data-route-index="0"][data-field="eta"]');
  assert.equal(step('voyage', 'p1-stay').sel, '[data-route-index="0"][data-field="portStayDays"]');
  assert.equal(step('voyage', 'p1-utc').sel, '[data-route-index="0"][data-field="utcOffset"]');
  const order = GUIDE_STEPS.voyage.map(x => x.id); assert.ok(order.indexOf('p1-name') < order.indexOf('p1-eta') && order.indexOf('p1-utc') < order.indexOf('add-second'));
});
ok('Ports v1.81: anchor/drift and port-stay-hours for port 2 are optional and only apply with two ports', () => {
  const s = mkState(), ids = ['p2-anchor-days', 'p2-anchor-hours', 'p2-stay-hours'];
  optIds('voyage', ids); s.route.push({ port: 'Manila' });
  for (const id of ids) assert.equal(applicable(step('voyage', id), s), false, id);
  s.route.push({ port: 'Singapore' });
  for (const id of ids) { assert.equal(applicable(step('voyage', id), s), true, id); assert.equal(chk('voyage', id, s), true, id); }
  assert.equal(step('voyage', 'p2-anchor-days').sel, '[data-route-index="1"][data-field="anchorStayDays"]');
  assert.equal(step('voyage', 'p2-anchor-hours').sel, '[data-route-index="1"][data-field="anchorStayHours"]');
  assert.equal(step('voyage', 'p2-stay-hours').sel, '[data-route-index="1"][data-field="portStayHours"]');
  assert.equal(chk('voyage', 'p2-stay', s), false);       // the required stay step is unchanged
});
ok('Ports v1.81: fuel-oil-in-use step only with Setup mode "both"', () => {
  const s = mkState(); s.route = [{ port: 'A' }, { port: 'B' }];
  const st = step('voyage', 'fo-leg'); assert.equal(st.optional, true);
  assert.equal(applicable(st, s), false); s.fuels[0].foMode = 'hfo'; assert.equal(applicable(st, s), false);
  s.fuels[0].foMode = 'both'; assert.equal(applicable(st, s), true); assert.equal(st.sel, '[data-route-index="1"][data-field="foActiveFuel"]');
  s.route = [{ port: 'A' }]; assert.equal(applicable(st, s), false);
});
const laterStayIndexForTest = s => s.route.findIndex((r, i) => i >= 2 && !((Number(r.portStayDays) || 0) * 24 + (Number(r.portStayHours) || 0) > 0));
ok('Ports v1.81: stay / UTC step for later ports points at the first port with no stay', () => {
  const s = mkState(), st = step('voyage', 'legs-stay'); assert.equal(st.optional, true);
  s.route = [{ port: 'A' }, { port: 'B', portStayDays: 1 }]; assert.equal(applicable(st, s), false);
  s.route.push({ port: 'C' }, { port: 'D', portStayDays: 1 });
  assert.equal(applicable(st, s), true); assert.equal(st.sel(s), '[data-route-index="2"][data-field="portStayDays"]');
  s.route[2].portStayHours = 5; assert.equal(laterStayIndexForTest(s), -1);
  assert.equal(st.sel(s), '[data-route-index="3"][data-field="utcOffset"]');       // all have a stay -> check the last UTC offset
  assert.equal(chk('voyage', 'legs-stay', s), true);
});
ok('Ports v1.81: the three links and the move / remove steps are optional and point at real elements', () => {
  optIds('voyage', ['p-override', 'p-bunker-link', 'p-eca-link', 'p-move', 'p-remove']);
  const s = mkState(); s.route = [{ port: 'A' }];
  assert.equal(step('voyage', 'p-override').sel(s), '[data-route-card="0"] details.cons-override summary');   // one port -> its own card
  assert.equal(step('voyage', 'p-bunker-link').sel(s), '[data-route-card="0"] .cross-tab-links [data-goto-tab="bunkering"]');
  assert.equal(step('voyage', 'p-eca-link').sel(s), '[data-route-card="0"] .cross-tab-links [data-goto-tab="eca"]');
  assert.equal(applicable(step('voyage', 'p-move'), s), false); assert.equal(applicable(step('voyage', 'p-remove'), s), false);
  s.route.push({ port: 'B' });
  assert.equal(step('voyage', 'p-override').sel(s), '[data-route-card="1"] details.cons-override summary');   // two or more -> the second port
  assert.equal(step('voyage', 'p-bunker-link').sel(s), '[data-route-card="1"] .cross-tab-links [data-goto-tab="bunkering"]');
  assert.ok(step('voyage', 'p-move').sel(s).includes('data-move-route')); assert.equal(step('voyage', 'p-remove').sel, '[data-route-card="1"] [data-remove-route]');
  for (const id of ['p-override', 'p-bunker-link', 'p-eca-link', 'p-move', 'p-remove']) assert.equal(chk('voyage', id, s), true, id);
});
ok('Ports v1.81: the "legs" step still gates the tab and the link steps come after it', () => {
  const ids = GUIDE_STEPS.voyage.map(x => x.id), at = id => ids.indexOf(id);
  for (const id of ['legs-stay', 'p-override', 'p-bunker-link', 'p-eca-link', 'p-move', 'p-remove']) assert.ok(at(id) > at('legs'), id);
  assert.ok(at('p-bunker-link') < at('p-eca-link'));
  const s = mkState(); s.route = [{ port: 'Manila' }, { port: 'Singapore', distanceNm: 1500, speedKn: 12, portStayDays: 1 }];
  assert.equal(stepsPass(GUIDE_STEPS.voyage, s), true);                                                        // new optional steps do not break existing routes
  assert.equal(autoStartDecision(defaultProgress(), 'voyage', GUIDE_STEPS.voyage, s), 'mark-done');
});


/* ---- v1.82 (chunk 3): Tanks tab ---- */
const withDoc = (open, shown, fn) => {   // mock the few DOM calls the popup-aware selectors use
  const prev = globalThis.document;
  globalThis.document = { querySelector: q => (open.some(id => q === `#${id}:not([hidden])`) || (q === '#tankSavePort' && open.includes('tankSavePort')) ? {} : null), getElementById: id => (shown.includes(id) ? { closest: () => null } : null) };
  try { return fn(); } finally { if (prev === undefined) delete globalThis.document; else globalThis.document = prev; }
};
ok('popupField walks a popup: first shown field not yet visited, the last one stays', () => {
  const order = ['a', 'b', 'c', 'go'], all = () => true, t = new Set();
  assert.equal(popupField(order, t, all), 'a'); t.add('a'); assert.equal(popupField(order, t, all), 'b');
  t.add('b'); t.add('c'); assert.equal(popupField(order, t, all), 'go'); t.add('go'); assert.equal(popupField(order, t, all), 'go');
  assert.equal(popupField(order, new Set(['a']), id => id !== 'b'), 'c');            // hidden fields are skipped
  assert.equal(popupField([], new Set(), all), ''); assert.equal(popupField(order, undefined), 'a');
});
ok('Tanks v1.82: the add-tank step points at the + Tank button, then walks the popup fields', () => {
  const st = step('tanks', 'fo-tank'), s = mkState();
  assert.equal(st.sel(s), '[data-add-tank="fo"]');                                   // no popup (no document in node)
  assert.deepEqual(ADD_TANK_ORDER, ['addTankRole', 'addTankDensity', 'addTankFuelType', 'addTankPosition', 'addTankConfirm']);
  withDoc(['addTankModal'], ['addTankRole', 'addTankDensity', 'addTankFuelType', 'addTankPosition', 'addTankConfirm'], () => {
    assert.equal(st.sel(s, new Set()), '#addTankRole');
    assert.equal(st.sel(s, new Set(['addTankRole'])), '#addTankDensity');
    assert.equal(st.sel(s, new Set(['addTankRole', 'addTankDensity'])), '#addTankFuelType');
    assert.equal(st.sel(s, new Set(['addTankRole', 'addTankDensity', 'addTankFuelType', 'addTankPosition'])), '#addTankConfirm');
  });
  withDoc(['addTankModal'], ['addTankRole', 'addTankPosition', 'addTankConfirm'], () => {   // a lube tank: no density / fuel type boxes
    const c = step('tanks', 'cyl-tank'); assert.equal(c.sel(s, new Set(['addTankRole'])), '#addTankPosition');
  });
  assert.match(st.text, /density/); assert.match(step('tanks', 'cyl-tank').text, /role/); assert.ok(!/density/.test(step('tanks', 'cyl-tank').text));
});
ok('Tanks v1.82: company maximum fill step is optional, comes first; its popup goes input -> Save', () => {
  const st = step('tanks', 'maxfill'), s = mkState(); assert.equal(st.optional, true); assert.equal(chk('tanks', 'maxfill', s), true);
  assert.equal(st.sel(s), '[data-change-maxfill]');
  withDoc(['maxFillModal'], [], () => { assert.equal(st.sel(s, new Set()), '#maxFillInput'); assert.equal(st.sel(s, new Set(['maxFillInput'])), '#maxFillSave'); });
  assert.equal(GUIDE_STEPS.tanks[0].id, 'maxfill');
});
ok('Tanks v1.82: noon report offset / Today button and every logbook ROB box have a step', () => {
  const ids = { 'noon-now': '#noonLocalNow', 'noon-offset': '#noonUtcOffset', 'noon-lube': '#noonRobCyl', 'noon-mesys': '#noonRobMesys', 'noon-gesys': '#noonRobGesys', 'noon-fw': '#noonRobFw', 'noon-dw': '#noonRobDw' };
  const s = mkState(); s.meta.noonRob = {};
  for (const [id, sel] of Object.entries(ids)) { assert.equal(step('tanks', id).sel, sel, id); assert.equal(step('tanks', id).optional, true, id); assert.equal(chk('tanks', id, s), true, id); }
  assert.equal(applicable(step('tanks', 'noon-mesys'), s), false); assert.equal(applicable(step('tanks', 'noon-gesys'), s), false);
  s.lubes[1].seaRate = 4; s.lubes[2].seaRate = 6;
  assert.equal(applicable(step('tanks', 'noon-mesys'), s), true); assert.equal(applicable(step('tanks', 'noon-gesys'), s), true);
  assert.equal(applicable(step('tanks', 'noon-fw'), s), true);
  const order = GUIDE_STEPS.tanks.map(x => x.id); assert.ok(order.indexOf('noon-date') < order.indexOf('noon-now') && order.indexOf('noon-offset') < order.indexOf('noon-fo'));
});
ok('Tanks v1.82: fuel type, sulphur, enter-ROB-as, temperature and density follow the first fuel tank', () => {
  const s = mkState(); s.meta.noonRob = { fo: 100 }; s.tanks = [tk({ name: 'A', capacity: 400, rob: 100, capUnit: 'volume' })];
  for (const id of ['fo-fueltype', 'fo-sulphur', 'fo-robas', 'fo-temp', 'fo-density']) { assert.equal(applicable(step('tanks', id), s), true, id); assert.equal(step('tanks', id).optional, true, id); assert.equal(chk('tanks', id, s), true, id); }
  assert.equal(step('tanks', 'fo-fueltype').sel(s), '[data-mp="tank"][data-tank-index="0"]');
  assert.equal(step('tanks', 'fo-sulphur').sel(s), '[data-tank-index="0"][data-field="sulphur"]');
  assert.equal(step('tanks', 'fo-robas').sel(s), '[data-tank-index="0"][data-field="robInput"]');
  assert.equal(step('tanks', 'fo-temp').sel(s), '[data-tank-index="0"][data-field="robTempC"]');
  assert.equal(step('tanks', 'fo-density').sel(s), '[data-tank-index="0"][data-field="density"]');
  s.tanks[0].robInput = 'mt'; assert.equal(applicable(step('tanks', 'fo-temp'), s), false);       // weight entry: no temperature box
  s.tanks[0].capUnit = 'weight'; for (const id of ['fo-robas', 'fo-density']) assert.equal(applicable(step('tanks', id), s), false, id);
  assert.equal(applicable(step('tanks', 'do-fueltype'), s), false); s.fuels[1].seaRate = 1; s.tanks.push(tk({ group: 'do', capacity: 50, rob: 5 }));
  assert.equal(applicable(step('tanks', 'do-fueltype'), s), true); assert.equal(step('tanks', 'do-fueltype').sel(s), '[data-mp="tank"][data-tank-index="1"]');
});
ok('Tanks v1.82: the ROB step highlights the typed ROB or the corrected-volume box', () => {
  const s = mkState(); s.tanks = [tk({ capacity: 400 })]; const q = step('tanks', 'fo-rob').sel(s);
  assert.ok(q.includes('data-field="rob"') && q.includes('data-field="robVolumeM3"'));
});
ok('Tanks v1.82: role, name, consume-automatically, additive dosage, move and remove are one-time optional steps', () => {
  const s = mkState(); for (const id of ['tank-role', 'tank-name', 'tank-consume', 'tank-additive', 'tank-order', 'tank-remove']) { assert.equal(applicable(step('tanks', id), s), false, id + ' hidden with no tank'); assert.equal(step('tanks', id).optional, true, id); }
  s.tanks = [tk({ capacity: 400, rob: 100 })];
  for (const id of ['tank-role', 'tank-name', 'tank-consume', 'tank-remove']) { assert.equal(applicable(step('tanks', id), s), true, id); assert.equal(chk('tanks', id, s), true, id); }
  assert.equal(step('tanks', 'tank-role').sel(s), '[data-tank-index="0"][data-field="category"]');
  assert.ok(step('tanks', 'tank-name').sel(s).includes('namePreset') && step('tanks', 'tank-name').sel(s).includes('data-field="name"'));
  assert.equal(step('tanks', 'tank-consume').sel(s), '[data-tank-index="0"][data-field="consumable"]');
  assert.equal(step('tanks', 'tank-remove').sel(s), '[data-remove-tank="0"]');
  assert.equal(applicable(step('tanks', 'tank-order'), s), false); s.tanks.push(tk({ capacity: 300, rob: 50, sequence: 2 }));
  assert.equal(applicable(step('tanks', 'tank-order'), s), true); assert.equal(step('tanks', 'tank-order').sel(s), '[data-move-order="0"]');
  assert.equal(applicable(step('tanks', 'tank-additive'), s), false); s.stores = { additives: [{ id: 'ad1' }] };
  assert.equal(applicable(step('tanks', 'tank-additive'), s), true); assert.equal(step('tanks', 'tank-additive').sel(s), `[data-st-dose="${s.tanks[0].id}"]`);
  assert.match(step('tanks', 'tank-role').text, /[Ss]ettling/); assert.match(step('tanks', 'tank-role').text, /service/);
  s.tanks = [tk({ category: 'settling', capacity: 50 })]; assert.equal(step('tanks', 'tank-role').sel(s), '[data-tank-index="0"][data-field="category"]');
});
ok('Tanks v1.82: water steps appear as tanks are added and never block', () => {
  const s = mkState(); const ids = ['water-name', 'water-cap', 'water-rob', 'water-fw-rate', 'water-dw-rate', 'water-fwg', 'water-fwg-tank', 'water-draw'];
  for (const id of ['water-add-fw', 'water-add-dw', ...ids, 'save-date', 'save-now', 'save-zone-mode', 'save-zone']) assert.equal(step('tanks', id).optional, true, id);
  assert.equal(step('tanks', 'water-add-fw').sel, '[data-st-addwt="fw"]'); assert.equal(step('tanks', 'water-add-dw').sel, '[data-st-addwt="dw"]');
  assert.equal(hasWaterTank(s), false); for (const id of ids) assert.equal(applicable(step('tanks', id), s), false, id);
  s.stores = { water: { tanks: [{ id: 'w1', type: 'fw' }], rates: {}, fwg: {} } };
  for (const id of ['water-name', 'water-cap', 'water-rob', 'water-fw-rate', 'water-fwg']) assert.equal(applicable(step('tanks', id), s), true, id);
  for (const id of ['water-dw-rate', 'water-fwg-tank', 'water-draw']) assert.equal(applicable(step('tanks', id), s), false, id);
  s.stores.water.tanks.push({ id: 'w2', type: 'fw' }, { id: 'w3', type: 'dw' });
  for (const id of ['water-dw-rate', 'water-fwg-tank', 'water-draw']) assert.equal(applicable(step('tanks', id), s), true, id);
  assert.equal(step('tanks', 'water-draw').sel(s), '[data-st-sel="draw:fw"]');
  s.stores.water.tanks = [{ id: 'a', type: 'dw' }, { id: 'b', type: 'dw' }]; assert.equal(step('tanks', 'water-draw').sel(s), '[data-st-sel="draw:dw"]');
  assert.equal(step('tanks', 'water-cap').sel, '[data-st-wt][data-st-f="capacity"]'); assert.equal(step('tanks', 'water-fwg').sel, '[data-st-fwg="day"]'); assert.equal(step('tanks', 'water-fw-rate').sel, '[data-st-rate="fw"]');
  for (const id of ids) assert.equal(chk('tanks', id, s), true, id);
});
ok('Tanks v1.82: save-condition steps cover date, Today, zone mode and zone, then the Save button', () => {
  assert.equal(step('tanks', 'save-date').sel, '#tankSaveAt'); assert.equal(step('tanks', 'save-now').sel, '[data-tank-save-now]');
  assert.equal(step('tanks', 'save-zone-mode').sel, '[data-tank-zone-mode="offset"]');
  assert.equal(step('tanks', 'save-zone').sel(), '#tankSaveOffset');
  withDoc(['tankSavePort'], [], () => assert.equal(step('tanks', 'save-zone').sel(), '#tankSavePort'));
  const order = GUIDE_STEPS.tanks.map(x => x.id), at = id => order.indexOf(id);
  assert.ok(at('water-draw') < at('save-date') && at('save-date') < at('save-now') && at('save-zone') < at('save-condition') && at('save-condition') === order.length - 1);
});
ok('Tanks v1.82: the new optional steps leave required gating alone (existing lists stay done, fresh vessels start)', () => {
  const s = mkState(); s.meta.noonRob = {}; assert.equal(autoStartDecision(defaultProgress(), 'tanks', GUIDE_STEPS.tanks, s), 'start');
  s.meta.noonRob = { fo: 300 }; s.tanks = [tk({ capacity: 400, rob: 300 })];
  assert.equal(autoStartDecision(defaultProgress(), 'tanks', GUIDE_STEPS.tanks, s), 'mark-done');
  const req = GUIDE_STEPS.tanks.filter(x => !x.optional).map(x => x.id);
  for (const id of ['maxfill', 'noon-now', 'tank-role', 'water-cap', 'save-zone', 'fo-fueltype', 'fo-density']) assert.ok(!req.includes(id), id);
});

ok('Bunkering v1.83: fuel type and sulphur steps point at the first fuel bunker (else the first bunker port) and never block', () => {
  const s = mkState(); s.route = [{ port: 'Manila' }, { port: 'Singapore' }];
  assert.equal(step('bunkering', 'bk-fueltype').sel(s), 'select[data-mp="bunker"][data-bunker-route="0"][data-bunker-fuel="fo"]');
  assert.equal(step('bunkering', 'bk-sulphur').sel(s), '[data-bunker-route="0"][data-bunker-fuel="fo"][data-bunker-field="sulphur"]');
  s.route[1].bunkers = { cyl: { quantity: 200 }, do: { quantity: 40 } };
  assert.equal(step('bunkering', 'bk-fueltype').sel(s), 'select[data-mp="bunker"][data-bunker-route="1"][data-bunker-fuel="do"]');
  assert.equal(step('bunkering', 'bk-sulphur').sel(s), '[data-bunker-route="1"][data-bunker-fuel="do"][data-bunker-field="sulphur"]');
  for (const id of ['bk-fueltype', 'bk-sulphur', 'bk-proposed', 'bk-auto', 'bk-entry']) { assert.ok(step('bunkering', id).optional, id); assert.equal(typeof step('bunkering', id).okMsg, 'string', id); }
  assert.equal(applicable(step('bunkering', 'bk-fueltype'), { route: [] }), false);
});
ok('Bunkering v1.83: Use this needs a tank; Auto-allocate and tank-by-tank steps need a planned total', () => {
  const s = mkState(); s.route = [{ port: 'Manila' }, { port: 'Singapore' }];
  assert.equal(applicable(step('bunkering', 'bk-proposed'), s), false);
  s.tanks = [tk({ capacity: 400 })]; assert.equal(applicable(step('bunkering', 'bk-proposed'), s), true);
  assert.equal(step('bunkering', 'bk-proposed').sel(s), '[data-use-proposed="0:fo"]');
  s.route[1].bunkers = { fo: { entryMode: 'tanks', allocations: [{ tankId: 'a', quantity: 10 }] } };   // typed tank by tank: the Use this button is hidden
  assert.equal(applicable(step('bunkering', 'bk-proposed'), s), false);
  s.route[1].bunkers.do = { quantity: 20, autoAllocate: true }; assert.equal(applicable(step('bunkering', 'bk-proposed'), s), true); assert.equal(step('bunkering', 'bk-proposed').sel(s), '[data-use-proposed="1:do"]');
  s.route[1].bunkers = {};
  assert.equal(applicable(step('bunkering', 'bk-auto'), s), false); assert.equal(applicable(step('bunkering', 'bk-entry'), s), false);
  s.route[1].bunkers = { fo: { quantity: 500, autoAllocate: true } };
  assert.equal(applicable(step('bunkering', 'bk-auto'), s), true); assert.equal(applicable(step('bunkering', 'bk-entry'), s), true);
  assert.equal(step('bunkering', 'bk-auto').sel(s), '[data-bunker-route="1"][data-bunker-fuel="fo"][data-bunker-field="autoAllocate"]');
  assert.equal(step('bunkering', 'bk-entry').sel(s), '[data-alloc-route="1"][data-alloc-fuel="fo"]');
  s.route[1].bunkers.fo = { entryMode: 'tanks', allocations: [{ tankId: 'a', quantity: 10 }] };   // typed tank by tank: no Auto-allocate box on screen
  assert.equal(applicable(step('bunkering', 'bk-auto'), s), false); assert.equal(applicable(step('bunkering', 'bk-entry'), s), true);
});
ok('Bunkering v1.83: lube steps follow the products Setup uses; drums show the pump-over panel', () => {
  const s = mkState(); s.route = [{ port: 'Manila' }, { port: 'Singapore' }];
  for (const id of ['bk-mode', 'bk-lube-cyl', 'bk-lube-mesys', 'bk-lube-gesys']) assert.equal(applicable(step('bunkering', id), s), false, id);
  s.lubes[0].seaRate = 40; s.lubes[2].seaRate = 5;
  assert.equal(applicable(step('bunkering', 'bk-mode'), s), true); assert.equal(applicable(step('bunkering', 'bk-lube-cyl'), s), true);
  assert.equal(applicable(step('bunkering', 'bk-lube-mesys'), s), false); assert.equal(applicable(step('bunkering', 'bk-lube-gesys'), s), true);
  assert.equal(step('bunkering', 'bk-mode').sel(s), '[data-bunker-route="0"][data-bunker-fuel="cyl"][data-bunker-field="mode"]');
  assert.equal(step('bunkering', 'bk-lube-gesys').sel(s), '[data-bunker-route="0"][data-bunker-fuel="gesys"][data-bunker-field="quantity"]');
  s.route[1].bunkers = { gesys: { quantity: 300 } }; assert.equal(step('bunkering', 'bk-lube-gesys').sel(s), '[data-bunker-route="1"][data-bunker-fuel="gesys"][data-bunker-field="quantity"]');
  assert.equal(applicable(step('bunkering', 'bk-drums'), s), false);
  s.route[1].bunkers = { cyl: { mode: 'drums', quantity: 400, autoAllocate: false } };
  assert.equal(applicable(step('bunkering', 'bk-drums'), s), true); assert.equal(step('bunkering', 'bk-drums').sel(s), '[data-drum-panel="1:cyl"]');
  assert.equal(step('bunkering', 'bk-mode').sel(s), '[data-bunker-route="1"][data-bunker-fuel="cyl"][data-bunker-field="mode"]');
});
ok('Bunkering v1.83: additive line, condition bars and Delete entry point at real elements', () => {
  const s = mkState(); s.route = [{ port: 'Manila' }, { port: 'Singapore', bunkers: { fo: { quantity: 500 } } }];
  assert.equal(applicable(step('bunkering', 'bk-addline'), s), false);
  s.stores = { additives: [{ id: 'ad1', name: 'Treat', rob: 50, dose: 0.5, fuel: 'fo' }] };
  assert.equal(applicable(step('bunkering', 'bk-addline'), s), true); assert.equal(step('bunkering', 'bk-addline').sel(s), '[data-add-line="1:fo"]');
  assert.equal(step('bunkering', 'bk-cond').sel(s), '[data-bunker-cond="1:fo"]'); assert.equal(step('bunkering', 'bk-delete').sel(s), '[data-delete-bunkering="1"]');
  s.route[1].bunkers = {}; assert.equal(step('bunkering', 'bk-cond').sel(s), '[data-bunker-cond="0:fo"]'); assert.equal(step('bunkering', 'bk-delete').sel(s), '[data-delete-bunkering="0"]');
  assert.equal(applicable(step('bunkering', 'bk-addline'), s), false);
});
ok('Bunkering v1.83: Fuel additives panel steps appear as additives are added and point at the first one that needs a value', () => {
  const s = mkState(); s.route = [{ port: 'Manila' }];
  assert.equal(applicable(step('bunkering', 'bk-ad-add'), s), true); assert.equal(step('bunkering', 'bk-ad-add').sel, '[data-st-addad]');
  const adIds = ['bk-ad-name', 'bk-ad-treats', 'bk-ad-rob', 'bk-ad-dose', 'bk-ad-remove'];
  for (const id of adIds) assert.equal(applicable(step('bunkering', id), s), false, id);
  s.stores = { additives: [{ id: 'ad1', name: 'Treat', rob: 50, dose: 0.5, fuel: 'fo' }, { id: 'ad2', name: '', rob: 0, dose: 0, fuel: 'do' }] };
  for (const id of adIds) assert.equal(applicable(step('bunkering', id), s), true, id);
  assert.equal(step('bunkering', 'bk-ad-name').sel(s), '[data-st-ad="ad2"][data-st-f="name"]');
  assert.equal(step('bunkering', 'bk-ad-rob').sel(s), '[data-st-ad="ad2"][data-st-f="rob"]');
  assert.equal(step('bunkering', 'bk-ad-dose').sel(s), '[data-st-ad="ad2"][data-st-f="dose"]');
  assert.equal(step('bunkering', 'bk-ad-treats').sel(s), '[data-st-sel="adfuel:ad2"]'); assert.equal(step('bunkering', 'bk-ad-remove').sel(s), '[data-st-delad="ad2"]');
  s.stores.additives[1] = { id: 'ad2', name: 'B', rob: 5, dose: 1, fuel: 'do' }; assert.equal(step('bunkering', 'bk-ad-rob').sel(s), '[data-st-ad="ad1"][data-st-f="rob"]');
  for (const id of ['bk-ad-add', ...adIds]) { assert.ok(step('bunkering', id).optional, id); assert.equal(chk('bunkering', id, s), true, id); }
});
ok('Bunkering v1.83: order follows the screen and the new optional steps leave required gating alone', () => {
  const order = GUIDE_STEPS.bunkering.map(x => x.id), at = id => order.indexOf(id);
  assert.ok(at('bk-fueltype') < at('bk-sulphur') && at('bk-sulphur') < at('bk-qty') && at('bk-qty') < at('bk-proposed') && at('bk-proposed') < at('bk-auto') && at('bk-auto') < at('bk-entry') && at('bk-entry') < at('bk-alloc'));
  assert.ok(at('bk-alloc') < at('bk-mode') && at('bk-mode') < at('bk-drums') && at('bk-drums') < at('bk-lube-cyl') && at('bk-lube-gesys') < at('bk-addline') && at('bk-delete') < at('bk-ad-add') && at('bk-ad-add') < at('bk-ad-remove'));
  assert.deepEqual(GUIDE_STEPS.bunkering.filter(x => !x.optional).map(x => x.id), ['bk-alloc']);
  const s = mkState(); s.route = [{ port: 'Manila' }, { port: 'Singapore' }];
  assert.equal(autoStartDecision(defaultProgress(), 'bunkering', GUIDE_STEPS.bunkering, s), 'start');
  s.route[1].bunkers = { fo: { quantity: 500, autoAllocate: true } }; s.stores = { additives: [{ id: 'a', name: 'x', rob: 1, dose: 1, fuel: 'fo' }] };
  assert.equal(autoStartDecision(defaultProgress(), 'bunkering', GUIDE_STEPS.bunkering, s), 'mark-done');
});

const E1 = '[data-eca="1"][data-eca-dir="entering"]';
ok('ECA v1.84: previous-port distance, method and the two fuel pickers belong to the entering port and never block', () => {
  const s = mkState(); s.route = [ecaPort(false), ecaPort(true), ecaPort(true), ecaPort(false)];
  assert.equal(step('eca', 'eca-prev').sel(s), '[data-eca-port="1"][data-eca-pfield="prevToLineNm"]');
  assert.equal(step('eca', 'eca-method').sel(s), E1 + '[data-eca-field="method"]');
  assert.equal(step('eca', 'eca-fromfuel').sel(s), 'select[data-mp="eca"]' + E1 + '[data-eca-field="fromFuel"]');
  assert.equal(step('eca', 'eca-tofuel').sel(s), 'select[data-mp="eca"]' + E1 + '[data-eca-field="toFuel"]');
  for (const id of ['eca-prev', 'eca-method', 'eca-fromfuel', 'eca-tofuel']) { assert.equal(applicable(step('eca', id), s), true, id); assert.ok(step('eca', id).optional && typeof step('eca', id).okMsg === 'string', id); assert.equal(chk('eca', id, s), true, id); }
  s.route = [ecaPort(false), ecaPort(false)]; for (const id of ['eca-prev', 'eca-method', 'eca-fromfuel', 'eca-tofuel']) assert.equal(applicable(step('eca', id), s), false, id);
});
ok('ECA v1.84: system steps skip switched-off systems and point at the first one still missing a value', () => {
  const s = mkState(); s.route = [ecaPort(false), ecaPort(true)];
  assert.equal(step('eca', 'eca-sys-on').sel(s), E1 + '[data-eca-sys="me"][data-eca-field="on"]');
  assert.equal(step('eca', 'eca-rate').sel(s), E1 + '[data-eca-sys="me"][data-eca-field="rate"]');
  s.route[1].eca.entering = { enabled: true, me: { rate: 1.2, qty: 5 }, ae: { on: false }, boiler: {} };
  assert.equal(step('eca', 'eca-rate').sel(s), E1 + '[data-eca-sys="boiler"][data-eca-field="rate"]');
  assert.equal(step('eca', 'eca-qtyunit').sel(s), E1 + '[data-eca-sys="boiler"][data-eca-field="qtyUnit"]');
  assert.equal(step('eca', 'eca-qty').sel(s), E1 + '[data-eca-sys="boiler"][data-eca-field="qty"]');
  s.route[1].eca.entering.boiler = { qtyUnit: 'L' }; assert.equal(step('eca', 'eca-qty').sel(s), E1 + '[data-eca-sys="boiler"][data-eca-field="qtyL"]');
  s.route[1].eca.entering = { enabled: true, me: { on: false }, ae: { on: false }, boiler: { on: false } };
  for (const id of ['eca-rate', 'eca-qtyunit', 'eca-qty']) assert.equal(applicable(step('eca', id), s), false, id);
  assert.equal(applicable(step('eca', 'eca-sys-on'), s), true);
  assert.equal(step('eca', 'eca-result').sel(s), '[data-eca-slot="1:entering"]');
});
ok('ECA v1.84: leaving steps follow the leaving port; the target box only exists for the mixing model', () => {
  const s = mkState(); s.route = [ecaPort(false), ecaPort(true), ecaPort(true), ecaPort(false)];
  const L = '[data-eca="2"][data-eca-dir="leaving"]';
  assert.equal(step('eca', 'eca-leave-from').sel(s), L + '[data-eca-field="fromSulphurPct"]'); assert.equal(step('eca', 'eca-leave-to').sel(s), L + '[data-eca-field="toSulphurPct"]');
  assert.equal(step('eca', 'eca-leave-result').sel(s), '[data-eca-slot="2:leaving"]');
  assert.equal(applicable(step('eca', 'eca-leave-limit'), s), true);   // resume sulphur not typed yet: mixing model
  s.route[2].eca.leaving = { enabled: true, fromSulphurPct: 0.1, toSulphurPct: 0.5 }; assert.equal(leaveFixed(s.route[2].eca.leaving), true); assert.equal(applicable(step('eca', 'eca-leave-limit'), s), false);
  s.route[2].eca.leaving.toSulphurPct = 2.5; assert.equal(leaveFixed(s.route[2].eca.leaving), false); assert.equal(applicable(step('eca', 'eca-leave-limit'), s), true);
  s.route[2].eca.leaving = { enabled: true, fromSulphurPct: 0.1, toSulphurPct: 0.5, leaveMode: 'fobas' }; assert.equal(leaveFixed(s.route[2].eca.leaving), false);
  assert.equal(step('eca', 'eca-leave-limit').sel(s), L + '[data-eca-field="limitPct"]');
  s.route = [ecaPort(false), ecaPort(true), ecaPort(false)]; s.route[1].eca.entering = { enabled: true }; delete s.route[1].eca.leaving;
  for (const id of ['eca-leave-from', 'eca-leave-to', 'eca-leave-limit', 'eca-leave-result']) assert.equal(applicable(step('eca', id), s), true, id);
});
ok('ECA v1.84: order follows the card and only the three original steps can block Next', () => {
  const order = GUIDE_STEPS.eca.map(x => x.id), at = id => order.indexOf(id);
  assert.ok(at('eca-port') < at('eca-prev') && at('eca-prev') < at('eca-dist') && at('eca-dist') < at('eca-method') && at('eca-method') < at('eca-fromfuel') && at('eca-fromfuel') < at('eca-tofuel') && at('eca-tofuel') < at('eca-from'));
  assert.ok(at('eca-limit') < at('eca-sys-on') && at('eca-sys-on') < at('eca-rate') && at('eca-rate') < at('eca-qtyunit') && at('eca-qtyunit') < at('eca-qty') && at('eca-qty') < at('eca-result') && at('eca-result') < at('eca-exit') && at('eca-exit') < at('eca-leave-from') && at('eca-leave-result') === order.length - 1);
  const req = GUIDE_STEPS.eca.filter(x => !x.optional).map(x => x.id); assert.deepEqual(req, ['eca-dist', 'eca-from', 'eca-to']);
  const s = mkState(); s.route = [ecaPort(false), ecaPort(false)]; assert.equal(autoStartDecision(defaultProgress(), 'eca', GUIDE_STEPS.eca, s), 'start');
});

/* ---- v1.85 (chunk 5): Home popups, Results and the "save before you finish" gate ---- */
const withStore = (saved, fn) => {   // fake localStorage holding `saved` voyages
  const store = { 'bunker-saved-voyages-v1': JSON.stringify(Array.from({ length: saved }, (_, i) => ({ id: 'v' + i, name: 'x' }))) };
  globalThis.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } };
  try { return fn(); } finally { delete globalThis.localStorage; }
};
const GATE = { id: 'g', title: 'G', text: '', ask: { gate: true, count: s => s.saved, question: () => 'saved?', yesLabel: 'Yes', noLabel: 'Not yet', yesHint: 'go save' } };
ok('Gate ask (v1.85): Yes confirms and unlocks Next, Not yet keeps the question, a new save brings it back', () => {
  const st = { saved: 1 }, p0 = defaultProgress();
  assert.equal(askInfo(GATE, p0.asks, { saved: 0 }, 'results'), null);                              // nothing saved yet: nothing to confirm
  assert.equal(askInfo(GATE, p0.asks, st, 'results').pending, true);
  assert.equal(evalStep(GATE, st, { asks: p0.asks }).ok, false);                                    // live card: blocked until confirmed
  assert.equal(evalStep(GATE, st, {}).ok, true);                                                    // silent rules never wait for an answer
  const notYet = answerAsk(p0, 'results', GATE, st, false);                                         // the "Not yet" button (more = false)
  assert.equal(askInfo(GATE, notYet.asks, st, 'results').pending, true);
  const yes = answerAsk(notYet, 'results', GATE, st, true);                                         // the "Yes, both are saved" button
  assert.equal(askInfo(GATE, yes.asks, st, 'results').pending, false);
  assert.equal(evalStep(GATE, st, { asks: yes.asks }).ok, true);
  assert.equal(askInfo(GATE, yes.asks, { saved: 2 }, 'results').pending, true);                     // another save: confirm again
  const NORMAL = { id: 'n', title: 'N', text: '', ask: { count: s => s.saved, question: () => 'more?' } };   // ordinary asks keep their meaning
  assert.equal(askInfo(NORMAL, answerAsk(p0, 'tanks', NORMAL, st, false).asks, st, 'tanks').pending, false);
  assert.equal(askInfo(NORMAL, answerAsk(p0, 'tanks', NORMAL, st, true).asks, st, 'tanks').pending, true);
});
ok('Gate ask (v1.85): the guide cannot finish until the user confirms, and then it finishes', () => {
  const st = { saved: 1 }, steps2 = [{ id: 'first', title: 'F', text: '', optional: true }, GATE];
  let p = startTab(defaultProgress(), 'results', steps2, st);
  let r = advance(p, 'results', steps2, st, { asks: p.asks }); assert.equal(r.result, 'next'); p = r.progress;
  r = advance(p, 'results', steps2, st, { asks: p.asks }); assert.equal(r.result, 'blocked'); assert.match(r.msg, /Answer the question/);
  p = answerAsk(p, 'results', GATE, st, true);
  r = advance(p, 'results', steps2, st, { asks: p.asks }); assert.equal(r.result, 'finished'); assert.equal(tabInfo(r.progress, 'results').status, 'done');
});

ok('Home v1.85: required gating is unchanged; every new step is optional; order follows the plan', () => {
  assert.deepEqual(GUIDE_STEPS.dashboard.filter(x => !x.optional).map(x => x.id), ['home-route']);
  const order = GUIDE_STEPS.dashboard.map(x => x.id), at = id => order.indexOf(id);
  assert.ok(at('home-route') < at('home-bunker') && at('home-bunker') < at('home-plan') && at('home-plan') < at('pb-port'));
  const pbOrder = ['pb-port', 'pb-other', 'pb-until', 'pb-margin', 'pb-fill', 'pb-compare', 'pb-results', 'pb-apply', 'pb-export', 'pb-forms'];
  pbOrder.forEach((id, k) => { if (k) assert.ok(at(pbOrder[k - 1]) < at(id), id); });
  assert.ok(at('pb-forms') < at('home-rob') && at('home-rob') < at('rv-mode') && at('rv-mode') < at('rv-port') && at('rv-port') < at('rv-date') && at('rv-date') < at('rv-goto'));
  assert.ok(at('rv-goto') < at('home-eco') && at('home-eco') < at('home-search') && at('home-search') < at('home-alerts') && at('home-alerts') < at('home-calc'));
  const s = mkState(); s.route = [{ port: 'Manila' }, { port: 'Singapore', distanceNm: 1500, speedKn: 12 }]; s.tanks = [tk({ capacity: 400 })];
  assert.equal(stepsPass(GUIDE_STEPS.dashboard, s), true);
  assert.equal(autoStartDecision(defaultProgress(), 'dashboard', GUIDE_STEPS.dashboard, s), 'mark-done');
  for (const x of GUIDE_STEPS.dashboard) if (x.optional) assert.ok(typeof x.okMsg === 'string' && x.okMsg.length > 0, x.id + ' needs an okMsg');
  assert.equal(new Set(order).size, order.length);
});
ok('Home v1.85: Plan a bunkering steps point at the button until the popup opens, then at its boxes', () => {
  const s = mkState(), sel = (id, touched) => step('dashboard', id).sel(s, touched || new Set());
  withDoc([], [], () => { for (const id of ['pb-port', 'pb-until', 'pb-margin', 'pb-fill', 'pb-compare', 'pb-results', 'pb-apply', 'pb-export', 'pb-other', 'pb-forms']) assert.equal(sel(id), '#planBunkerBtn', id); });
  withDoc(['planBunkerModal'], [], () => {
    assert.equal(sel('pb-port'), '#pbPort'); assert.equal(sel('pb-until'), '#pbUntil'); assert.equal(sel('pb-margin'), '#pbMargin'); assert.equal(sel('pb-fill'), '#pbFill');
    assert.equal(sel('pb-compare'), '#pbCompareBox > summary'); assert.equal(sel('pb-results'), '#pbResults'); assert.equal(sel('pb-apply'), '#pbApply'); assert.equal(sel('pb-export'), '#pbExport');
    assert.equal(sel('pb-other'), '#pbPort');                      // the \"Other port\" boxes are hidden until that choice is made
    assert.equal(sel('pb-forms'), '#pbExport');                    // the tick boxes only exist after Export was tapped
  });
  withDoc(['planBunkerModal'], PB_OTHER_ORDER, () => {             // Other port / date... chosen: walk name, date, offset, stay
    const t = new Set(); const seq = [];
    for (let k = 0; k < PB_OTHER_ORDER.length; k++) { const q = sel('pb-other', t); seq.push(q); t.add(q.slice(1)); }
    assert.deepEqual(seq, PB_OTHER_ORDER.map(id => '#' + id));
  });
  withDoc(['planBunkerModal'], PB_FORM_ORDER, () => {
    const t = new Set(), seq = [];
    for (let k = 0; k < PB_FORM_ORDER.length; k++) { const q = sel('pb-forms', t); seq.push(q); t.add(q.slice(1)); }
    assert.deepEqual(seq, ['#pbFormBunker', '#pbFormLube', '#pbExportGo']);
    assert.equal(sel('pb-forms', t), '#pbExportGo');               // everything visited: the button stays
  });
  assert.equal(step('dashboard', 'home-plan').sel, '#planBunkerBtn');
});
ok('Home v1.85: Tank ROB viewer steps follow the popup and its two modes', () => {
  const s = mkState(), sel = id => step('dashboard', id).sel(s, new Set());
  withDoc([], [], () => { for (const id of ['rv-mode', 'rv-port', 'rv-date', 'rv-goto']) assert.equal(sel(id), '#robViewBtn', id); });
  withDoc(['robViewModal'], ['rvPort'], () => { assert.equal(sel('rv-mode'), '.rv-modes'); assert.equal(sel('rv-port'), '#rvPort'); assert.equal(sel('rv-date'), '[data-rv-mode=\"noon\"]'); assert.equal(sel('rv-goto'), '#rvBody'); });
  withDoc(['robViewModal'], ['rvDate', 'rvGoto'], () => { assert.equal(sel('rv-port'), '[data-rv-mode=\"port\"]'); assert.equal(sel('rv-date'), '#rvDate'); assert.equal(sel('rv-goto'), '#rvGoto'); });
  assert.equal(step('dashboard', 'home-rob').sel, '#robViewBtn');
});
ok('Home v1.85: Change-over Details only for a vessel with an ECA/SECA port; search, bell and calculator point at the top bar', () => {
  const s = mkState(); s.route = [{ port: 'A' }, { port: 'B' }];
  assert.equal(applicable(step('dashboard', 'home-eco'), s), false);
  s.route[1].eca = { port: { enabled: true } }; assert.equal(applicable(step('dashboard', 'home-eco'), s), true);
  assert.equal(step('dashboard', 'home-eco').sel, '#ecoBtn'); assert.equal(step('dashboard', 'home-search').sel, '#searchInput');
  assert.equal(step('dashboard', 'home-alerts').sel, '#alertsBtn'); assert.equal(step('dashboard', 'home-calc').sel, '#calcBtn');
});

ok('Results v1.85: order follows the screen; only saving and the final confirmation can block', () => {
  const order = GUIDE_STEPS.results.map(x => x.id), at = id => order.indexOf(id);
  assert.deepEqual(order, ['res-rob', 'res-docx', 'res-bunkerform', 'res-lubeform', 'res-name', 'res-save', 'res-list', 'res-plan', 'res-final']);
  assert.deepEqual(GUIDE_STEPS.results.filter(x => !x.optional).map(x => x.id), ['res-save', 'res-final']);
  assert.equal(order[order.length - 1], 'res-final');            // the gate is the very last step, so it is the last thing before the guide ends
  assert.ok(at('res-save') < at('res-list'));
  const sels = { 'res-rob': '#robCompare', 'res-docx': '#exportDocx', 'res-bunkerform': '#exportBunkerForm', 'res-lubeform': '#exportLubeForm', 'res-list': '#savedVoyageList' };
  for (const [id, q] of Object.entries(sels)) { assert.equal(step('results', id).sel, q, id); assert.ok(step('results', id).optional && chk('results', id, mkState()), id); }
});
ok('Results v1.85: Load demo / Clear all / New plan point at whichever copy is on screen (side menu on a tablet, Plan panel on a phone)', () => {
  const sel = () => step('results', 'res-plan').sel(mkState());
  const doc = shownIds => ({ querySelector: q => (shownIds.includes(q.slice(1)) ? { getClientRects: () => [{}] } : q.startsWith('#') ? { getClientRects: () => [] } : null) });
  const prev = globalThis.document;
  try {
    globalThis.document = doc(['demoPlan']); assert.equal(sel(), '#demoPlan');                    // tablet / desktop
    globalThis.document = doc(['demoPlan2']); assert.equal(sel(), '#demoPlan2');                  // phone: the side menu is display:none
    globalThis.document = undefined; assert.equal(sel(), '#demoPlan2');
  } finally { if (prev === undefined) delete globalThis.document; else globalThis.document = prev; }
});
ok('Results v1.85: "Save before you finish" needs a saved voyage and the confirmation; the question reports the tank log', () => {
  const fin = step('results', 'res-final');
  assert.equal(fin.ask.gate, true); assert.equal(fin.sel, '#saveVoyageBtn');
  assert.match(fin.text, /Save tank condition/); assert.match(fin.text, /Save current voyage/);
  withStore(0, () => { assert.equal(chk('results', 'res-final', mkState()), false); assert.equal(askInfo(fin, {}, mkState(), 'results'), null); });
  withStore(2, () => {
    const st = mkState(), a = askInfo(fin, {}, st, 'results');
    assert.equal(a.pending, true); assert.equal(a.count, 2);
    assert.equal(evalStep(fin, st, { asks: {} }).ok, false);
    assert.match(a.question, /none is saved yet/); assert.match(a.question, /2 saved so far/);
    st.tankLog = [{ id: 'tc1' }]; assert.doesNotMatch(finalSaveQuestion(st, 2), /none is saved yet/);
    const done = answerAsk(defaultProgress(), 'results', fin, st, true);
    assert.equal(evalStep(fin, st, { asks: done.asks }).ok, true);
    assert.equal(autoStartDecision(defaultProgress(), 'results', GUIDE_STEPS.results, st), 'mark-done');   // a plan that is already saved is still marked done silently
  });
  withStore(0, () => assert.equal(autoStartDecision(defaultProgress(), 'results', GUIDE_STEPS.results, mkState()), 'start'));
});

console.log('test-guide: ' + n + ' passed');
