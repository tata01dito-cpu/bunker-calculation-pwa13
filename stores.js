/* stores.js (v1.69) - pure helpers for fresh / drinking water tanks and fuel additives.
   No DOM, no app state: everything takes plain objects so it can be tested with node.
   Units: water m3 and m3/day, additive litres, dose = litres per MT of fuel bunkered. */
const EPS = 1e-9;
const num = (v, f = 0) => Number.isFinite(Number(v)) && v !== '' && v !== null ? Number(v) : f;
const pos = v => Math.max(0, num(v));
export const WATER_TYPES = ['fw', 'dw'];
export const WATER_LABEL = { fw: 'Fresh water', dw: 'Drinking water' };
export const ADDITIVE_FUELS = { fo: 'Fuel oil tanks', do: 'Diesel oil tanks', both: 'Fuel and diesel oil tanks' };

export function defaultStores() {
  return {
    water: {
      tanks: [],
      rates: { fw: { sea: 0, port: 0 }, dw: { sea: 0, port: 0 } },
      fwg: { sea: 0, port: 0, supplyTankId: 'auto' },
      draw: { fw: 'auto', dw: 'auto' }
    },
    additives: []
  };
}

/* Fill in anything missing so old saved plans load. Never throws. */
export function normStores(s) {
  const d = defaultStores(), w = (s && s.water) || {};
  const rate = t => ({ sea: pos(w.rates && w.rates[t] && w.rates[t].sea), port: pos(w.rates && w.rates[t] && w.rates[t].port) });
  const tanks = (Array.isArray(w.tanks) ? w.tanks : []).filter(t => t && WATER_TYPES.includes(t.type)).map((t, i) => ({
    id: String(t.id || `wt${i + 1}`), type: t.type, name: String(t.name || ''), capacity: pos(t.capacity), rob: pos(t.rob)
  }));
  const ids = tanks.map(t => t.id);
  const pick = (v, type) => (v && v !== 'auto' && tanks.some(t => t.id === v && (!type || t.type === type))) ? v : 'auto';
  const additives = (Array.isArray(s && s.additives) ? s.additives : []).filter(a => a && typeof a === 'object').map((a, i) => ({
    id: String(a.id || `ad${i + 1}`), name: String(a.name || ''), rob: pos(a.rob), dose: pos(a.dose),
    fuel: ['fo', 'do', 'both'].includes(a.fuel) ? a.fuel : 'fo'
  }));
  return {
    water: {
      tanks,
      rates: { fw: rate('fw'), dw: rate('dw') },
      fwg: { sea: pos(w.fwg && w.fwg.sea), port: pos(w.fwg && w.fwg.port), supplyTankId: ids.includes(w.fwg && w.fwg.supplyTankId) ? w.fwg.supplyTankId : 'auto' },
      draw: { fw: pick(w.draw && w.draw.fw, 'fw'), dw: pick(w.draw && w.draw.dw, 'dw') }
    },
    additives
  };
}

export const waterTanksOf = (stores, type) => ((stores && stores.water && stores.water.tanks) || []).filter(t => t.type === type);
export const waterTotals = (stores, type) => waterTanksOf(stores, type).reduce((a, t) => ({ capacity: a.capacity + pos(t.capacity), rob: a.rob + pos(t.rob) }), { capacity: 0, rob: 0 });

/* The tank the FWG fills: the chosen one, else the first fresh-water tank, else the first tank of any type. */
export function fwgTarget(stores) {
  const w = (stores && stores.water) || defaultStores().water, tanks = w.tanks || [];
  const chosen = tanks.find(t => t.id === (w.fwg && w.fwg.supplyTankId));
  return chosen || tanks.find(t => t.type === 'fw') || null;
}

/* Tanks of one type in the order they are drawn: the chosen tank first, then list order. */
export function drawOrder(stores, type) {
  const list = waterTanksOf(stores, type), pref = stores && stores.water && stores.water.draw && stores.water.draw[type];
  const first = list.find(t => t.id === pref);
  return first ? [first, ...list.filter(t => t !== first)] : list;
}

/* Put `qty` into the target tank first, then the other tanks of the same type in list order. Returns litres lost (overflow). */
function fillWater(rob, tanks, target, qty) {
  if (!(qty > EPS) || !target) return qty > EPS ? qty : 0;
  const same = tanks.filter(t => t.type === target.type), order = [target, ...same.filter(t => t.id !== target.id)];
  let left = qty;
  for (const t of order) {
    const space = Math.max(0, pos(t.capacity) - rob[t.id]);
    const add = Math.min(left, space);
    rob[t.id] += add; left -= add;
    if (left <= EPS) return 0;
  }
  return left;
}

function drawWater(rob, order, qty) {
  let left = qty;
  for (const t of order) {
    const take = Math.min(left, rob[t.id]);
    rob[t.id] -= take; left -= take;
    if (left <= EPS) return 0;
  }
  return left;
}

/* Project water through the voyage.
   results = calculateVoyage(...).results. Each row has seaDays, anchorStayDays, portStayDays.
   Anchor / drift time counts as sea time. Hourly steps: the FWG makes water first, then it is consumed.
   Returns { rows:[{index,port,arrival:{id:rob},departure:{id:rob},arrivalTotal:{fw,dw},departureTotal:{fw,dw}}], shortages, lost, produced, used, endRob } */
