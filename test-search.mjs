import assert from 'node:assert/strict';
import { tokenize, buildSearchIndex, searchIndex, searchAnswer, HELP_CARDS } from './search.js';
let pass=0;const t=(name,fn)=>{fn();pass++;console.log('ok -',name);};
const fuels=[{id:'fo',name:'Fuel Oil (VLSFO/HFO)',unit:'MT',seaRate:30,portRate:3,reserveDays:3},{id:'do',name:'Diesel Oil',unit:'MT',seaRate:1,portRate:1,reserveDays:3}];
const lubes=[{id:'cyl',name:'Cylinder Oil',unit:'L',seaRate:200,reserveDays:3}];
const r=(port,i)=>({port,index:i,arrivalUtc:'2026-10-0'+(i+3)+'T00:00:00Z',departureUtc:'2026-10-0'+(i+4)+'T00:00:00Z',utcOffset:8,distanceNm:500,speedKn:12,portStayDays:1,portStayHours:0,arrivalFuel:{fo:900-i*50,do:80},departureFuel:{fo:950-i*50,do:80},arrivalLube:{cyl:5000},departureLube:{cyl:5000},bunkerInfo:i===1?{fo:{quantity:200,transferred:0}}:{}});
const ctx={meta:{noonLocal:'2026-10-01T12:00',currentPosition:'Kainan',vesselName:'MV Test',noonRob:{fo:1000,do:90,cyl:5200}},results:[r('Singapore',0),r('Busan',1)],
  tanks:[{id:'t1',name:'No.1 FO Tank (P)',group:'fo',rob:400,capacity:800},{id:'t2',name:'DO Storage Tank',group:'do',rob:80,capacity:100}],fuels,lubes,
  route:[{port:'Singapore',eca:{port:{enabled:false}}},{port:'Busan',eca:{port:{enabled:true},entering:{enabled:true}}}],alerts:[{title:'Negative ROB at Busan',text:'Fuel oil goes below zero'}],actual:{fo:400,do:80,cyl:5000}};
const idx=buildSearchIndex(ctx);
const top=(q)=>searchIndex(idx,q)[0];
t('tokenize drops filler, plurals, dedupes',()=>{assert.deepEqual(tokenize('Show me the ROB of tanks, tanks!'),['rob','tank']);assert.deepEqual(tokenize('   '),[]);assert.deepEqual(tokenize('what is VLSFO?'),['vlsfo']);});
t('index has every kind of card',()=>{const ty=new Set(idx.map(x=>x.type));for(const k of ['port','bunker','tank','product','noon','eca','alert','help'])assert.ok(ty.has(k),k);assert.equal(idx.length,2+1+2+3+1+1+1+HELP_CARDS.length);});
t('port name finds port card',()=>{const x=top('busan eta');assert.equal(x.item.id,'port:1');assert.deepEqual(x.item.source,{kind:'port',index:1});});
t('bunkering query finds the bunker card',()=>{assert.equal(top('bunker busan').item.id,'bunker:1');});
t('product synonyms: vlsfo / lsmgo',()=>{assert.equal(top('vlsfo rob').item.id.startsWith('product:fo')||top('vlsfo rob').item.type==='tank'||top('vlsfo rob').item.type==='product',true);assert.equal(top('lsmgo consumption').item.id,'product:do');});
t('tank query',()=>{const x=top('diesel tank');assert.equal(x.item.id,'tank:t2');assert.deepEqual(x.item.source,{kind:'tank',id:'t2'});});
t('alert + eca + noon intents',()=>{assert.equal(top('negative rob alert').item.type,'alert');assert.equal(top('eca busan').item.id,'eca:1');assert.equal(top('noon report date').item.id,'noon');});
t('help cards reachable and prefix match',()=>{assert.equal(top('calculator').item.id,'help:btn-calc');assert.ok(searchIndex(idx,'bunkeri').length>0);});
t('no match / empty / limit',()=>{assert.deepEqual(searchIndex(idx,'zzzqqq'),[]);assert.deepEqual(searchIndex(idx,''),[]);assert.equal(searchIndex(idx,'rob',{limit:3}).length,3);});
t('tank card shows percent filled',()=>{const c=idx.find(x=>x.id==='tank:t1');assert.ok(c.lines.some(l=>l[0]==='Filled'&&l[1]==='50 %'));});
t('answer: product at port',()=>{const a=searchAnswer(idx,'how much vlsfo at busan');assert.equal(a.id,'port:1');assert.equal(a.text,'Fuel Oil (VLSFO/HFO) at Busan: 850.00 MT \u2192 900.00 MT (ETA \u2192 ETD).');});
t('answer: bunker at port, none planned, ETA, product only',()=>{
  assert.equal(searchAnswer(idx,'bunker fuel busan').id,'bunker:1');assert.ok(searchAnswer(idx,'bunker fuel busan').text.includes('200.00 MT'));
  assert.ok(searchAnswer(idx,'bunker diesel singapore').text.startsWith('No Diesel Oil bunkering'));
  assert.ok(searchAnswer(idx,'busan eta').text.startsWith('Busan: ETA 2026-10-04'));
  assert.ok(searchAnswer(idx,'lsmgo rob').text.includes('actual tank ROB 80.00 MT'));
  assert.equal(searchAnswer(idx,'alerts'),null);assert.equal(searchAnswer(idx,''),null);});
console.log(`${pass} tests passed`);
