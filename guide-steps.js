/* Bunker Pilot — Setup guide step lists, keyed by tab id (v1.82).
   Chunks 3-5 cover Setup, Ports (voyage), Tanks, Bunkering, ECA/SECA, Dashboard (Home) and Results.
   check(state, ctx) returns true when the field is acceptable, or a message telling the user what is missing.
   Steps marked optional never block (they explain a field that may legitimately stay at 0). */
const N = v => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const fuel = (s, id) => (s.fuels || []).find(f => f.id === id) || {};
const lube = (s, id) => (s.lubes || []).find(l => l.id === id) || {};

/* ---- Fuel oil: which rate sets are in use (VLSFO set, HFO set, or both) ---- */
export const foMode = s => { const m = fuel(s, 'fo').foMode; return m === 'hfo' || m === 'both' ? m : 'vlsfo'; };
export function foSets(s) {
  const f = fuel(s, 'fo'), m = foMode(s), sets = [];
  if (m !== 'hfo') sets.push({ label: 'VLSFO', r: f });
  if (m === 'hfo' || (m === 'both' && !f.sameAsVlsfo)) sets.push({ label: 'HFO', r: f.hfo || {} });
  return sets;
}
const subAttr = label => label === 'HFO' ? '[data-rate-sub="hfo"]' : ':not([data-rate-sub])';
const foBad = (s, test) => foSets(s).find(x => !test(x.r)) || foSets(s)[0];
const foSel = (s, attr, test) => `[data-rate-id="fo"][${attr}]${subAttr(foBad(s, test).label)}`;
const seaOk = r => N(r.seaRate) > 0, portOk = r => N(r.portRate) > 0, resOk = r => N(r.reserveDays) > 0 && N(r.reserveRate) > 0;
const resSel = s => { const b = foBad(s, resOk); return `[data-rate-id="fo"][data-field="${N(b.r.reserveDays) > 0 ? 'reserveRate' : 'reserveDays'}"]${subAttr(b.label)}`; };

/* ---- Other products ---- */
const doUsed = s => { const d = fuel(s, 'do'); return N(d.seaRate) > 0 || N(d.portRate) > 0 || N(d.anchorRate) > 0; };
const lubeUsed = id => s => N(lube(s, id).seaRate) > 0;
const lubeReserve = id => ({ check: s => { const l = lube(s, id); return (N(l.reserveDays) > 0 && N(l.reserveRate) > 0) || 'Enter the reserve days and the reserve quantity per day (it normally follows the daily rate).'; },
  sel: s => `[data-rate-id="${id}"][data-field="${N(lube(s, id).reserveDays) > 0 ? 'reserveRate' : 'reserveDays'}"]` });

/* ---- Ports ---- */
const route = s => Array.isArray(s.route) ? s.route : [];
const stayHours = r => N(r.portStayDays) * 24 + N(r.portStayHours);
const rf = (i, f) => `[data-route-index="${i}"][data-field="${f}"]`;
const card = i => `[data-route-card="${i}"]`;
const lastCard = s => card(Math.min(1, Math.max(0, route(s).length - 1)));   // the second port when there is one, else the first
const laterStay = s => route(s).findIndex((r, i) => i >= 2 && !(stayHours(r) > 0));   // first port from the third on without a port stay
export function badLeg(s) {   // first port after the first that is missing a name, distance or speed
  const r = route(s);
  for (let i = 1; i < r.length; i++) {
    const name = String(r[i].port || '').trim() || `Port ${i + 1}`;
    if (!String(r[i].port || '').trim()) return { i, f: 'port', msg: `${name}: enter the port name.` };
    if (!(N(r[i].distanceNm) > 0)) return { i, f: 'distanceNm', msg: `${name}: enter the distance from the previous port (NM).` };
    if (!(N(r[i].speedKn) > 0)) return { i, f: 'speedKn', msg: `${name}: enter the planning speed (kn).` };
  }
  return null;
}

/* ---- Popups (v1.82): the guide walks the fields of an open popup one by one ---- */
const hasDoc = () => typeof document !== 'undefined' && !!document && typeof document.querySelector === 'function';
const modalShown = id => hasDoc() && !!document.querySelector(`#${id}:not([hidden])`);
const fieldShown = id => { if (!hasDoc()) return false; const el = document.getElementById(id); return !!el && !(el.closest && el.closest('[hidden]')); };
/* The first field of `order` that is on screen and not yet visited; once every field was visited the last one (the button) stays. */
export function popupField(order, touched, isShown) {
  const seen = touched || new Set(), shown = (order || []).filter(id => (isShown ? isShown(id) : true));
  if (!shown.length) return '';
  return shown.find(id => !seen.has(id)) || shown[shown.length - 1];
}
export const ADD_TANK_ORDER = ['addTankRole', 'addTankDensity', 'addTankFuelType', 'addTankPosition', 'addTankConfirm'];

/* ---- Water tanks (Tanks tab) ---- */
const waterTanks = s => (s && s.stores && s.stores.water && Array.isArray(s.stores.water.tanks)) ? s.stores.water.tanks : [];
export const hasWaterTank = s => waterTanks(s).length > 0;
const waterOf = (s, type) => waterTanks(s).filter(t => t.type === type);

/* ---- Tanks ---- */
const tanksOf = (s, g) => (s.tanks || []).map((t, i) => ({ t, i })).filter(x => x.t.group === g && (x.t.category || 'storage') === 'storage');
const anyTank = s => (s.tanks || []).length > 0;
const capOk = t => N(t.capacity) > 0 || N(t.capacityM3) > 0;
const tf = (i, f) => `[data-tank-index="${i}"][data-field="${f}"]`;
const capSel = i => `${tf(i, 'capacityM3')}, ${tf(i, 'capacity')}`;
const groupRob = (s, g) => (s.tanks || []).filter(t => t.group === g).reduce((a, t) => a + N(t.rob), 0);
const noonOf = (s, g) => N(s.meta && s.meta.noonRob && s.meta.noonRob[g]);
export function seqClash(s, g) {   // two consumable storage tanks of one group sharing a sequence number
  const seen = {};
  for (const { t, i } of tanksOf(s, g)) {
    if (t.consumable === false) continue;
    const q = N(t.sequence);
    if (seen[q] !== undefined) return { i, a: seen[q], seq: q };
    seen[q] = i;
  }
  return null;
}
const GROUP_NAME = { fo: 'fuel oil', do: 'diesel oil', cyl: 'cylinder oil', mesys: 'ME system oil', gesys: 'GE system oil' };
const GROUP_USED = { fo: () => true, do: doUsed, cyl: s => N(lube(s, 'cyl').seaRate) > 0, mesys: s => N(lube(s, 'mesys').seaRate) > 0, gesys: s => N(lube(s, 'gesys').seaRate) > 0 };
const GROUP_UNIT = { fo: 'MT', do: 'MT', cyl: 'litres', mesys: 'litres', gesys: 'litres' };
export function badTank(s, g, test) { const x = tanksOf(s, g).find(y => !test(y.t)); return x || null; }
const isFuelGroup = g => g === 'fo' || g === 'do';
const volTankOf = t => !!t && t.capUnit !== 'weight';                 // fuel / diesel tank entered by volume (m\u00b3) and density
function fuelTankSteps(g) {
  const nm = GROUP_NAME[g], when = GROUP_USED[g], first = s => (tanksOf(s, g)[0] || { i: 0 }).i, firstT = s => (tanksOf(s, g)[0] || {}).t;
  const has = s => when(s) && tanksOf(s, g).length > 0, vol = s => has(s) && volTankOf(firstT(s));
  const cap = nm[0].toUpperCase() + nm.slice(1);
  return [
    { id: g + '-fueltype', when: has, optional: true, okMsg: '\u2713 Pick the grade this tank holds \u2014 then tap Next.', title: `${cap} \u2014 fuel type`,
      sel: s => `[data-mp="tank"][data-tank-index="${first(s)}"]`,
      text: `The grade this tank is dedicated to (for example VLSFO, HFO or LSMGO). Choose Other to type one that is not in the list. It decides which fuels may be bunkered into the tank without mixing; the same choice exists on every other ${nm} tank.` },
    { id: g + '-sulphur', when: has, optional: true, okMsg: '\u2713 Blank uses the default sulphur \u2014 then tap Next.', title: `${cap} \u2014 sulphur %`,
      sel: s => tf(first(s), 'sulphur'),
      text: 'Sulphur content (% m/m) of the fuel now in the tank, from its BDN. Leave it blank to use the default (VLSFO 0.5 %, LSMGO 0.1 %). A bunker loaded into the tank updates it by itself, and the ECA/SECA changeover uses it.' },
    { id: g + '-robas', when: vol, optional: true, okMsg: '\u2713 Choose how you sounded the tank \u2014 then tap Next.', title: `${cap} \u2014 enter ROB as`,
      sel: s => tf(first(s), 'robInput'),
      text: 'Volume (m\u00b3) is the usual way: type the corrected sounding volume and the app converts it with the density and temperature. Choose Weight (MT) only when you already have the quantity in tonnes; the temperature box then disappears.' },
    { id: g + '-temp', when: s => vol(s) && firstT(s).robInput !== 'mt', optional: true, okMsg: '\u2713 Blank is taken as 15 \u00b0C \u2014 then tap Next.', title: `${cap} \u2014 temperature`,
      sel: s => tf(first(s), 'robTempC'),
      text: 'Temperature of the fuel in the tank (\u00b0C) at the sounding. The app corrects the sounded volume to 15 \u00b0C with it before converting to tonnes.' },
    { id: g + '-density', when: vol, optional: true, okMsg: '\u2713 Use the density from the BDN \u2014 then tap Next.', title: `${cap} \u2014 density`,
      sel: s => tf(first(s), 'density'),
      text: 'Density (t/m\u00b3) of the fuel in this tank, from the BDN. It converts volume to tonnes both for the capacity and for the ROB; a wrong density shifts every quantity of the tank.' }
  ];
}
function tankSteps(g) {
  const nm = GROUP_NAME[g], unit = GROUP_UNIT[g], when = GROUP_USED[g], first = s => (tanksOf(s, g)[0] || { i: 0 }).i;
  return [
    { id: g + '-tank', when, title: `Add the ${nm} tanks`,
      sel: (s, touched) => modalShown('addTankModal') ? '#' + popupField(ADD_TANK_ORDER, touched, fieldShown) : `[data-add-tank="${g}"]`,
      text: g === 'fo' || g === 'do'
        ? `Tap + Tank in the ${nm} group. In the popup the guide walks you through the Tank role (Storage / active for every tank the vessel consumes from; settling, service and support tanks are not consumed automatically), the average density (t/m\u00b3, it converts the capacity you enter in m\u00b3 to tonnes), the fuel type and where in the list the new tank goes, then tap Add tank. After each tank the guide asks whether you still need to add more of this type.`
        : `Tap + Tank in the ${nm} group. In the popup the guide walks you through the Tank role (Storage / active for every tank the vessel consumes from; settling, service and support tanks are not consumed automatically) and where in the list the new tank goes, then tap Add tank. After each tank the guide asks whether you still need to add more of this type.`,
      check: s => tanksOf(s, g).length >= 1 || `Add at least one ${nm} storage tank (+ Tank).`,
      ask: { count: s => (s.tanks || []).filter(t => t.group === g).length,
        question: (s, n) => `You have added ${n} ${nm} tank${n === 1 ? '' : 's'}. Do you still need to add more ${nm} tanks?`,
        yesLabel: 'Yes, add another', noLabel: `No, ${nm} tanks are complete`,
        yesHint: `Tap the highlighted + Tank button to add the next ${nm} tank. This question comes back after it is added.` } },
    { id: g + '-cap', when, title: `${nm[0].toUpperCase() + nm.slice(1)} \u2014 tank capacity`,
      sel: s => { const b = badTank(s, g, capOk); return b ? capSel(b.i) : capSel(first(s)); },
      text: `Enter the capacity of each ${nm} tank (${g === 'fo' || g === 'do' ? 'm\u00b3 \u2014 it is converted with the density below' : unit}). The tank bar and every overfill check use it.`,
      check: s => { if (!tanksOf(s, g).length) return `Add a ${nm} storage tank first.`; const b = badTank(s, g, capOk); return !b || `${b.t.name || 'A tank'}: enter the capacity (above 0).`; } },
    { id: g + '-rob', when, title: `${nm[0].toUpperCase() + nm.slice(1)} \u2014 present ROB`,
      sel: s => { const b = tanksOf(s, g).find(x => !(N(x.t.rob) > 0)), i = b ? b.i : first(s); return `${tf(i, 'rob')}, ${tf(i, 'robVolumeM3')}`; },
      text: 'Enter what is in each tank now (sounded, from the noon report). ROB is the starting stock of the whole plan. An empty tank may stay at 0.',
      check: s => groupRob(s, g) > 0 || noonOf(s, g) <= 0 || `The logbook ROB is ${noonOf(s, g)} ${unit} but the tanks add up to 0 \u2014 enter each tank\u2019s present ROB.` },
    ...(isFuelGroup(g) ? fuelTankSteps(g) : []),
    { id: g + '-unpump', when, optional: true, okMsg: 'Optional \u2014 leave 0 if the tank can be pumped dry, then tap Next.', title: `${nm[0].toUpperCase() + nm.slice(1)} \u2014 unpumpable quantity`,
      sel: s => tf(first(s), 'unpumpable'),
      text: 'The quantity that stays in the tank and can never be consumed (sounding pipe / suction heel). It is excluded from consumption and from the reserve.' },
    { id: g + '-seq', when: s => when(s) && tanksOf(s, g).filter(x => x.t.consumable !== false).length > 1, title: `${nm[0].toUpperCase() + nm.slice(1)} \u2014 consumption sequence`,
      sel: s => { const c = seqClash(s, g); return `[data-tank-sequence="${c ? c.i : first(s)}"]`; },
      text: 'Sequence 1 is consumed first; when it is empty the plan switches to sequence 2, and so on. Give each tank its own number, in the order the engineers will really use them.',
      check: s => { const c = seqClash(s, g); return !c || `Two ${nm} tanks share sequence ${c.seq} \u2014 give each tank its own number.`; } }
  ];
}

