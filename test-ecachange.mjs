import assert from 'node:assert/strict';
import { ecoHasEcaPort, ecoCandidates, ecoSpan, ecoDuration, ecoStatus, ecoPickDefault, ecoTimeline, ecoChecklist, ecoSheetFileName, ecoLogRows } from './ecachange.js';
let pass=0;const t=(name,fn)=>{fn();pass++;console.log('ok -',name);};

const route=[
  {port:'Singapore',eca:{port:{enabled:false},entering:{},leaving:{}}},
  {port:'Rotterdam',eca:{port:{enabled:true},entering:{enabled:true},leaving:{enabled:false}}},
  {port:'Hamburg',eca:{port:{enabled:true},entering:{enabled:false},leaving:{enabled:true}}},
  {port:'',eca:{port:{enabled:true},entering:{enabled:true},leaving:{enabled:true}}},
  {port:'Plain'}
];
t('hasEcaPort true/false',()=>{assert.equal(ecoHasEcaPort(route),true);assert.equal(ecoHasEcaPort([route[0],route[4]]),false);assert.equal(ecoHasEcaPort(null),false);assert.equal(ecoHasEcaPort([]),false);});
t('candidates both',()=>{const c=ecoCandidates(route);assert.deepEqual(c.map(x=>`${x.index}:${x.dir}`),['1:entering','2:leaving','3:entering','3:leaving']);});
t('candidates entering only',()=>{assert.deepEqual(ecoCandidates(route,'entering').map(x=>x.index),[1,3]);});
t('candidates leaving only + default port name',()=>{const c=ecoCandidates(route,'leaving');assert.deepEqual(c.map(x=>x.port),['Hamburg','Port 4']);});
t('candidates empty/null route',()=>{assert.deepEqual(ecoCandidates([]),[]);assert.deepEqual(ecoCandidates(null),[]);});
t('span words',()=>{assert.equal(ecoSpan(0.75),'45 min');assert.equal(ecoSpan(5),'5 h');assert.equal(ecoSpan(5.5),'5 h 30 min');assert.equal(ecoSpan(27),'1 d 3 h');assert.equal(ecoSpan(-2),'2 h');assert.equal(ecoSpan(NaN),'—');assert.equal(ecoSpan(0),'0 min');});
t('span rounds to the minute',()=>{assert.equal(ecoSpan(1.999),'2 h');assert.equal(ecoSpan(23.999),'1 d 0 h');});
t('duration text',()=>{assert.equal(ecoDuration(9.5),'9.5 h (9 h 30 min)');assert.equal(ecoDuration(null),'—');assert.equal(ecoDuration(0.25),'0.3 h (15 min)'); });
t('status upcoming / in progress / done',()=>{
  const H=3600000,s=10*H,f=20*H;
  assert.deepEqual(ecoStatus(4*H,s,f),{state:'upcoming',hours:6,label:'Starts in 6 h'});
  assert.equal(ecoStatus(12*H,s,f).state,'inprogress');assert.equal(ecoStatus(12*H,s,f).label,'In progress · 8 h left');
  assert.equal(ecoStatus(s,s,f).state,'inprogress');            // exactly at start = in progress
  assert.equal(ecoStatus(f,s,f).state,'done');                  // exactly at finish = done
  assert.equal(ecoStatus(22*H,s,f).label,'Finished 2 h ago');
  assert.equal(ecoStatus(NaN,s,f).state,'unknown');
});
t('pick default = first unfinished, else first',()=>{
  const H=3600000,items=[{k:'a',finishMs:5*H},{k:'b',finishMs:15*H},{k:'c',finishMs:25*H}];
  assert.equal(ecoPickDefault(items,10*H).k,'b');
  assert.equal(ecoPickDefault(items,30*H).k,'a');
  assert.equal(ecoPickDefault([],0),null);
  assert.equal(ecoPickDefault([{k:'x',finishMs:NaN}],0).k,'x');
});

