import assert from 'node:assert/strict';
import { defaultStores, normStores, projectWater, additiveUsage, additiveDoseFor, additiveForBunker, fwgTarget, drawOrder } from './stores.js';
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('ok -', name); };
const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);

const base = () => normStores({ water: {
  tanks: [{ id: 'f1', type: 'fw', name: 'FW P', capacity: 100, rob: 50 }, { id: 'f2', type: 'fw', name: 'FW S', capacity: 100, rob: 20 }, { id: 'd1', type: 'dw', name: 'DW', capacity: 40, rob: 30 }],
  rates: { fw: { sea: 10, port: 6 }, dw: { sea: 1, port: 1 } }, fwg: { sea: 0, port: 0, supplyTankId: 'auto' }, draw: { fw: 'auto', dw: 'auto' } } });
const legs = [{ index: 0, port: 'A', seaDays: 0, anchorStayDays: 0, portStayDays: 1 }, { index: 1, port: 'B', seaDays: 2, anchorStayDays: 0.5, portStayDays: 1 }];

ok('normStores fills defaults and drops junk', () => {
  const s = normStores({ water: { tanks: [{ id: 'x', type: 'bogus' }, { type: 'fw', capacity: -5, rob: '7' }], draw: { fw: 'nope' } }, additives: [null, { name: 'Add', dose: '2' }] });
  assert.equal(s.water.tanks.length, 1); assert.equal(s.water.tanks[0].capacity, 0); assert.equal(s.water.tanks[0].rob, 7);
  assert.equal(s.water.draw.fw, 'auto'); assert.equal(s.additives.length, 1); assert.equal(s.additives[0].dose, 2); assert.equal(s.additives[0].fuel, 'fo');
  assert.deepEqual(normStores(undefined), defaultStores());
});
ok('consumption draws the first tank first, then the next', () => {
  const p = projectWater(base(), legs);
  // port A 1 day: fw 6 from f1 -> 44; dw 1 -> 29. Sea 2 days: fw 20 from f1 -> 24. Anchor 0.5 day (sea rate): fw 5 -> 19
  near(p.rows[0].departure.f1, 44); near(p.rows[0].departure.d1, 29);
  near(p.rows[1].arrival.f1, 24); near(p.rows[1].arrivalTotal.dw, 27);
  near(p.rows[1].departure.f1, 13); near(p.rows[1].departure.f2, 20);
  assert.equal(p.shortages.length, 0);
});
ok('chosen draw tank is used first', () => {
  const s = base(); s.water.draw.fw = 'f2';
  assert.equal(drawOrder(s, 'fw')[0].id, 'f2');
  const p = projectWater(s, legs);
  near(p.rows[0].departure.f2, 14); near(p.rows[0].departure.f1, 50);
});
ok('empty first tank rolls to the next tank', () => {
  const s = normStores({ water: { tanks: [{ id: 'a', type: 'fw', capacity: 10, rob: 3 }, { id: 'b', type: 'fw', capacity: 10, rob: 10 }], rates: { fw: { sea: 5, port: 0 }, dw: {} } } });
  const p = projectWater(s, [{ index: 0, port: 'X', seaDays: 2, anchorStayDays: 0, portStayDays: 0 }]);
  near(p.endRob.a, 0); near(p.endRob.b, 3);
});
ok('shortage is reported with the stop and amount', () => {
  const s = normStores({ water: { tanks: [{ id: 'a', type: 'dw', capacity: 10, rob: 4 }], rates: { fw: {}, dw: { sea: 2, port: 0 } } } });
  const p = projectWater(s, [{ index: 0, port: 'X', seaDays: 0, anchorStayDays: 0, portStayDays: 0 }, { index: 1, port: 'Y', seaDays: 3, anchorStayDays: 0, portStayDays: 0 }]);
  assert.equal(p.shortages.length, 1); assert.equal(p.shortages[0].type, 'dw'); assert.equal(p.shortages[0].stopIndex, 1); near(p.shortages[0].short, 2);
});
ok('sea leg and anchor time before one port give ONE shortage entry', () => {
  const s = normStores({ water: { tanks: [{ id: 'a', type: 'fw', capacity: 10, rob: 0 }], rates: { fw: { sea: 4, port: 0 }, dw: {} } } });
  const p = projectWater(s, [{ index: 0, port: 'X', seaDays: 1, anchorStayDays: 0.5, portStayDays: 0 }]);
  assert.equal(p.shortages.length, 1); near(p.shortages[0].short, 6); assert.equal(p.shortages[0].phase, 'sea');
});
ok('FWG fills the chosen tank, overflows to the others, the rest is lost', () => {
  const s = base(); s.water.rates = { fw: { sea: 0, port: 0 }, dw: { sea: 0, port: 0 } }; s.water.fwg = { sea: 100, port: 0, supplyTankId: 'f2' };
  const p = projectWater(s, [{ index: 0, port: 'A', seaDays: 1, anchorStayDays: 0, portStayDays: 0 }]);
  // 100 m3 made: f2 20->100 (+80), f1 50->70 (+20) ... capacity f1=100 so f1 takes the other 20
  near(p.endRob.f2, 100); near(p.endRob.f1, 70); near(p.lost, 0); near(p.produced, 100);
  const q = projectWater(s, [{ index: 0, port: 'A', seaDays: 3, anchorStayDays: 0, portStayDays: 0 }]);
  near(q.endRob.f1, 100); near(q.endRob.f2, 100); near(q.lost, 300 - 130);
});
ok('FWG makes water before it is drawn, so a full tank does not run short', () => {
  const s = normStores({ water: { tanks: [{ id: 'a', type: 'fw', capacity: 10, rob: 0 }], rates: { fw: { sea: 8, port: 0 }, dw: {} }, fwg: { sea: 8, port: 0 } } });
  const p = projectWater(s, [{ index: 0, port: 'X', seaDays: 5, anchorStayDays: 0, portStayDays: 0 }]);
  assert.equal(p.shortages.length, 0); near(p.endRob.a, 0, 1e-6);
});
ok('fwgTarget falls back to the first fresh-water tank', () => {
  assert.equal(fwgTarget(base()).id, 'f1'); assert.equal(fwgTarget(defaultStores()), null);
});
ok('no tanks and no rates gives an empty projection', () => {
  const p = projectWater(defaultStores(), legs); assert.equal(p.rows.length, 2); assert.equal(p.shortages.length, 0);
});