/* ---- Bunkering ---- */
const BK = ['fo', 'do', 'cyl', 'mesys', 'gesys'];
const evQty = e => !e ? 0 : e.entryMode === 'tanks' ? (e.allocations || []).reduce((a, x) => a + N(x && x.quantity), 0) : N(e.quantity);
export function bunkerEvents(s) {   // every planned bunker with a quantity: { i, g, e, qty }
  const out = [];
  route(s).forEach((r, i) => BK.forEach(g => { const e = r.bunkers && r.bunkers[g]; const qty = evQty(e); if (qty > 0) out.push({ i, g, e, qty }); }));
  return out;
}
export function badBunker(s) {   // a bunker typed as a total, auto-allocation switched off, but its tank quantities do not add up
  for (const x of bunkerEvents(s)) {
    if (x.e.mode === 'drums' || x.e.entryMode === 'tanks' || x.e.autoAllocate !== false) continue;
    const sum = (x.e.allocations || []).reduce((a, y) => a + N(y && y.quantity), 0);
    if (Math.abs(sum - x.qty) > 0.005) {
      const port = String(route(s)[x.i].port || '').trim() || `Port ${x.i + 1}`;
      return { ...x, sum, msg: `${port} (${GROUP_NAME[x.g]}): the tank quantities add up to ${Math.round(sum * 100) / 100} but the bunker quantity is ${x.qty}. Fix the tank figures or tick Auto-allocate.` };
    }
  }
  return null;
}
const firstBunkerPort = s => { const b = bunkerEvents(s)[0]; return b ? b.i : 0; };
const additives = s => (s && s.stores && Array.isArray(s.stores.additives)) ? s.stores.additives : [];
const isFuelG = g => g === 'fo' || g === 'do';
const bkAt = (i, g, f) => `[data-bunker-route="${i}"][data-bunker-fuel="${g}"][data-bunker-field="${f}"]`;
const lubeAny = s => ['cyl', 'mesys', 'gesys'].some(g => lubeUsed(g)(s));
const bkWhere = (s, pred, g0) => { const e = bunkerEvents(s).find(pred); return { i: e ? e.i : firstBunkerPort(s), g: e ? e.g : g0 }; };   // port + product a step points at: the first planned bunker that fits, else the first bunker port
const fuelWhere = s => bkWhere(s, x => isFuelG(x.g), 'fo');
const lubeWhere = (s, g) => bkWhere(s, x => x.g === g, g);
const adBad = (s, f) => additives(s).find(a => !(f === 'name' ? String(a.name || '').trim() : Number(a[f]) > 0)) || additives(s)[0] || {};
const adSel = f => s => `[data-st-ad="${adBad(s, f).id}"][data-st-f="${f}"]`;
function lubeBunkerStep(g, label) {
  return { id: 'bk-lube-' + g, when: s => route(s).length > 0 && lubeUsed(g)(s), sel: s => { const w = lubeWhere(s, g); return bkAt(w.i, g, 'quantity'); }, title: label + ' replenishment', optional: true,
    okMsg: '\u2713 Type the litres to receive \u2014 or leave 0 if none is planned \u2014 then tap Next.',
    text: 'Litres of ' + label.toLowerCase() + ' to receive at this port (leave 0 for none). Lube oil has no grade or sulphur box. With Auto-allocate on, the planner fills the tanks in order up to the company maximum fill; you can also type the litres tank by tank. It is added to the ROB after the port consumption.' };
}

/* ---- ECA / SECA ---- */
const ecaP = r => (r && r.eca && r.eca.port) || {};
const ecaOn = r => !!ecaP(r).enabled;
export function ecaEntering(s) { const r = route(s), out = []; r.forEach((x, i) => { if (i > 0 && ecaOn(x) && !ecaOn(r[i - 1])) out.push(i); }); return out; }
export function ecaLeaving(s) { const r = route(s), out = []; r.forEach((x, i) => { if (ecaOn(x) && (i === r.length - 1 || !ecaOn(r[i + 1]))) out.push(i); }); return out; }
const pname = (s, i) => String(route(s)[i].port || '').trim() || `Port ${i + 1}`;
const entCfg = (s, i) => (route(s)[i].eca && route(s)[i].eca.entering) || {};
const pf = (i, f) => `[data-eca-port="${i}"][data-eca-pfield="${f}"]`;
const ef = (i, dir, f) => `[data-eca="${i}"][data-eca-dir="${dir}"][data-eca-field="${f}"]`;
const SYS_KEYS = ['me', 'ae', 'boiler'], SYS_NAME = { me: 'Main Engine', ae: 'Aux. Engine', boiler: 'Boiler' };
const sf = (i, dir, k, f) => `[data-eca="${i}"][data-eca-dir="${dir}"][data-eca-sys="${k}"][data-eca-field="${f}"]`;
const mp = (i, dir, f) => `select[data-mp="eca"][data-eca="${i}"][data-eca-dir="${dir}"][data-eca-field="${f}"]`;
const sysOf = (c, k) => (c && c[k]) || {};
const sysOn = (c, k) => sysOf(c, k).on !== false;
const sysPick = (c, test) => SYS_KEYS.find(k => sysOn(c, k) && !test(sysOf(c, k))) || SYS_KEYS.find(k => sysOn(c, k)) || 'me';   // first system still missing the value, else the first one that is switched on
const entI = s => ecaEntering(s)[0], lvI = s => ecaLeaving(s)[0];
const lvCfg = (s, i) => (route(s)[i].eca && route(s)[i].eca.leaving) || {};
export const leaveFixed = c => !!c && c.leaveMode !== 'fobas' && N(c.toSulphurPct) > 0 && N(c.fromSulphurPct) <= 0.5 + 1e-9 && N(c.toSulphurPct) <= 0.5 + 1e-9;   // same rule as ecoLeaveFixed(): both fuels within the 0.50 % limit outside the area = fixed switch, no mixing model
const entWhen = s => ecaEntering(s).length > 0;
const lvWhen = s => ecaLeaving(s).length > 0;
const opt = (id, when, sel, title, okMsg, text) => ({ id, when, sel, title, optional: true, okMsg, text });
export function badEcaEntry(s) {   // first entering port with a missing line distance or unusable sulphur figures
  for (const i of ecaEntering(s)) {
    const c = entCfg(s, i), p = ecaP(route(s)[i]);
    if (!(N(p.lineToPortNm) > 0)) return { i, f: 'dist', sel: pf(i, 'lineToPortNm'), msg: `${pname(s, i)}: enter the distance from the ECA/SECA line to the port (NM, above 0).` };
    if (!(N(c.fromSulphurPct) > 0)) return { i, f: 'from', sel: ef(i, 'entering', 'fromSulphurPct'), msg: `${pname(s, i)}: enter the sulphur % of the fuel now in the service system.` };
    if (!(N(c.toSulphurPct) > 0)) return { i, f: 'to', sel: ef(i, 'entering', 'toSulphurPct'), msg: `${pname(s, i)}: enter the sulphur % of the compliant fuel you will change over to.` };
    if (N(c.toSulphurPct) > N(c.fromSulphurPct)) return { i, f: 'to', sel: ef(i, 'entering', 'toSulphurPct'), msg: `${pname(s, i)}: the new fuel (${N(c.toSulphurPct)} %) must not have more sulphur than the current fuel (${N(c.fromSulphurPct)} %).` };
  }
  return null;
}
const ecaStep = (id, f, title, text, fallback) => ({ id, when: s => ecaEntering(s).length > 0, title, text,
  sel: s => { const b = badEcaEntry(s); return b ? b.sel : fallback(s); },
  check: s => { const b = badEcaEntry(s); if (!b) return true; const order = ['dist', 'from', 'to'], mine = order.indexOf(f); return order.indexOf(b.f) > mine ? true : b.msg; } });

/* ---- Home (Dashboard) and Results ---- */
export function planReady(s) {
  const r = route(s);
  if (r.length < 2) return 'Add at least two ports on the Ports tab so a voyage can be calculated.';
  const b = badLeg(s); if (b) return b.msg;
  if (!tanksOf(s, 'fo').some(x => capOk(x.t))) return 'Add a fuel oil tank with a capacity on the Tanks tab.';
  return true;
}
export function savedVoyageCount() { try { const v = JSON.parse(globalThis.localStorage.getItem('bunker-saved-voyages-v1') || '[]'); return Array.isArray(v) ? v.length : 0; } catch { return 0; } }