t('timeline sorts, positions, window',()=>{
  const H=3600000,tl=ecoTimeline([{key:'arr',label:'Arrive',ms:100*H},{key:'dep',label:'Depart',ms:0},{key:'fin',label:'Finish',ms:60*H},{key:'sta',label:'Start',ms:20*H},{key:'bad',ms:NaN}],20*H,60*H);
  assert.deepEqual(tl.marks.map(x=>x.key),['dep','sta','fin','arr']);
  assert.deepEqual(tl.marks.map(x=>x.pct),[0,20,60,100]);
  assert.deepEqual(tl.seg,{left:20,width:40});assert.equal(tl.spanMs,100*H);
});
t('timeline: window clamped, reversed window, same-time marks, empty',()=>{
  const H=3600000;
  assert.deepEqual(ecoTimeline([{key:'a',ms:10*H},{key:'b',ms:20*H}],0,30*H).seg,{left:0,width:100});
  assert.deepEqual(ecoTimeline([{key:'a',ms:0},{key:'b',ms:10*H}],8*H,2*H).seg,{left:20,width:60});
  const same=ecoTimeline([{key:'a',ms:5},{key:'b',ms:5}],5,5);assert.deepEqual(same.marks.map(x=>x.pct),[0,0]);assert.equal(same.seg.width,0);
  assert.deepEqual(ecoTimeline([],1,2),{marks:[],seg:{left:0,width:0},spanMs:0});
  assert.deepEqual(ecoTimeline(null,NaN,NaN).marks,[]);
});
t('checklist entering / scrubber / leaving',()=>{
  const d={port:'Rotterdam',startTxt:'2026-10-07 04:31',finishTxt:'2026-10-08 16:31',lineTxt:'2026-10-08 17:31',fuelFrom:'VLSFO',fuelTo:'LSMGO'};
  const en=ecoChecklist('entering',d),lv=ecoChecklist('leaving',d),sc=ecoChecklist('entering',{...d,scrubber:true});
  assert.equal(en.length,5);assert.equal(lv.length,4);
  assert.ok(en[1].includes('2026-10-07 04:31')&&en[1].includes('VLSFO')&&en[3].includes('2026-10-08 16:31')&&en[3].includes('17:31'));
  assert.ok(lv[0].includes('2026-10-08 17:31')&&lv[1].includes('VLSFO \u2192 LSMGO'));
  assert.ok(sc[0].includes('Scrubber')&&!en[0].includes('Scrubber'));
  assert.ok(en.at(-1).includes('MARPOL Annex VI')&&lv.at(-1).includes('Oil Record Book'));
  assert.equal(ecoChecklist('entering').length,5);  // missing data never throws
});

t('sheet file name',()=>{
  const d=new Date(2026,9,6,12);
  assert.equal(ecoSheetFileName({port:'Rotterdam',dir:'entering',vessel:'MV Star',date:d}),'Change-over Sheet - Rotterdam - Entering - MV Star - 2026-10-06.docx');
  assert.equal(ecoSheetFileName({port:'Port/Said:*',dir:'leaving',vessel:'',date:d}),'Change-over Sheet - Port Said - Leaving - Vessel - 2026-10-06.docx');
  assert.match(ecoSheetFileName({}),/^Change-over Sheet - Port - Entering - Vessel - \d{4}-\d{2}-\d{2}\.docx$/);
});
t('sheet log rows differ by direction',()=>{
  const e=ecoLogRows('entering'),l=ecoLogRows('leaving');
  assert.equal(e.length,6);assert.equal(l.length,6);
  assert.match(e[0],/started/);assert.match(e[2],/crossed/);          // entering: start, finish, then the line
  assert.match(l[0],/cleared/);assert.match(l[1],/started/);          // leaving: the line first
  assert.match(e[4],/Low-sulphur/);assert.match(l[4],/Higher-sulphur/);assert.equal(e[5],'Remarks');
});
console.log(`${pass} change-over helper tests passed`);

/* ---- v1.73: fixed 0.3 h LSMGO -> VLSFO outside the ECA ---- */
import { ecoLeaveFixed, ecoFixedResult, ecoLeaveFixedPlan, ECO_FIXED_LEAVE_HOURS } from './ecachange.js';
import { fobasChangeover } from './core.js';
t('fixed: LSMGO 0.10 -> VLSFO 0.50 is 0.3 h',()=>{const r=ecoLeaveFixed({fromS:0.1,toS:0.5});assert.equal(r.fixed,true);assert.equal(r.hours,0.3);assert.equal(ECO_FIXED_LEAVE_HOURS,0.3);});
t('fixed: VLSFO 0.45 also allowed',()=>assert.equal(ecoLeaveFixed({mode:'auto',fromS:0.1,toS:0.45}).fixed,true));
t('not fixed: HFO 3.5 % resume',()=>{const r=ecoLeaveFixed({fromS:0.1,toS:3.5});assert.equal(r.fixed,false);assert.match(r.reason,/mixing model/);});
t('not fixed: user picks FOBAS',()=>assert.equal(ecoLeaveFixed({mode:'fobas',fromS:0.1,toS:0.5}).fixed,false));
t('not fixed: missing resume sulphur',()=>assert.equal(ecoLeaveFixed({fromS:0.1,toS:0}).fixed,false));
t('fixed result shape matches FOBAS consumer',()=>{const r=ecoFixedResult();assert.equal(r.valid,true);assert.equal(r.planning,0.3);assert.equal(r.fixed,true);assert.deepEqual(r.curve,[]);});
t('plan: ME+AE+Blr in parallel = 0.3 h, not 0.9',()=>{const H=3600000,p=ecoLeaveFixedPlan({systems:[{key:'me'},{key:'ae'},{key:'boiler'}],startMs:10*H});assert.equal(p.hours,0.3);assert.equal(p.finishMs,10*H+0.3*H);assert.equal(p.systems.length,3);});
t('plan: switched-off systems skipped; none on = null',()=>{const p=ecoLeaveFixedPlan({systems:[{key:'me'},{key:'ae',on:false},{key:'boiler',on:false}],startMs:0});assert.equal(p.systems.length,1);assert.equal(ecoLeaveFixedPlan({systems:[{key:'me',on:false}],startMs:0}).hours,null);});
t('fixed 0.3 h is not the FOBAS answer (which depends on rate/qty)',()=>{const f=fobasChangeover({rate:0.3,qty:3,fromS:0.1,toS:0.5,reqS:0.475,mode:'up'});assert.ok(f.planning>0.3);});