const tanks = [{ id: 't1', name: 'No.1 FO', group: 'fo' }, { id: 't2', name: 'No.2 FO', group: 'fo', additiveDose: { a1: 0.5 } }, { id: 'd1', name: 'DO', group: 'do' }];
const adds = normStores({ additives: [{ id: 'a1', name: 'FO treat', rob: 300, dose: 1, fuel: 'fo' }] });
ok('additive dose: default by fuel group, tank override wins', () => {
  const a = adds.additives[0];
  assert.equal(additiveDoseFor(a, tanks[0]), 1); assert.equal(additiveDoseFor(a, tanks[1]), 0.5); assert.equal(additiveDoseFor(a, tanks[2]), 0);
  assert.equal(additiveDoseFor({ ...a, fuel: 'both' }, tanks[2]), 1);
  tanks[2].additiveDose = { a1: 2 }; assert.equal(additiveDoseFor(a, tanks[2]), 2); delete tanks[2].additiveDose;
  tanks[0].additiveDose = { a1: '' }; assert.equal(additiveDoseFor(a, tanks[0]), 1); delete tanks[0].additiveDose;
});
const res = [{ index: 0, port: 'A', bunkerInfo: { fo: { allocations: [{ tankId: 't1', tankName: 'No.1 FO', quantity: 200 }, { tankId: 't2', quantity: 100 }] }, do: { allocations: [{ tankId: 'd1', quantity: 50 }] } } },
  { index: 1, port: 'B', bunkerInfo: { fo: { allocations: [{ tankId: 't1', quantity: 150 }] } } }];
ok('additive used per bunkering, ROB falls, shortage flagged', () => {
  const u = additiveUsage(adds, res, tanks);
  near(u.rows[0].items[0].litres, 250); near(u.rows[0].items[0].robAfter, 50);
  near(u.rows[1].items[0].litres, 150); near(u.rows[1].items[0].robAfter, -100);
  assert.equal(u.shortages.length, 1); assert.equal(u.shortages[0].stopIndex, 1); near(u.shortages[0].short, 100);
  near(u.totals.a1, 400); near(u.endRob.a1, -100);
  assert.equal(u.rows[0].items[0].byTank.length, 2);
});
ok('additive with no ROB entered and dose 0 stays quiet', () => {
  const u = additiveUsage(normStores({ additives: [{ id: 'z', name: 'Z', rob: 0, dose: 0 }] }), res, tanks);
  assert.equal(u.shortages.length, 0); near(u.totals.z, 0);
});
ok('additiveForBunker lists litres per tank for one fuel group', () => {
  const l = additiveForBunker(adds, tanks, 'fo', res[0].bunkerInfo.fo.allocations);
  assert.equal(l.length, 1); near(l[0].litres, 250); assert.equal(l[0].byTank.length, 2);
  assert.deepEqual(additiveForBunker(adds, tanks, 'do', res[0].bunkerInfo.do.allocations), []);
});
console.log(`test-stores: ${n} passed`);
