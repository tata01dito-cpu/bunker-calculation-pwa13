import assert from 'node:assert/strict';
import { rvPortRob, rvNoonMs, rvPositionAt, rvRobAt, rvPositionText, rvSourceFor, rvLogTotals, rvLookupNoon } from './robview.js';
let pass=0;const t=(name,fn)=>{fn();pass++;console.log('ok -',name);};
const row=(port,a,d,off,af,df)=>({port,arrivalUtc:a,departureUtc:d,utcOffset:off,arrivalFuel:{fo:af,do:af/10},departureFuel:{fo:df,do:df/10},arrivalLube:{cyl:af*10,mesys:0,gesys:0},departureLube:{cyl:df*10,mesys:0,gesys:0}});
const START='2026-10-01T04:00:00.000Z';
const R=[row('Singapore','2026-10-03T00:00:00.000Z','2026-10-04T00:00:00.000Z',8,900,1000),row('Busan','2026-10-08T00:00:00.000Z','2026-10-09T00:00:00.000Z',9,800,800)];
const startRob={fo:1100,do:110,cyl:11000,mesys:0,gesys:0};
t('noon ms respects offset',()=>{assert.equal(rvNoonMs('2026-10-05',8),Date.UTC(2026,9,5,4,0));assert.ok(Number.isNaN(rvNoonMs('x',0)));});
t('position phases',()=>{
  const p=s=>rvPositionAt(R,START,new Date(s).getTime());
  assert.equal(p('2026-09-30T00:00:00Z').phase,'before');
  assert.deepEqual(p('2026-10-02T00:00:00Z').phase,'sea');assert.equal(p('2026-10-02T00:00:00Z').from,-1);
  assert.equal(p('2026-10-03T12:00:00Z').phase,'port');
  const s=p('2026-10-06T00:00:00Z');assert.equal(s.phase,'sea');assert.equal(s.from,0);assert.equal(s.to,1);assert.ok(Math.abs(s.frac-0.5)<1e-9);
  assert.equal(p('2026-10-20T00:00:00Z').phase,'after');
  assert.equal(rvPositionAt([],START,0).phase,'none');});
t('rob interpolation',()=>{
  const mid=rvRobAt(R,{phase:'sea',from:0,to:1,frac:.5},startRob);assert.equal(mid.fo,900);
  const first=rvRobAt(R,{phase:'sea',from:-1,to:0,frac:.5},startRob);assert.equal(first.fo,1000);
  assert.equal(rvRobAt(R,{phase:'port',index:0,frac:.5},startRob).fo,950);
  assert.equal(rvRobAt(R,{phase:'before'},startRob).fo,1100);assert.equal(rvRobAt(R,{phase:'after',index:1},startRob).fo,800);});
t('port rob + text',()=>{
  const p=rvPortRob(R,0);assert.equal(p.eta.fo,900);assert.equal(p.etd.fo,1000);assert.equal(p.eta.cyl,9000);assert.equal(rvPortRob(R,5),null);
  assert.deepEqual(rvPositionText(R,{phase:'port',index:1}),{status:'In port',detail:'Busan'});
  assert.equal(rvPositionText(R,{phase:'sea',from:0,to:1}).detail,'Singapore \u2192 Busan');
  assert.equal(rvPositionText(R,{phase:'sea',from:-1,to:0},'Kainan').detail,'Kainan \u2192 Singapore');});
t('source selection',()=>{
  assert.equal(rvSourceFor('2026-10-01','2026-10-01T12:00',[]).kind,'noon');
  assert.deepEqual(rvSourceFor('2026-10-02','2026-10-01T12:00',[{id:'a',atLocal:'2026-10-02T12:00'}]),{kind:'log',logId:'a'});
  assert.equal(rvSourceFor('2026-10-05','2026-10-01T12:00',[]).kind,'plan');});
t('log totals',()=>{assert.equal(rvLogTotals({tanks:[{group:'fo',rob:10.5},{group:'fo',rob:4},{group:'x',rob:9}]}).fo,14.5);assert.equal(rvLogTotals(null).do,0);});
t('lookup: in port uses port offset and plan ROB',()=>{
  const r=rvLookupNoon({results:R,startUtc:START,date:'2026-10-03',defaultOffset:9,startRob,noonLocal:'2026-10-01T12:00',tankLog:[]});
  assert.equal(r.ok,true);assert.equal(r.status,'In port');assert.equal(r.detail,'Singapore');assert.equal(r.utcOffset,8);assert.equal(r.source.kind,'plan');assert.equal(r.port.index,0);});
t('lookup: at sea + noon report date + bad date',()=>{
  const s=rvLookupNoon({results:R,startUtc:START,date:'2026-10-06',defaultOffset:8,startRob,noonLocal:'2026-10-01T12:00',tankLog:[]});
  assert.equal(s.status,'At sea');assert.equal(s.port,null);
  const n=rvLookupNoon({results:R,startUtc:START,date:'2026-10-01',defaultOffset:8,startRob,noonLocal:'2026-10-01T12:00',noonRob:{fo:1100},tankLog:[]});
  assert.equal(n.source.kind,'noon');assert.equal(n.rob.fo,1100);assert.equal(n.rob.do,0);
  assert.equal(rvLookupNoon({results:R,startUtc:START,date:'',defaultOffset:0}).ok,false);});
console.log(`${pass} tests passed`);