/* ---- Home popups (v1.85): Plan a bunkering, Tank ROB ---- */
const pbOpen = () => modalShown('planBunkerModal'), rvOpen = () => modalShown('robViewModal');
export const PB_OTHER_ORDER = ['pbName', 'pbWall', 'pbOffset', 'pbStay'];          // only on screen when the port list says "Other port / date\u2026"
export const PB_FORM_ORDER = ['pbFormBunker', 'pbFormLube', 'pbExportGo'];         // only on screen after Export was tapped
const PB_BTN = '#planBunkerBtn', RV_BTN = '#robViewBtn';
const pbSel = id => () => pbOpen() ? id : PB_BTN;                                   // popup open: the field; closed: the button that opens it
const rvSel = id => () => rvOpen() ? id : RV_BTN;
const visibleEl = q => { if (!hasDoc()) return false; const el = document.querySelector(q); return !!el && typeof el.getClientRects === 'function' && el.getClientRects().length > 0; };
const tankLogCount = s => Array.isArray(s && s.tankLog) ? s.tankLog.length : 0;
export const finalSaveQuestion = (s, n) => {
  const t = tankLogCount(s);
  return `Before you finish: have you saved the tank condition (Tanks tab \u2192 Save tank condition${t ? '' : ' \u2014 none is saved yet'}) and this voyage (Save current voyage; ${n} saved so far) AFTER your last change?`;
};