export function projectWater(stores, results) {
  const st = normStores(stores), w = st.water, tanks = w.tanks;
  const rob = Object.fromEntries(tanks.map(t => [t.id, Math.min(pos(t.rob), pos(t.capacity) > 0 ? pos(t.capacity) : Infinity)]));
  const out = { rows: [], shortages: [], lost: 0, produced: 0, used: { fw: 0, dw: 0 }, endRob: null };
  const totals = () => ({ fw: waterTanksOf(st, 'fw').reduce((a, t) => a + rob[t.id], 0), dw: waterTanksOf(st, 'dw').reduce((a, t) => a + rob[t.id], 0) });
  const target = fwgTarget(st), orders = { fw: drawOrder(st, 'fw'), dw: drawOrder(st, 'dw') };
  const run = (days, phase, stopIndex, portName) => {
    const d = pos(days);
    if (!(d > EPS)) return;
    const steps = Math.max(1, Math.ceil(d * 24 - 1e-9)), dt = d / steps;
    const gen = pos(w.fwg[phase]), short = { fw: 0, dw: 0 };
    for (let k = 0; k < steps; k++) {
      const made = gen * dt;
      out.produced += made; out.lost += fillWater(rob, tanks, target, made);
      for (const type of WATER_TYPES) {
        const need = pos(w.rates[type][phase]) * dt;
        if (!(need > EPS)) continue;
        const miss = drawWater(rob, orders[type], need);
        out.used[type] += need - miss; short[type] += miss;
      }
    }
    for (const type of WATER_TYPES) {
      if (!(short[type] > 1e-6)) continue;
      // sea passage and anchor time before the same port are one shortage (one alert), not two
      const hit = out.shortages.find(x => x.type === type && x.stopIndex === stopIndex && x.phase === phase);
      if (hit) hit.short += short[type]; else out.shortages.push({ type, stopIndex, port: portName, phase, short: short[type] });
    }
  };
  (results || []).forEach(r => {
    const name = r.port || `Port ${r.index + 1}`;
    run(num(r.seaDays), 'sea', r.index, name);
    const arrival = { ...rob }, arrivalTotal = totals(); // arrival = end of the sea leg, before anchor time
    run(num(r.anchorStayDays), 'sea', r.index, name);
    run(num(r.portStayDays), 'port', r.index, name);
    out.rows.push({ index: r.index, port: name, arrival, departure: { ...rob }, arrivalTotal, departureTotal: totals() });
  });
  out.endRob = { ...rob };
  return out;
}

/* Dose (L per MT) of one additive in one tank: the tank's own entry if filled in, else the additive default,
   and 0 if the additive is not meant for that tank's fuel group. */
export function additiveDoseFor(additive, tank) {
  if (!additive || !tank) return 0;
  const own = tank.additiveDose && tank.additiveDose[additive.id];
  if (own !== undefined && own !== null && own !== '') return pos(own);
  const f = additive.fuel || 'fo';
  return (f === 'both' || f === tank.group) ? pos(additive.dose) : 0;
}

/* Additive used at each port. For every fuel bunkering (results[i].bunkerInfo[g].allocations = [{tankId,quantity}])
   litres = quantity x dose of that tank. ROB falls at each bunkering.
   Returns { rows:[{index,port,items:[{id,name,litres,byTank:[{tankId,tankName,quantity,dose,litres}],robAfter}]}], totals:{id:litres}, endRob:{id}, shortages:[{id,name,stopIndex,port,short}] } */
export function additiveUsage(stores, results, tanks) {
  const st = normStores(stores), list = st.additives, tankById = Object.fromEntries((tanks || []).map(t => [t.id, t]));
  const rob = Object.fromEntries(list.map(a => [a.id, a.rob]));
  const out = { rows: [], totals: Object.fromEntries(list.map(a => [a.id, 0])), endRob: null, shortages: [] };
  (results || []).forEach(r => {
    const name = r.port || `Port ${r.index + 1}`, items = [];
    for (const a of list) {
      const byTank = [];
      for (const g of ['fo', 'do']) {
        const info = r.bunkerInfo && r.bunkerInfo[g];
        for (const al of (info && info.allocations) || []) {
          const tank = tankById[al.tankId], dose = additiveDoseFor(a, tank), qty = pos(al.quantity);
          if (dose > 0 && qty > EPS) byTank.push({ tankId: al.tankId, tankName: al.tankName || (tank && tank.name) || '', group: g, quantity: qty, dose, litres: qty * dose });
        }
      }
      const litres = byTank.reduce((s, x) => s + x.litres, 0);
      rob[a.id] -= litres; out.totals[a.id] += litres;
      if (litres > EPS && rob[a.id] < -1e-6) { out.shortages.push({ id: a.id, name: a.name || 'Additive', stopIndex: r.index, port: name, short: -rob[a.id] }); }
      items.push({ id: a.id, name: a.name, litres, byTank, robAfter: rob[a.id] });
    }
    out.rows.push({ index: r.index, port: name, items });
  });
  out.endRob = { ...rob };
  return out;
}

/* Litres of one additive for one port's bunkering of one fuel group (used by the bunkering tab and the plan). */
export function additiveForBunker(stores, tanks, group, allocations) {
  const st = normStores(stores), tankById = Object.fromEntries((tanks || []).map(t => [t.id, t]));
  return st.additives.map(a => {
    const byTank = (allocations || []).map(al => {
      const tank = tankById[al.tankId], dose = additiveDoseFor(a, tank), qty = pos(al.quantity);
      return { tankId: al.tankId, tankName: al.tankName || (tank && tank.name) || '', quantity: qty, dose, litres: qty * dose };
    }).filter(x => x.litres > EPS);
    return { id: a.id, name: a.name, group, litres: byTank.reduce((s, x) => s + x.litres, 0), byTank };
  }).filter(x => x.litres > EPS);
}

/* Days of water left at a given daily rate (null when nothing is used). */
export const daysLeft = (rob, perDay) => pos(perDay) > EPS ? pos(rob) / pos(perDay) : null;