export const GUIDE_STEPS = {
  setup: [
    { id: 'vessel', sel: '#vesselName', title: 'Name your vessel',
      text: 'Type the vessel name. It is printed on the Dashboard and on every exported form.',
      check: s => String(s.meta && s.meta.vesselName || '').trim().length >= 2 || 'Enter the vessel name (at least 2 characters) to continue.' },
    { id: 'voyage-no', sel: '#voyageNo', title: 'Voyage / passage number', optional: true, okMsg: 'Optional \u2014 leave it empty if you have no reference, then tap Next.',
      text: 'Company voyage number, passage number or any planning reference. It is printed beside the vessel name on the Dashboard header and on the exported reports and forms.' },
    { id: 'position', sel: '#currentPosition', title: 'Present position',
      text: 'Pick or type where the vessel is now (a port or sea area). The Dashboard shows it as the starting point of the plan.',
      check: s => String(s.meta && s.meta.currentPosition || '').trim().length >= 2 || 'Enter the present position (port or sea area) to continue.' },
    { id: 'utc', sel: '#posUtcOffset', title: 'UTC offset of the present position', optional: true, okMsg: '\u2713 Make sure it matches the ship\u2019s clock \u2014 then tap Next.',
      text: 'Choose the ship\u2019s time zone at this position. The noon report date you enter later is local time; this offset converts it to the start point of the ETA/ETD calculation, so a wrong value shifts every ETA.' },
    { id: 'fo-mode', sel: '[data-rate-id="fo"][data-field="foMode"]', title: 'Which fuel oil do you burn?', optional: true, okMsg: '\u2713 Set to what the vessel really burns \u2014 then tap Next.',
      text: 'VLSFO only, HFO only, or both (for example HFO outside an ECA and VLSFO inside). The rate boxes below follow this choice, so set it first.' },
    { id: 'rate-names', sel: '[data-rate-id="fo"][data-field="name"]', title: 'Rate-card names', optional: true, okMsg: '\u2713 Rename it only if your company uses another name \u2014 then tap Next.',
      text: 'Every rate card has a name box at its top (Fuel Oil, Diesel Oil, Cylinder Oil, ME System Oil, GE System Oil). The name you type here is shown everywhere else in the app: the Dashboard, the tank list, bunkering, the forms and the reports. The default names are fine for most vessels.' },
    { id: 'fo-same', when: s => foMode(s) === 'both', sel: '[data-rate-id="fo"][data-field="sameAsVlsfo"]', title: 'Same rates for VLSFO and HFO?', optional: true, okMsg: '\u2713 Tick it only when both fuels burn at the same rates \u2014 then tap Next.',
      text: 'Because the vessel uses both fuels, tick this box when HFO consumption, reserve days and reserve per day are the same as for VLSFO \u2014 the separate HFO boxes then disappear. Leave it unticked to enter HFO rates of their own.' },
    { id: 'rates-locked', sel: s => foSel(s, 'data-rate-item="meSea"', seaOk), title: 'Rates are fixed once entered', optional: true, okMsg: '\u2713 Understood \u2014 tap Next.',
      text: 'Consumption rates and reserves are planning anchors, so after a rate has been set the app asks \u201cChange \u2026 from A to B?\u201d when you edit it. Confirm only when the vessel\u2019s real consumption has changed; tap Cancel to keep the old figure. The first time you type a value there is no question.' },
    { id: 'fo-sea', sel: s => foSel(s, 'data-rate-item="meSea"', seaOk), title: 'Fuel oil \u2014 consumption at sea',
      text: 'Enter the Main Engine and Aux. Engine fuel per day at sea (MT/day) from recent noon reports. Every sea leg is calculated with this rate.',
      check: s => !foSets(s).some(x => !seaOk(x.r)) || `Enter the ${foBad(s, seaOk).label} consumption at sea (Main Engine + Aux. Engine, MT/day).` },
    { id: 'fo-port', sel: s => foSel(s, 'data-rate-item="aePort"', portOk), title: 'Fuel oil \u2014 consumption in port',
      text: 'Enter the Aux. Engine and Boiler fuel per day while in port (MT/day). It is also used at anchor or drift unless you override it per port.',
      check: s => !foSets(s).some(x => !portOk(x.r)) || `Enter the ${foBad(s, portOk).label} consumption in port (Aux. Engine + Boiler, MT/day).` },
    { id: 'fo-anchor', sel: s => foSel(s, 'data-rate-item="boilerPort"', portOk), title: 'Fuel oil \u2014 at anchor or drift', optional: true, okMsg: '\u2713 Nothing to enter here \u2014 tap Next.',
      text: 'There is no separate anchor box for fuel oil: at anchor or drift the app uses the in-port rate (Aux. Engine + Boiler). If one port needs a different figure while waiting, open Override Consumption for this Port on the Ports tab and type it there.' },
    { id: 'fo-reserve', sel: resSel, title: 'Fuel oil \u2014 reserve',
      text: 'Reserve quantity = reserve days \u00d7 reserve per day. The bunker shortfall at each port keeps this much fuel in hand. The reserve per day follows the sea rate unless you change it.',
      check: s => !foSets(s).some(x => !resOk(x.r)) || `Enter the ${foBad(s, resOk).label} reserve days and reserve per day (both above 0).` },
    { id: 'do-rates', sel: '[data-rate-id="do"][data-field="seaRate"]', title: 'Diesel oil \u2014 daily consumption',
      text: 'Enter the diesel oil (LSMGO/DO) consumed per day at sea. The in-port and anchor/drift boxes follow in the next two steps. Enter at least one of the three rates; the same rates apply inside and outside an ECA.',
      check: s => doUsed(s) || 'Enter the diesel oil consumption per day (at sea and/or in port). Use Skip this tab only if the vessel burns none.' },
    { id: 'do-port', when: doUsed, sel: '[data-rate-id="do"][data-field="portRate"]', title: 'Diesel oil \u2014 consumption in port', optional: true, okMsg: 'Optional \u2014 leave 0 if no diesel is burned in port, then tap Next.',
      text: 'Diesel oil burned per day while alongside (MT/day), for example by the generators or the boiler on diesel. It is used for every port stay.' },
    { id: 'do-anchor', when: doUsed, sel: '[data-rate-id="do"][data-field="anchorRate"]', title: 'Diesel oil \u2014 at anchor / drift', optional: true, okMsg: 'Optional \u2014 leave 0 if no diesel is burned at anchor, then tap Next.',
      text: 'Diesel oil burned per day while waiting at anchor or drifting (MT/day). It only matters for ports where you enter anchor or drift time on the Ports tab.' },
    { id: 'do-reserve', title: 'Diesel oil \u2014 reserve',
      sel: s => `[data-rate-id="do"][data-field="${N(fuel(s, 'do').reserveDays) > 0 ? 'reserveRate' : 'reserveDays'}"]`,
      text: 'Reserve days and reserve per day for diesel oil, used for its bunker shortfall.',
      check: s => { const d = fuel(s, 'do'); return (N(d.reserveDays) > 0 && N(d.reserveRate) > 0) || 'Enter the diesel oil reserve days and reserve per day (both above 0).'; } },
    { id: 'cyl-name', sel: '[data-rate-id="cyl"][data-field="name"]', title: 'Cylinder oil \u2014 name', optional: true, okMsg: '\u2713 Rename it only if your company uses another name \u2014 then tap Next.',
      text: 'The name of the cylinder lubricating oil, for example the grade you load. It is shown on the tank list, the bunkering tab and the lube oil form.' },
    { id: 'cyl-rate', sel: '[data-rate-id="cyl"][data-field="seaRate"]', title: 'Cylinder oil \u2014 consumption at sea',
      text: 'Enter the cylinder oil used per day at sea (litres/day). There is no cylinder oil consumption in port.',
      check: s => N(lube(s, 'cyl').seaRate) > 0 || 'Enter the cylinder oil consumption at sea (litres/day).' },
    Object.assign({ id: 'cyl-reserve', title: 'Cylinder oil \u2014 reserve', text: 'Reserve days and reserve per day for cylinder oil.' }, lubeReserve('cyl')),
    { id: 'mesys', sel: '[data-rate-id="mesys"][data-field="seaRate"]', title: 'ME system oil \u2014 daily make-up', optional: true, okMsg: 'Optional \u2014 leave 0 if you do not track it, then tap Next.',
      text: 'Daily top-up of the main engine system oil (litres/day). The workbook has no value for it, so the app assumes none \u2014 enter your own figure if you plan this product.' },
    Object.assign({ id: 'mesys-reserve', when: lubeUsed('mesys'), title: 'ME system oil \u2014 reserve', text: 'You entered a daily make-up, so set how many days of it must always stay on board (reserve days) and the reserve quantity per day. The reserve per day follows the daily rate unless you change it.' }, lubeReserve('mesys')),
    { id: 'gesys', sel: '[data-rate-id="gesys"][data-field="seaRate"]', title: 'GE system oil \u2014 daily make-up', optional: true, okMsg: 'Optional \u2014 leave 0 if you do not track it, then tap Next.',
      text: 'Daily top-up of the generator engine system oil (litres/day), used in every phase. Leave 0 if you do not plan it.' },
    Object.assign({ id: 'gesys-reserve', when: lubeUsed('gesys'), title: 'GE system oil \u2014 reserve', text: 'Reserve days and reserve quantity per day for the generator engine system oil. The reserve per day follows the daily rate unless you change it.' }, lubeReserve('gesys'))
  ],
  voyage: [
    { id: 'add-first', sel: '#addRouteInline', title: 'Add the first port',
      text: 'Tap Add port. The first port is the voyage start (usually where the vessel is now or the next port of call) and normally uses 0 NM.',
      check: s => route(s).length >= 1 || 'Tap Add port to create the first port.' },
    { id: 'p1-name', sel: rf(0, 'port'), title: 'Name the first port',
      text: 'Type or pick the port name. The card opens automatically.',
      check: s => String(route(s)[0] && route(s)[0].port || '').trim().length >= 2 || 'Enter the name of the first port.' },
    { id: 'p1-eta', when: s => route(s).length >= 1, sel: rf(0, 'eta'), title: 'First port ETA', optional: true, okMsg: 'Optional \u2014 leave it empty to start from the noon report, then tap Next.',
      text: 'Only the first port has this box. If you type an arrival time, the plan uses it for the first port instead of the voyage start time set on the Tanks tab. Leave it empty to count from the noon report.' },
    { id: 'p1-distance', when: s => route(s).length >= 1, sel: rf(0, 'distanceNm'), title: 'First port \u2014 distance', optional: true, okMsg: '\u2713 Normally 0 NM for the first port \u2014 tap Next.',
      text: 'The distance from the previous point. The first port is the start of the voyage, so it normally stays at 0 NM; type a figure only if the vessel is still steaming to this first port.' },
    { id: 'p1-speed', when: s => route(s).length >= 1, sel: rf(0, 'speedKn'), title: 'First port \u2014 speed', optional: true, okMsg: '\u2713 Only needed when the first port has a distance \u2014 tap Next.',
      text: 'Planning speed in knots for the leg to the first port. With 0 NM it has no effect, so it can stay 0; enter a speed if you typed a distance above.' },
    { id: 'p1-stay', when: s => route(s).length >= 1, sel: rf(0, 'portStayDays'), title: 'First port \u2014 port stay', optional: true, okMsg: '\u2713 Enter the days here and the extra hours in the next box \u2014 then tap Next.',
      text: 'Time alongside at the first port, in days. The hours box is beside it, and the anchor / drift boxes just above are for waiting time before berthing. They fix the first ETD and the in-port consumption.' },
    { id: 'p1-utc', when: s => route(s).length >= 1, sel: rf(0, 'utcOffset'), title: 'First port \u2014 UTC offset', optional: true, okMsg: '\u2713 Check the port\u2019s local time zone \u2014 then tap Next.',
      text: 'The time zone of the first port. It only changes how its ETA/ETD are shown in local time.' },
    { id: 'add-second', sel: '#addRouteInline', title: 'Add the next port',
      text: 'A voyage needs at least one more port. Tap Add port again for the next port of call; further ports are added the same way, in sailing order.',
      check: s => route(s).length >= 2 || 'Tap Add port to add the next port of call.' },
    { id: 'p2-name', sel: rf(1, 'port'), title: 'Name the next port',
      text: 'Type or pick the name of this port.',
      check: s => String(route(s)[1] && route(s)[1].port || '').trim().length >= 2 || 'Enter the name of the next port.' },
    { id: 'p2-distance', sel: rf(1, 'distanceNm'), title: 'Distance from the previous port',
      text: 'Nautical miles from the first port to this one. Sailing time = distance \u00f7 speed \u00f7 24.',
      check: s => N(route(s)[1] && route(s)[1].distanceNm) > 0 || 'Enter the distance in NM (above 0).' },
    { id: 'p2-speed', sel: rf(1, 'speedKn'), title: 'Planning speed',
      text: 'Speed in knots for this leg. It sets the steaming days and the at-sea consumption.',
      check: s => N(route(s)[1] && route(s)[1].speedKn) > 0 || 'Enter the planning speed in knots (above 0).' },
    { id: 'p2-anchor-days', when: s => route(s).length >= 2, sel: rf(1, 'anchorStayDays'), title: 'At anchor / drift \u2014 days', optional: true, okMsg: '\u2713 Leave 0 if the ship goes straight alongside \u2014 then tap Next.',
      text: 'Days spent waiting at anchor or drifting off this port before berthing. They are added between ETA and ETD and burn fuel at the at-anchor rate. The hours box follows in the next step.' },
    { id: 'p2-anchor-hours', when: s => route(s).length >= 2, sel: rf(1, 'anchorStayHours'), title: 'At anchor / drift \u2014 hours', optional: true, okMsg: '\u2713 Whole hours, 0 to 23 \u2014 then tap Next.',
      text: 'Extra hours at anchor or drift on top of the days. Leave both at 0 when there is no waiting time. Once there is anchor time, an anchor/drift column also appears in Override Consumption for this Port.' },
    { id: 'p2-stay', sel: rf(1, 'portStayDays'), title: 'Port stay',
      text: 'Time alongside the berth: whole days here and extra hours in the next box. It fixes the ETD and the in-port consumption.',
      check: s => (route(s)[1] ? stayHours(route(s)[1]) > 0 : false) || 'Enter the port stay (days and/or hours). Zero would mean the ship leaves the moment it arrives.' },
    { id: 'p2-stay-hours', when: s => route(s).length >= 2, sel: rf(1, 'portStayHours'), title: 'Port stay \u2014 extra hours', optional: true, okMsg: '\u2713 Whole hours, 0 to 23 \u2014 then tap Next.',
      text: 'Hours alongside on top of the days. Total time at the port = anchor/drift stay + port stay, for example 1 day 6 hours.' },
    { id: 'p2-utc', sel: rf(1, 'utcOffset'), title: 'Port UTC offset', optional: true, okMsg: '\u2713 Check the port\u2019s local time zone \u2014 then tap Next.',
      text: 'The port\u2019s local time zone. It only changes how ETA/ETD are shown (local time), not the calculation.' },
    { id: 'fo-leg', when: s => foMode(s) === 'both' && route(s).length >= 2, sel: rf(1, 'foActiveFuel'), title: 'Fuel oil in use for this leg', optional: true, okMsg: '\u2713 Pick the fuel burned on this leg \u2014 then tap Next.',
      text: 'Setup says the vessel carries both VLSFO and HFO, so every port asks which one is burned on the leg arriving there. It drives the consumption rate, the reserve check and the no-mixing rule. Repeat it for each port you add.' },
    { id: 'legs', sel: s => { const b = badLeg(s); return b ? rf(b.i, b.f) : '#addRouteInline'; }, title: 'Add the remaining ports',
      text: 'Add every other port of the voyage in sailing order. Each one needs a name, a distance from the previous port and a speed. This step turns green when all legs are complete.',
      check: s => { const b = badLeg(s); return b ? b.msg : true; } },
    { id: 'legs-stay', when: s => route(s).length >= 3, sel: s => { const i = laterStay(s); return rf(i >= 0 ? i : route(s).length - 1, i >= 0 ? 'portStayDays' : 'utcOffset'); }, title: 'Stay and UTC offset of the other ports', optional: true,
      okMsg: '\u2713 A port with no stay leaves the moment it arrives \u2014 add one where that is wrong, then tap Next.',
      text: 'Each further port needs its own port stay (days + hours), optional anchor / drift time and UTC offset, exactly like the second port. The highlight moves to the first port after the second that has no port stay yet. Open the other port cards and check them.' },
    { id: 'p-override', when: s => route(s).length >= 1, sel: s => `${lastCard(s)} details.cons-override summary`, title: 'Override Consumption for this Port', optional: true, okMsg: '\u2713 Leave every box empty unless this port burns differently \u2014 then tap Next.',
      text: 'Open this fold to give one port its own in-port and anchor/drift daily consumption for any fuel or lube oil (a column appears for anchor/drift once the port has anchor time). A blank box uses the rate from Setup, shown as the grey placeholder. Typical use: a long cargo discharge with extra boiler heating.' },
    { id: 'p-bunker-link', when: s => route(s).length >= 1, sel: s => `${lastCard(s)} .cross-tab-links [data-goto-tab="bunkering"]`, title: 'Bunkering & lube oil \u2014 see Bunkering tab', optional: true, okMsg: '\u2713 Tap the highlighted link to plan a bunkering now, or tap Next to do it later.',
      text: 'Fuel and lube oil received at a port are entered on the Bunkering tab, not here. This link jumps there; it reads \u201cBunkering planned\u201d once a quantity exists for this port. If you jump, the guide of that tab takes over; come back to the Ports tab and this guide continues where you left it.' },
    { id: 'p-eca-link', when: s => route(s).length >= 1, sel: s => `${lastCard(s)} .cross-tab-links [data-goto-tab="eca"]`, title: 'ECA/SECA changeover \u2014 see ECA/SECA tab', optional: true, okMsg: '\u2713 Tap the highlighted link to plan a changeover now, or tap Next to do it later.',
      text: 'A port inside an Emission Control Area needs a fuel changeover plan, which lives on the ECA/SECA tab. This link jumps there and reads \u201cECA/SECA planned\u201d once the port is marked. The guide continues here when you come back. Skip it for a voyage outside any ECA/SECA.' },
    { id: 'p-move', when: s => route(s).length >= 2, sel: s => `${card(1)} [data-move-route]:not([disabled])`, title: 'Change the order of ports', optional: true, okMsg: '\u2713 Use the arrows whenever the sailing order changes \u2014 tap Next.',
      text: 'Move earlier and Move later swap this port with its neighbour; ETAs, ETDs and distances are recalculated at once. The first port cannot move earlier and the last cannot move later.' },
    { id: 'p-remove', when: s => route(s).length >= 2, sel: `${card(1)} [data-remove-route]`, title: 'Remove a port', optional: true, okMsg: '\u2713 Only tap it to delete a port \u2014 tap Next to continue.',
      text: 'Remove port deletes this port after a confirmation, together with the bunkering and ECA/SECA entries made for it. Do not tap it now unless the port really is not part of the voyage.' }
  ],
  tanks: [
    { id: 'maxfill', sel: (s, touched) => modalShown('maxFillModal') ? (touched && touched.has('maxFillInput') ? '#maxFillSave' : '#maxFillInput') : '[data-change-maxfill]',
      title: 'Company maximum tank fill', optional: true, okMsg: '\u2713 Tap Change, type your company limit and Save \u2014 or skip, 85 % is used \u2014 then tap Next.',
      text: 'The most your company allows in a tank (for example 85 % or 90 %). It sets the proposed bunker / replenish quantity and the overfill warnings. Tap Change in the highlighted bar, type the percentage (50 to 100) and tap Save; Use 85% for now keeps the default.' },
    { id: 'noon-date', sel: '#noonLocal', title: 'Noon report date and time', optional: true, okMsg: '\u2713 Make sure it is the local date/time of the noon report \u2014 then tap Next.',
      text: 'Enter the ship\u2019s LOCAL date and time of the noon report the plan starts from. Every ETA/ETD is counted from here, so it must match the logbook.' },
    { id: 'noon-now', sel: '#noonLocalNow', title: 'Today \u00b7 12:00 local', optional: true, okMsg: '\u2713 Tap it only if the noon report is today \u2014 then tap Next.',
      text: 'Tap Today \u00b7 12:00 local to set the date to today and the time to 12:00 in the ship\u2019s local time (worked out with the UTC offset beside the date). Skip it when you have already typed the exact date and time.' },
    { id: 'noon-offset', sel: '#noonUtcOffset', title: 'UTC offset of the noon report', optional: true, okMsg: '\u2713 It must match the ship\u2019s clock \u2014 then tap Next.',
      text: 'The ship\u2019s time zone for the noon report. It is the same setting as the UTC offset of the present position on Setup, so changing one changes the other; a wrong value shifts every ETA.' },
    { id: 'noon-fo', sel: '#noonRobFo', title: 'Logbook ROB \u2014 fuel oil',
      text: 'Enter the fuel oil ROB reported at that noon (MT). It is the reference the tank-by-tank figures below are compared with on the Results tab.',
      check: s => noonOf(s, 'fo') > 0 || 'Enter the fuel oil ROB from the noon report (MT, above 0).' },
    { id: 'noon-do', when: doUsed, sel: '#noonRobDo', title: 'Logbook ROB \u2014 diesel oil',
      text: 'Enter the diesel oil (LSMGO/DO) ROB from the same noon report (MT).',
      check: s => noonOf(s, 'do') > 0 || 'Enter the diesel oil ROB from the noon report (MT, above 0).' },
    { id: 'noon-lube', sel: '#noonRobCyl', title: 'Logbook ROB \u2014 cylinder oil', optional: true, okMsg: 'Optional \u2014 type the litres from the noon report, or leave 0, then tap Next.',
      text: 'Cylinder oil ROB from the noon report, in litres. Leave 0 if you do not plan it.' },
    { id: 'noon-mesys', when: lubeUsed('mesys'), sel: '#noonRobMesys', title: 'Logbook ROB \u2014 ME system oil', optional: true, okMsg: 'Optional \u2014 type the litres from the noon report, or leave 0, then tap Next.',
      text: 'Main engine system oil ROB from the noon report, in litres. It appears because you entered a daily make-up for it on Setup.' },
    { id: 'noon-gesys', when: lubeUsed('gesys'), sel: '#noonRobGesys', title: 'Logbook ROB \u2014 GE system oil', optional: true, okMsg: 'Optional \u2014 type the litres from the noon report, or leave 0, then tap Next.',
      text: 'Generator engine system oil ROB from the noon report, in litres. It appears because you entered a daily make-up for it on Setup.' },
    { id: 'noon-fw', sel: '#noonRobFw', title: 'Logbook ROB \u2014 fresh water', optional: true, okMsg: 'Optional \u2014 type the m\u00b3 from the noon report, or leave 0, then tap Next.',
      text: 'Fresh water ROB from the noon report, in m\u00b3. It is only a logbook reference; the water tanks further down hold the figures the plan really uses.' },
    { id: 'noon-dw', sel: '#noonRobDw', title: 'Logbook ROB \u2014 drinking water', optional: true, okMsg: 'Optional \u2014 type the m\u00b3 from the noon report, or leave 0, then tap Next.',
      text: 'Drinking water ROB from the noon report, in m\u00b3. Like fresh water it is a logbook reference.' },
    ...tankSteps('fo'),
    { id: 'tank-role', when: anyTank, sel: s => tf(0, 'category'), optional: true, okMsg: '\u2713 Change it only for a settling or service tank \u2014 then tap Next.', title: 'Tank role',
      text: 'Storage / active tanks are consumed from automatically. A Settling or service tank sits between storage and the engine: it counts in the total ROB but is not drained by the plan. Support / fixed ROB holds a quantity that never changes. The role can be changed here on any tank.' },
    { id: 'tank-name', when: anyTank, sel: s => `${tf(0, 'namePreset')}, ${tf(0, 'name')}`, optional: true, okMsg: '\u2713 Rename a tank only if the vessel uses another name \u2014 then tap Next.', title: 'Tank name',
      text: 'Pick the usual name of the tank from the list, or choose Custom and type your own (for example No.1 FO Storage P). The name is shown on the tank list, the bunkering tab and the forms.' },
    { id: 'tank-consume', when: anyTank, sel: s => tf(0, 'consumable'), optional: true, okMsg: '\u2713 Untick it for a tank that must keep its ROB \u2014 then tap Next.', title: 'Consume automatically',
      text: 'Ticked, the plan drains this tank in its sequence order. Untick it for a tank whose ROB must stay as typed (it is then counted in the total ROB but never consumed, and shows an F instead of a sequence number).' },
    { id: 'tank-additive', when: s => anyTank(s) && (s.stores && s.stores.additives || []).length > 0 && (s.tanks || []).some(t => isFuelGroup(t.group)),
      sel: s => `[data-st-dose="${((s.tanks || []).find(t => isFuelGroup(t.group)) || {}).id}"]`, optional: true, okMsg: '\u2713 Blank uses the additive\u2019s own dosage \u2014 then tap Next.', title: 'Additive dosage in this tank',
      text: 'Litres of additive per MT bunkered into this tank. Leave a box blank to use the additive\u2019s own dosage from Fuel additives. This block appears on fuel and diesel tanks once an additive has been added.' },
    { id: 'tank-order', when: s => (s.tanks || []).length >= 2, sel: s => '[data-move-order="0"]', optional: true, okMsg: '\u2713 Use the arrows to change the order of the list \u2014 then tap Next.', title: 'Move a tank up or down',
      text: 'The up and down arrows at the bottom of each tank card move it in the list. The order of the list is the order shown on the Dashboard and in the forms; the consumption sequence is the separate number at the top of the card.' },
    { id: 'tank-remove', when: anyTank, sel: s => '[data-remove-tank="0"]', optional: true, okMsg: '\u2713 Only tap it to delete a tank \u2014 tap Next to continue.', title: 'Remove a tank',
      text: 'Remove deletes the tank with its ROB and its bunkering allocations. Do not tap it now unless the tank really does not exist on the vessel.' },
    ...tankSteps('do'), ...tankSteps('cyl'), ...tankSteps('mesys'), ...tankSteps('gesys'),
    { id: 'water-add-fw', sel: '[data-st-addwt="fw"]', title: 'Fresh water tanks', optional: true, okMsg: '\u2713 Tap Fresh for every fresh water tank \u2014 or skip if you do not plan water \u2014 then tap Next.',
      text: 'Tap Fresh in the Fresh water & drinking water block to add a fresh water tank. Water is optional: add tanks only if you want the plan to show how long the water lasts.' },
    { id: 'water-add-dw', sel: '[data-st-addwt="dw"]', title: 'Drinking water tanks', optional: true, okMsg: '\u2713 Tap Drinking for every drinking water tank \u2014 or skip \u2014 then tap Next.',
      text: 'Tap Drinking to add a drinking water tank in the same way. Each tank card then opens with its own name, type, ROB and capacity.' },
    { id: 'water-name', when: hasWaterTank, sel: '[data-st-wt][data-st-f="name"]', title: 'Water tank name', optional: true, okMsg: '\u2713 Blank uses the default name \u2014 then tap Next.',
      text: 'Name of the water tank, for example Fresh Water Tank No.1. The default name follows the tank type.' },
    { id: 'water-cap', when: hasWaterTank, sel: '[data-st-wt][data-st-f="capacity"]', title: 'Water tank capacity', optional: true, okMsg: '\u2713 Capacity in m\u00b3 \u2014 then tap Next.',
      text: 'Capacity of the tank in m\u00b3. The tank bar and the overfill check use it, and the FWG stops filling a full tank.' },
    { id: 'water-rob', when: hasWaterTank, sel: '[data-st-wt][data-st-f="rob"]', title: 'Water tank ROB', optional: true, okMsg: '\u2713 Present quantity in m\u00b3 \u2014 then tap Next.',
      text: 'What is in the tank now (m\u00b3), the starting stock of the water plan.' },
    { id: 'water-fw-rate', when: s => waterOf(s, 'fw').length > 0, sel: '[data-st-rate="fw"]', title: 'Fresh water consumption', optional: true, okMsg: '\u2713 Cubic metres per day \u2014 then tap Next.',
      text: 'Fresh water used per day (m\u00b3/day), at sea and in port. The plan subtracts it from the fresh water tanks leg by leg.' },
    { id: 'water-dw-rate', when: s => waterOf(s, 'dw').length > 0, sel: '[data-st-rate="dw"]', title: 'Drinking water consumption', optional: true, okMsg: '\u2713 Cubic metres per day \u2014 then tap Next.',
      text: 'Drinking water used per day (m\u00b3/day), at sea and in port.' },
    { id: 'water-fwg', when: s => waterOf(s, 'fw').length > 0, sel: '[data-st-fwg="day"]', title: 'Fresh water generator (FWG)', optional: true, okMsg: '\u2713 Leave 0 if the vessel has no FWG \u2014 then tap Next.',
      text: 'Fresh water the FWG makes per day (m\u00b3/day). It is added to the fresh water tanks as the voyage goes on; what does not fit is counted as lost.' },
    { id: 'water-fwg-tank', when: s => waterOf(s, 'fw').length >= 2, sel: '[data-st-sel="fwgTank"]', title: 'FWG supplies which tank', optional: true, okMsg: '\u2713 The first fresh water tank is used if you leave it \u2014 then tap Next.',
      text: 'Choose the fresh water tank the FWG fills first; when it is full the rest goes to the other fresh water tanks.' },
    { id: 'water-draw', when: s => waterOf(s, 'fw').length >= 2 || waterOf(s, 'dw').length >= 2, sel: s => waterOf(s, 'fw').length >= 2 ? '[data-st-sel="draw:fw"]' : '[data-st-sel="draw:dw"]', title: 'Which tank is drawn first', optional: true, okMsg: '\u2713 List order is used if you leave it \u2014 then tap Next.',
      text: 'With more than one tank of a type, choose the one consumed first; when it is empty the next tanks are used in list order.' },
    { id: 'save-date', sel: '#tankSaveAt', title: 'Condition date and time', optional: true, okMsg: '\u2713 The local date and time of this tank condition \u2014 then tap Next.',
      text: 'Local date and time of the tank condition you are about to save. It is the label of the record in the saved list; it does not move the voyage start, which is the noon report date at the top.' },
    { id: 'save-now', sel: '[data-tank-save-now]', title: 'Today (local)', optional: true, okMsg: '\u2713 Tap it to put today\u2019s date in the box \u2014 then tap Next.',
      text: 'Sets the condition date to today in the chosen time zone and keeps the time you typed.' },
    { id: 'save-zone-mode', sel: '[data-tank-zone-mode="offset"]', title: 'Time zone: UTC offset or port', optional: true, okMsg: '\u2713 Choose one of the two buttons \u2014 then tap Next.',
      text: 'Choose how the time zone of the condition is given: UTC offset, or Port name, which looks the offset up from the port and the date.' },
    { id: 'save-zone', sel: () => (hasDoc() && document.querySelector('#tankSavePort')) ? '#tankSavePort' : '#tankSaveOffset', title: 'Time zone of the condition', optional: true, okMsg: '\u2713 It must match the ship\u2019s clock \u2014 then tap Next.',
      text: 'Pick the UTC offset (or the port) of the ship at that moment. A port that is not recognised cannot be saved, so pick one from the list.' },
    { id: 'save-condition', sel: '[data-tank-save]', title: 'Save the tank condition', optional: true, okMsg: 'Tap Save tank condition, then tap Next.',
      text: 'When every tank is entered, tap Save tank condition. Only a saved condition keeps the date, time and each tank\u2019s density, volume, temperature and ROB as a record you can restore later. Change a tank afterwards and the status turns amber \u2014 save again.' }
  ],
  bunkering: [
    { id: 'bk-ports', when: s => route(s).length > 0, sel: s => `[data-open-key="bunkport:${firstBunkerPort(s)}"]`, title: 'Where do you bunker?', optional: true, okMsg: '\u2713 Open the port where you plan to bunker \u2014 or skip bunkering if none is planned \u2014 then tap Next.',
      text: 'Each port has its own card. Open the port where fuel, diesel or lube oil will be received. If you do not know how much to take, leave this and use Home \u203a Plan a bunkering, which works the quantity out and writes it here for you.' },
    { id: 'bk-fueltype', when: s => route(s).length > 0, sel: s => { const w = fuelWhere(s); return `select[data-mp="bunker"][data-bunker-route="${w.i}"][data-bunker-fuel="${w.g}"]`; }, title: 'Fuel type of this bunker', optional: true, okMsg: '\u2713 Grade chosen \u2014 tap Next. (The default is fine when it matches the BDN.)',
      text: 'Pick the grade being bunkered from the list (for example VLSFO, HFO, LSMGO) or choose Other and type your own. Only tanks of the same type are offered to receive it. New VLSFO needs an empty tank \u2014 only the unpumpable quantity may remain \u2014 because it cannot be mixed with old VLSFO ROB; HFO, diesel oil and biodiesel may top up a tank of the same type.' },
    { id: 'bk-sulphur', when: s => route(s).length > 0, sel: s => { const w = fuelWhere(s); return bkAt(w.i, w.g, 'sulphur'); }, title: 'Sulphur % of this bunker', optional: true, okMsg: 'Blank = the default (VLSFO 0.5 %, LSMGO 0.1 %). Type the BDN figure, then tap Next.',
      text: 'The sulphur content (% m/m) from the BDN. It is blended by mass into each receiving tank, including the unpumpable quantity left in it, and it decides what can be burned inside an ECA/SECA. Leave it blank to use the default.' },
    { id: 'bk-qty', when: s => route(s).length > 0, sel: s => { const b = bunkerEvents(s)[0]; return b ? `[data-bunker-route="${b.i}"][data-bunker-fuel="${b.g}"][data-bunker-field="quantity"]` : '[data-bunker-field="quantity"]'; }, title: 'Bunker quantity', optional: true, okMsg: '\u2713 Quantity entered \u2014 tap Next. (Nothing planned? That is fine too.)',
      text: 'Type the quantity to receive (MT for fuel and diesel, litres for lube oils). Leave 0 where there is no bunkering. The grade and the sulphur % from the BDN are the two boxes above it.' },
    { id: 'bk-proposed', when: s => route(s).length > 0 && anyTank(s) && !(bunkerEvents(s).some(x => isFuelG(x.g)) && bunkerEvents(s).filter(x => isFuelG(x.g)).every(x => x.e.entryMode === 'tanks')), sel: s => { const w = bkWhere(s, x => isFuelG(x.g) && x.e.entryMode !== 'tanks', 'fo'); return `[data-use-proposed="${w.i}:${w.g}"]`; }, title: 'Proposed quantity \u2014 Use this', optional: true, okMsg: '\u2713 Tap Use this to take the proposed load, or type your own figure \u2014 then tap Next.',
      text: 'Under the quantity box the planner shows what each eligible tank can still take, up to the company maximum fill, and the total. Use this puts that total in the quantity box so you do not have to work it out. Tap it only when you want a full load; otherwise type your own quantity.' },
    { id: 'bk-auto', when: s => bunkerEvents(s).some(x => x.e.mode !== 'drums' && x.e.entryMode !== 'tanks'), sel: s => { const b = bunkerEvents(s).find(x => x.e.mode !== 'drums' && x.e.entryMode !== 'tanks'); return bkAt(b.i, b.g, 'autoAllocate'); }, title: 'Auto-allocate by tank free capacity', optional: true, okMsg: '\u2713 Leave it ticked for the planner to place the quantity, or untick it to choose the tanks \u2014 then tap Next.',
      text: 'Ticked (the default): you type one total and the planner fills the eligible tanks in order, each up to the company maximum fill, until the whole quantity is placed. Untick it only when you want to choose the tanks yourself.' },
    { id: 'bk-entry', when: s => bunkerEvents(s).some(x => x.e.mode !== 'drums') && anyTank(s), sel: s => { const b = bunkerEvents(s).find(x => x.e.mode !== 'drums') || bunkerEvents(s)[0]; return `[data-alloc-route="${b.i}"][data-alloc-fuel="${b.g}"]`; }, title: 'One total, or tank by tank', optional: true, okMsg: '\u2713 Type here only to enter a tank yourself \u2014 then tap Next.',
      text: 'There are two ways to enter a bunker: type the total in the quantity box and let the planner place it, or type the quantity straight into each tank under \u201cOr enter the quantity into each tank\u201d \u2014 the quantity box then becomes the total of the tanks. Typing in the quantity box again goes back to a total. Under each tank you see the room left and, for fuel, how full it will be after bunkering.' },
    { id: 'bk-alloc', when: s => bunkerEvents(s).length > 0, sel: s => { const b = badBunker(s) || bunkerEvents(s)[0]; return `[data-alloc-route="${b.i}"][data-alloc-fuel="${b.g}"]`; }, title: 'Which tanks receive it?',
      text: 'Check where the quantity goes. Tanks that cannot take this grade are greyed out. If you untick Auto-allocate, the tank quantities must add up to the bunker quantity. New VLSFO needs a tank with no old VLSFO in it.',
      check: s => { const b = badBunker(s); return b ? b.msg : true; } },
    { id: 'bk-mode', when: s => route(s).length > 0 && lubeAny(s), sel: s => { const g = ['cyl', 'mesys', 'gesys'].find(x => lubeUsed(x)(s)); const w = bkWhere(s, x => !isFuelG(x.g), g); return bkAt(w.i, w.g, 'mode'); }, title: 'Lube oil received as bulk or in drums', optional: true, okMsg: '\u2713 Bulk is the usual choice \u2014 tap Next.',
      text: 'Bulk: the lube oil goes straight into the storage tank. In drums: it is stored aboard in drums, separately from the tanks (it does not raise any tank ROB), and is pumped over by hand later.' },
    { id: 'bk-drums', when: s => bunkerEvents(s).some(x => x.e.mode === 'drums'), sel: s => { const w = bkWhere(s, x => x.e.mode === 'drums', 'cyl'); return `[data-drum-panel="${w.i}:${w.g}"]`; }, title: 'Pump from drums into tank', optional: true, okMsg: '\u2713 Type the quantity pumped into each tank \u2014 or leave it for later \u2014 then tap Next.',
      text: 'When lube oil is received in drums, this box appears. Type how much is pumped by hand from the drums into each storage tank at this port or at a later one. It is taken from the drum stock (never more than is aboard) and added to the tank (never beyond its capacity). It is not counted as a second bunkering.' },
    lubeBunkerStep('cyl', 'Cylinder oil'), lubeBunkerStep('mesys', 'ME system oil'), lubeBunkerStep('gesys', 'GE system oil'),
    { id: 'bk-addline', when: s => additives(s).length > 0 && bunkerEvents(s).some(x => isFuelG(x.g)), sel: s => { const w = fuelWhere(s); return `[data-add-line="${w.i}:${w.g}"]`; }, title: 'Additive needed for this bunker', optional: true, okMsg: '\u2713 Nothing to type here \u2014 tap Next.',
      text: 'When an additive is listed in the Fuel additives box at the bottom of this tab, a line under the bunker shows the litres to dose for this quantity (tank by tank when several tanks receive it). It is worked out from the dosage you set for the additive.' },
    { id: 'bk-cond', when: s => route(s).length > 0, sel: s => { const w = fuelWhere(s); return `[data-bunker-cond="${w.i}:${w.g}"]`; }, title: 'Tank condition at ETA and ETD', optional: true, okMsg: '\u2713 Nothing to type here \u2014 tap Next.',
      text: 'The bars under each product show every tank as a ROB / capacity bar at arrival (ETA) and after the bunkering and the port stay (ETD). Watch for a bar that turns amber or red \u2014 it passes the company maximum fill or the tank capacity \u2014 and change the quantity or the tanks.' },
    { id: 'bk-delete', when: s => route(s).length > 0, sel: s => `[data-delete-bunkering="${firstBunkerPort(s)}"]`, title: 'Delete entry', optional: true, okMsg: '\u2713 Do not tap it now \u2014 tap Next.',
      text: 'Delete entry in the port\u2019s title bar removes every fuel, diesel and lube oil bunkering typed for that port in one go (after a confirmation). It is greyed when nothing is entered. Use it only when the bunkering at that port is cancelled.' },
    { id: 'bk-ad-add', when: s => route(s).length > 0, sel: '[data-st-addad]', title: 'Fuel additives \u2014 add one', optional: true, okMsg: '\u2713 Tap + Additive for each additive you carry \u2014 or skip \u2014 then tap Next.',
      text: 'The Fuel additives box at the bottom of this tab lists the fuel treatment products aboard. Tap + Additive for each one. The planner then works out the litres needed for every bunker and warns when the additive ROB will run out.' },
    { id: 'bk-ad-name', when: s => route(s).length > 0 && additives(s).length > 0, sel: adSel('name'), title: 'Additive name', optional: true, okMsg: '\u2713 Name typed \u2014 tap Next.',
      text: 'The name of the additive, for example the product name on the drum. It is shown on the bunker line and in the alerts.' },
    { id: 'bk-ad-treats', when: s => route(s).length > 0 && additives(s).length > 0, sel: s => `[data-st-sel="adfuel:${adBad(s, 'name').id}"]`, title: 'What the additive treats', optional: true, okMsg: '\u2713 Pick the fuel group it is dosed into \u2014 tap Next.',
      text: 'Choose the fuel group the additive is dosed into. It is then added to every bunker of that group at the dosage below.' },
    { id: 'bk-ad-rob', when: s => route(s).length > 0 && additives(s).length > 0, sel: adSel('rob'), title: 'Additive ROB (litres)', optional: true, okMsg: '\u2713 Litres on board typed \u2014 tap Next.',
      text: 'The litres of this additive on board now. Each bunker uses some of it, so the planner can tell you at which port it runs out.' },
    { id: 'bk-ad-dose', when: s => route(s).length > 0 && additives(s).length > 0, sel: adSel('dose'), title: 'Dosage (litres per MT bunkered)', optional: true, okMsg: '\u2713 Dosage typed \u2014 tap Next. (A tank on the Tanks tab can override it.)',
      text: 'The litres of additive dosed for every MT of fuel bunkered, from the maker\u2019s instruction. A dosage typed in a single fuel tank on the Tanks tab overrides this figure for that tank.' },
    { id: 'bk-ad-remove', when: s => route(s).length > 0 && additives(s).length > 0, sel: s => `[data-st-delad="${adBad(s, 'name').id}"]`, title: 'Remove an additive', optional: true, okMsg: '\u2713 Do not tap it now \u2014 tap Next.',
      text: 'Remove deletes the additive from the list. Use it only when the product is no longer carried; its bunker lines and run-out alerts disappear with it.' }
  ],
  eca: [
    { id: 'eca-port', when: s => route(s).length > 0, optional: true, okMsg: '\u2713 Tick every port inside an ECA/SECA \u2014 or skip if the voyage never enters one \u2014 then tap Next.',
      sel: s => { const r = route(s), i = Math.max(0, r.findIndex(ecaOn)); return pf(i, 'enabled'); }, title: 'Is any port in an ECA/SECA?',
      text: 'Tick \u201cThis port is in an ECA/SECA\u201d on each port inside an Emission Control Area. The plan then times the fuel changeover so the low-sulphur fuel is in use before the ECA line. If no port is inside one, skip this tab.' },
    opt('eca-prev', entWhen, s => pf(entI(s), 'prevToLineNm'), 'Distance from the previous port to the ECA line', 'Blank = the leg distance minus the distance inside the area. Change it only if you know it, then tap Next.',
      'Nautical miles sailed outside the ECA/SECA, from the previous port to the boundary on the way to this port. Leave it blank and the app uses the leg distance minus the distance from the line to the port.'),
    ecaStep('eca-dist', 'dist', 'Distance from the ECA line to the port', 'Nautical miles from the ECA/SECA boundary to this port. The changeover must be finished before the vessel crosses the line, so this distance and the leg speed fix the start time.', s => pf(ecaEntering(s)[0], 'lineToPortNm')),
    opt('eca-method', entWhen, s => ef(entI(s), 'entering', 'method'), 'How will the vessel comply?', '\u2713 Fuel changeover is the usual choice \u2014 tap Next.',
      'Choose Fuel changeover to plan the switch to a compliant fuel, or Scrubber (EGCS) when the vessel complies with an approved exhaust gas cleaning system. Both use the same FOBAS mixing calculation, inputs and results.'),
    opt('eca-fromfuel', entWhen, s => mp(entI(s), 'entering', 'fromFuel'), 'Change over from (fuel)', '\u2713 Pick the fuel in the service system now, or type your own with Other \u2014 then tap Next.',
      'The fuel now in the service system, for example HFO or VLSFO. It is only a label on the result; the sulphur % below is what the calculation uses.'),
    opt('eca-tofuel', entWhen, s => mp(entI(s), 'entering', 'toFuel'), 'Change over to (fuel)', '\u2713 Pick the compliant fuel, or type your own with Other \u2014 then tap Next.',
      'The compliant fuel to be used inside the ECA/SECA (0.10 % S limit), for example 0.10 % VLSFO / ULSFO, LSMGO, MGO / DO or compliant biodiesel.'),
    ecaStep('eca-from', 'from', 'Current fuel sulphur', 'Sulphur % (from the BDN) of the fuel now in the service system \u2014 the starting point of the changeover calculation.', s => ef(ecaEntering(s)[0], 'entering', 'fromSulphurPct')),
    ecaStep('eca-to', 'to', 'Compliant fuel sulphur', 'Sulphur % of the compliant fuel being introduced. It cannot exceed the current sulphur or the required sulphur at the engine inlet.', s => ef(ecaEntering(s)[0], 'entering', 'toSulphurPct')),
    { id: 'eca-limit', when: s => ecaEntering(s).length > 0, optional: true, okMsg: 'Blank = 0.10 %. Change it only for a different limit, then tap Next.', sel: s => ef(ecaEntering(s)[0], 'entering', 'limitPct'), title: 'Required sulphur at engine inlet',
      text: 'The sulphur % wanted at the engine inlet inside the ECA/SECA (0.10 % for the IMO-designated areas). Leave blank to use the default.' },
    opt('eca-sys-on', entWhen, s => sf(entI(s), 'entering', 'me', 'on'), 'Main Engine, Aux. Engine and Boiler', '\u2713 Untick a system that is not changed over \u2014 then tap Next.',
      'The changeover is calculated separately for the Main Engine, the Aux. Engine and the Boiler. Leave a system ticked when it burns this fuel; untick one that does not (for example a vessel with no boiler on this fuel). An unticked system is left out of the result.'),
    opt('eca-rate', s => entWhen(s) && SYS_KEYS.some(k => sysOn(entCfg(s, entI(s)), k)), s => { const c = entCfg(s, entI(s)); return sf(entI(s), 'entering', sysPick(c, x => N(x.rate) > 0), 'rate'); }, 'Consumption rate (t/hr)', 'A rate of 0 gives no result for that system. Type it, then tap Next.',
      'The fuel consumption rate of the system during the changeover, in tonnes per hour. Type it for each ticked system. It is suggested again automatically for the next changeover on another port.'),
    opt('eca-qtyunit', s => entWhen(s) && SYS_KEYS.some(k => sysOn(entCfg(s, entI(s)), k)), s => { const c = entCfg(s, entI(s)); return sf(entI(s), 'entering', sysPick(c, x => N(x.qty) > 0 || N(x.qtyL) > 0), 'qtyUnit'); }, 'Service system quantity: weight or volume', '\u2713 Weight (t) is the default \u2014 tap Next.',
      'Choose how the service system quantity is typed: Weight in tonnes, or Volume in litres. Litres are converted to tonnes with the fuel density entered on the Tanks tab.'),
    opt('eca-qty', s => entWhen(s) && SYS_KEYS.some(k => sysOn(entCfg(s, entI(s)), k)), s => { const c = entCfg(s, entI(s)); const k = sysPick(c, x => N(x.qty) > 0 || N(x.qtyL) > 0); return sf(entI(s), 'entering', k, sysOf(c, k).qtyUnit === 'L' ? 'qtyL' : 'qty'); }, 'Service system quantity', 'Below 0.1 t is treated as 0.1 t. Type it, then tap Next.',
      'The fuel held in the service and mixing volume of the system, including the mixing column and pipework (Q), from the vessel\u2019s changeover procedure. Values below 0.1 t are treated as 0.1 t, as in the FOBAS workbook. It is suggested again automatically for the next changeover.'),
    opt('eca-result', entWhen, s => `[data-eca-slot="${entI(s)}:entering"]`, 'Reading the entering result', '\u2713 Nothing to type here \u2014 tap Next.',
      'Below the boxes the card shows the hours needed, the start and finish time of the changeover, the vessel position when it starts and the safety margin \u2014 how long before the ECA line the changeover finishes. A position shown as \u201cBeyond the last port in the plan\u201d means the next port is missing: add a port on the Ports tab. Always check the result against the vessel\u2019s approved procedure.'),
    { id: 'eca-exit', when: s => ecaLeaving(s).length > 0, optional: true, okMsg: 'Blank = same as the entry distance. Check it, then tap Next.', sel: s => pf(ecaLeaving(s)[0], 'exitNm'), title: 'Distance to the ECA line when leaving',
      text: 'Nautical miles from this port to the ECA/SECA boundary on departure. The changeover back to the higher-sulphur fuel starts once the vessel is clear of that line.' },
    opt('eca-leave-from', lvWhen, s => ef(lvI(s), 'leaving', 'fromSulphurPct'), 'Leaving: current (compliant) sulphur', '\u2713 Copied from the entering changeover \u2014 check it, then tap Next.',
      'Sulphur % of the compliant fuel in the service system when the vessel leaves the area, from its BDN. It follows the entering changeover until you change it here.'),
    opt('eca-leave-to', lvWhen, s => ef(lvI(s), 'leaving', 'toSulphurPct'), 'Leaving: sulphur of the fuel to resume', '\u2713 Type the BDN figure of the fuel you switch back to \u2014 then tap Next.',
      'Sulphur % of the fuel you switch back to once clear of the area. When both fuels are within 0.50 % S, the switch is a fixed 0.3 h on the Main Engine, Aux. Engine and Boiler together; above 0.50 % S the mixing model is used and the rate and quantity boxes appear.'),
    opt('eca-leave-limit', s => lvWhen(s) && !leaveFixed(lvCfg(s, lvI(s))), s => ef(lvI(s), 'leaving', 'limitPct'), 'Leaving: required sulphur at engine inlet', 'Blank = 95 % of the way to the resume fuel sulphur. Change it only for a different target, then tap Next.',
      'The sulphur % wanted at the engine inlet before the higher-sulphur fuel counts as fully in use again. The mixing time to reach it starts when the vessel clears the ECA/SECA line. Blank = 95 % of the way to the sulphur of the fuel to resume.'),
    opt('eca-leave-result', lvWhen, s => `[data-eca-slot="${lvI(s)}:leaving"]`, 'Reading the leaving result', '\u2713 Nothing to type here \u2014 tap Next.',
      'The leaving card shows the hours needed and the start and finish time. The rule is: start right after the ECA line, and do not resume the higher-sulphur fuel until the vessel is fully clear of the area.')
  ],
  dashboard: [
    { id: 'home-route', sel: '#routeSummary', title: 'Check the calculated route',
      text: 'Home lists the succeeding ports with ETA, ETD and port stay, calculated from the ports and tanks you entered. Every figure updates live; if a port shows no date, go back and complete its distance, speed and stay.',
      check: s => planReady(s) },
    { id: 'home-bunker', sel: '#bunkerNeeded', title: 'Bunker needed', optional: true, okMsg: '\u2713 Read the figures \u2014 then tap Next.',
      text: 'This panel shows how much you still need to bunker, and where ROB would run short, against the reserve you set on the Setup tab.' },
    { id: 'home-plan', sel: PB_BTN, title: 'Plan a bunkering', optional: true, okMsg: '\u2713 Tap the button to open the planner \u2014 the next steps walk through it. Then tap Next.',
      text: 'Plan a bunkering works out what to take at any port, tank by tank, and can write it to the Bunkering tab or export the Bunker/Internal Transfer Plan forms. Tap the button now: the guide folds while the popup is open and keeps pointing at its boxes. Quantities are rounded down: fuel and diesel to the nearest 10 MT, lube oils to the nearest 100 L.' },
    { id: 'pb-port', sel: pbSel('#pbPort'), title: 'Plan a bunkering \u2014 port', optional: true, okMsg: '\u2713 Pick the port you want to bunker at \u2014 then tap Next.',
      text: 'Choose the bunkering port. Every port of the Ports tab is listed with its ETA. The last choice, Other port / date\u2026, is for a port that is not on the route yet. The plan below updates as soon as you change anything.' },
    { id: 'pb-other', sel: (s, touched) => !pbOpen() ? PB_BTN : fieldShown('pbName') ? '#' + popupField(PB_OTHER_ORDER, touched, fieldShown) : '#pbPort', title: 'Other port or date', optional: true, okMsg: '\u2713 Only needed for a port that is not on the route \u2014 then tap Next.',
      text: 'These boxes appear only when you pick Other port / date\u2026 in the port list: port name, arrival date and time (local), the UTC offset of that port, and the stay in port in hours. The planner then works out the ROB at that moment. A port that is not on the Ports tab can be planned but not saved to the Bunkering tab or exported \u2014 add it to the route first.' },
    { id: 'pb-until', sel: pbSel('#pbUntil'), title: 'Cover the voyage until', optional: true, okMsg: '\u2713 End of the voyage is the usual choice \u2014 then tap Next.',
      text: 'How far the bunker must reach: the end of the voyage (last port including its stay) or the arrival at one of the later ports. The planner adds the reserve you set on the Setup tab on top.' },
    { id: 'pb-margin', sel: pbSel('#pbMargin'), title: 'Extra margin (%)', optional: true, okMsg: 'Blank = no extra margin \u2014 then tap Next.',
      text: 'An extra percentage added to the quantity needed (0 to 50 %), for example for bad weather or a delay. Leave it empty when the reserve is enough.' },
    { id: 'pb-fill', sel: pbSel('#pbFill'), title: 'Fill to the maximum tank fill', optional: true, okMsg: 'Leave it unticked unless you want full tanks \u2014 then tap Next.',
      text: 'Tick it to take as much as the tanks can hold up to the company maximum tank fill (set on the Tanks tab) instead of only what the voyage needs. The percentage in brackets is that maximum.' },
    { id: 'pb-compare', sel: () => pbOpen() ? '#pbCompareBox > summary' : PB_BTN, title: 'Compare ports', optional: true, okMsg: '\u2713 Open it to see every port side by side \u2014 then tap Next.',
      text: 'Compare ports shows the same settings (margin, fill, fuel grade, sulphur) at every port of the route, so you can see at which ports a bunker is needed and how much. Tap a port in the list to plan it.' },
    { id: 'pb-results', sel: () => pbOpen() ? '#pbResults' : PB_BTN, title: 'Reading the plan', optional: true, okMsg: '\u2713 Nothing to type here \u2014 tap Next.',
      text: 'The result shows the port, ETA, ETD and stay, what the plan covers, and for every product the quantity to take tank by tank. You can still change the fuel grade, the sulphur % or the quantity of one tank there; Reset puts the calculated quantities back.' },
    { id: 'pb-apply', sel: pbSel('#pbApply'), title: 'Save the plan to the Bunkering tab', optional: true, okMsg: '\u2713 Save when the plan is what you want \u2014 then tap Next.',
      text: 'Save writes these quantities into the Bunkering tab for this port, tank by tank (it asks first if something is already entered there). It is only available for a port on the route when there is something to bunker.' },
    { id: 'pb-export', sel: pbSel('#pbExport'), title: 'Export the bunker forms', optional: true, okMsg: '\u2713 Tap Export when you need the forms \u2014 then tap Next.',
      text: 'Export saves the plan to the Bunkering tab and writes the Bunker / Internal Transfer Plan & Result form and the Lube Oil Replenishment form as a Word file. Tapping it first asks which form you want.' },
    { id: 'pb-forms', sel: (s, touched) => !pbOpen() ? PB_BTN : fieldShown('pbFormBunker') ? '#' + popupField(PB_FORM_ORDER, touched, fieldShown) : '#pbExport', title: 'Which form to export', optional: true, okMsg: '\u2713 Tick only the forms you want \u2014 then tap Next.',
      text: 'After Export, tick Bunker / Internal Transfer Plan & Result form and / or Lube Oil Replenishment Plan and Result Record (a form is ticked for you when the plan has something for it), then tap Export selected. Nothing is exported unless a box is ticked; Cancel closes the question. When you are done, tap \u2013 on this card if it covers the popup, then close the popup with the \u2715.' },
    { id: 'home-rob', sel: RV_BTN, title: 'Tank ROB', optional: true, okMsg: '\u2713 Tap it to open the viewer \u2014 then tap Next.',
      text: 'Tank ROB shows what is in every tank at a port (at its ETA and ETD) or at the noon report of any date. Tap it now; the next steps walk through the popup.' },
    { id: 'rv-mode', sel: rvSel('.rv-modes'), title: 'Tank ROB \u2014 what to show', optional: true, okMsg: '\u2713 Choose At a port or Noon report by date \u2014 then tap Next.',
      text: 'At a port shows the tanks at the arrival and the departure of one port. Noon report by date shows the tanks at 12:00 local on a date you choose, and whether the vessel is in port or at sea then.' },
    { id: 'rv-port', sel: () => !rvOpen() ? RV_BTN : fieldShown('rvPort') ? '#rvPort' : '[data-rv-mode="port"]', title: 'Tank ROB \u2014 port', optional: true, okMsg: '\u2713 Pick any port of the route \u2014 then tap Next.',
      text: 'Pick a port of the route to see the tank ROB at its ETA and ETD. (If the box is not on screen, tap At a port first.)' },
    { id: 'rv-date', sel: () => !rvOpen() ? RV_BTN : fieldShown('rvDate') ? '#rvDate' : '[data-rv-mode="noon"]', title: 'Tank ROB \u2014 noon report date', optional: true, okMsg: '\u2713 Pick a date inside the voyage \u2014 then tap Next.',
      text: 'Choose the date of the noon report. The viewer shows the ROB at 12:00 local on that date. (If the box is not on screen, tap Noon report by date first.)' },
    { id: 'rv-goto', sel: () => !rvOpen() ? RV_BTN : fieldShown('rvGoto') ? '#rvGoto' : '#rvBody', title: 'Tank ROB \u2014 go to the source', optional: true, okMsg: '\u2713 Nothing to type here \u2014 tap Next.',
      text: 'Under the figures, Go to source jumps to the tab where the value comes from, so you can correct it there. When you are done, tap \u2013 on this card if it covers the popup, then close the popup with the \u2715.' },
    { id: 'home-eco', when: s => route(s).some(ecaOn), sel: '#ecoBtn', title: 'Change-over Details', optional: true, okMsg: '\u2713 Tap it to see each change-over \u2014 then tap Next.',
      text: 'This button appears because a port is flagged as being in an ECA/SECA. Choose entering or leaving to see when each system (Main Engine, Aux. Engine, Boiler) must change fuel, with a timeline and a checklist. The numbers are the ones of the ECA/SECA tab.' },
    { id: 'home-search', sel: '#searchInput', title: 'Search the plan', optional: true, okMsg: '\u2713 Try it any time \u2014 then tap Next.',
      text: 'Type a question such as \u201cBusan ETA\u201d, \u201cVLSFO ROB\u201d, \u201cbunker\u201d or \u201cECA\u201d and tap Search. The answer and every matching figure are listed, and tapping one jumps to where it comes from.' },
    { id: 'home-alerts', sel: '#alertsBtn', title: 'Planning alerts (bell)', optional: true, okMsg: '\u2713 The number on the bell is how many alerts there are \u2014 then tap Next.',
      text: 'The bell in the top bar lists every warning of the plan: a shortage, an overfilled tank, a missing value. Tap an alert to jump to the field that causes it and see how to correct it.' },
    { id: 'home-calc', sel: '#calcBtn', title: 'Calculator', optional: true, okMsg: '\u2713 Use it whenever you need a quick sum \u2014 then tap Next.',
      text: 'The calculator icon opens a small calculator over any tab, for a quick conversion or sum without leaving the plan.' }
  ],
  results: [
    { id: 'res-rob', sel: '#robCompare', title: 'Logbook ROB vs actual tank ROB', optional: true, okMsg: '\u2713 Read the Difference column \u2014 then tap Next.',
      text: 'This card compares the logbook ROB you typed on the Tanks tab with what the tanks add up to. A difference above the tolerance (2 % of the figure, at least 1 MT or 20 L) is marked in red: check the soundings or the logbook. Tap a row to see the calculation.' },
    { id: 'res-docx', sel: '#exportDocx', title: 'Word voyage report', optional: true, okMsg: '\u2713 Export it when you need the report \u2014 then tap Next.',
      text: 'Export Voyage report writes a Word file with the tank ROB at ETA/ETD for every port, the bunkering requirements, the ECA/SECA changeovers and the latest Plan a bunkering result. It works without an internet connection.' },
    { id: 'res-bunkerform', sel: '#exportBunkerForm', title: 'Bunkering plan form', optional: true, okMsg: '\u2713 Export it when a port has a planned fuel bunkering \u2014 then tap Next.',
      text: 'Export Bunker Plan writes the Bunker / Internal Transfer Plan & Result form, one page per port with a planned fuel or diesel bunkering. Tanks, capacities, filling limit and planned quantities are filled in; soundings, BDN figures and times are left blank to write in.' },
    { id: 'res-lubeform', sel: '#exportLubeForm', title: 'Lub. oil replenishment form', optional: true, okMsg: '\u2713 Export it when a port has a planned lube oil replenishment \u2014 then tap Next.',
      text: 'Export LO Rep. Form writes the Lub. Oil Replenishment Plan and Result Record, one page per port with a planned lube oil replenishment. Tank capacity, ROB, quantities and drums are filled in; gauges, times and actual results are left blank.' },
    { id: 'res-name', sel: '#saveVoyageName', title: 'Name your voyage', optional: true, okMsg: 'Blank = the vessel name. Type a name such as \u201cMV Example \u2014 Oct 2026\u201d, then tap Next.',
      text: 'Give this plan a name you will recognise. It keeps the noon report, every tank and the whole voyage, so you can reopen it later.' },
    { id: 'res-save', sel: '#saveVoyageBtn', title: 'Save the voyage',
      text: 'Tap Save current voyage. The plan is stored on this device and appears in the list below; without a save it is lost if the app data is cleared.',
      check: () => savedVoyageCount() > 0 || 'Tap Save current voyage to keep this plan.' },
    { id: 'res-list', sel: '#savedVoyageList', title: 'Your saved voyages', optional: true, okMsg: '\u2713 Load reopens a voyage, the bin deletes it \u2014 then tap Next.',
      text: 'Every saved voyage is listed with its save time. Load replaces what is on screen with that voyage (save the current plan first if you still need it); the bin deletes the saved copy after asking. Up to 30 voyages are kept.' },
    { id: 'res-plan', sel: () => visibleEl('#demoPlan') ? '#demoPlan' : '#demoPlan2', title: 'Load demo, Clear all entry, New plan', optional: true, okMsg: '\u2713 Do not tap them now \u2014 they replace your plan. Tap Next.',
      text: 'Load demo fills the app with an example voyage. Clear all entry empties every tab. New plan (in the side menu on a tablet or computer) starts a clean plan and offers to carry over Setup, rates, reserves and tanks. Each one asks before it replaces anything, but do not use them on the plan you just entered.' },
    { id: 'res-final', sel: '#saveVoyageBtn', title: 'Save before you finish',
      text: 'Last check before the guide closes. 1) Open the Tanks tab and tap Save tank condition, so the present ROB is stored with its date and time. 2) Come back here and tap Save current voyage. If you changed anything since your last save, save again. Then confirm below.',
      check: () => savedVoyageCount() > 0 || 'Tap Save current voyage to keep this plan.',
      ask: { gate: true, count: () => savedVoyageCount(), question: finalSaveQuestion,
        yesLabel: 'Yes, both are saved', noLabel: 'Not yet',
        yesHint: 'Open the Tanks tab and tap Save tank condition, then come back and tap Save current voyage (tap the guide chip to return here). Then answer Yes.' } }
  ]
};
