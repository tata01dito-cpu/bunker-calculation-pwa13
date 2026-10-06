/* Change-over Details (v1.63) — pure helpers (no DOM, no app state), tested by test-ecachange.mjs.
   The timings themselves come from the existing ECA/SECA calculation in app.js (FOBAS model); this file only
   lists the change-overs, words durations, and works out whether a change-over is upcoming / in progress / done. */
const num=v=>{const x=Number(v);return Number.isFinite(x)?x:0;};

/* Does the plan have any port flagged "This port is in an ECA/SECA"? (decides whether the Home button is shown) */
export function ecoHasEcaPort(route){return (route||[]).some(r=>!!(r&&r.eca&&r.eca.port&&r.eca.port.enabled));}

/* Change-overs planned on the route. dir = 'entering' | 'leaving' (omit for both). Route order is kept. */
export function ecoCandidates(route,dir){
  const out=[];
  (route||[]).forEach((r,i)=>{
    ['entering','leaving'].forEach(d=>{
      if(dir&&d!==dir)return;
      const c=r&&r.eca&&r.eca[d];
      if(c&&c.enabled)out.push({index:i,port:(r&&r.port)||`Port ${i+1}`,dir:d});
    });
  });
  return out;
}

/* Words for a span in hours: "2 d 3 h", "5 h 30 min", "5 h", "45 min". */
export function ecoSpan(hours){
  if(!Number.isFinite(hours))return'—';
  const m=Math.round(Math.abs(hours)*60),d=Math.floor(m/1440),h=Math.floor((m%1440)/60),mi=m%60;
  if(d>0)return `${d} d ${h} h`;
  if(h>0)return mi?`${h} h ${mi} min`:`${h} h`;
  return `${mi} min`;
}

/* Duration shown on the card: "9.5 h (9 h 30 min)". */
export function ecoDuration(hours){
  if(!Number.isFinite(hours))return'—';
  return `${hours.toFixed(1)} h (${ecoSpan(hours)})`;
}

/* Where "now" sits against a change-over window. Times are absolute milliseconds. */
export function ecoStatus(nowMs,startMs,finishMs){
  if(![nowMs,startMs,finishMs].every(Number.isFinite))return{state:'unknown',label:''};
  if(nowMs<startMs){const h=(startMs-nowMs)/3600000;return{state:'upcoming',hours:h,label:`Starts in ${ecoSpan(h)}`};}
  if(nowMs<finishMs){const h=(finishMs-nowMs)/3600000;return{state:'inprogress',hours:h,label:`In progress · ${ecoSpan(h)} left`};}
  const h=(nowMs-finishMs)/3600000;
  return{state:'done',hours:h,label:`Finished ${ecoSpan(h)} ago`};
}

/* Which change-over to open first: the first one that has not finished yet, else the first one. */
export function ecoPickDefault(items,nowMs){
  if(!items||!items.length)return null;
  const live=items.find(x=>Number.isFinite(x.finishMs)&&x.finishMs>nowMs);
  return live||items[0];
}

/* ---- v1.63 chunk 2 ---- */

/* Timeline bar geometry. marks = [{key,label,ms}] (any order, bad times dropped); segFrom/segTo = the change-over window (ms).
   Returns the marks sorted by time with a 0-100 position along the bar, and the window as {left,width} in %. */
export function ecoTimeline(marks,segFrom,segTo){
  const m=(marks||[]).filter(x=>x&&Number.isFinite(x.ms)).map(x=>({...x})).sort((a,b)=>a.ms-b.ms);
  if(!m.length)return{marks:[],seg:{left:0,width:0},spanMs:0};
  const t0=m[0].ms,t1=m[m.length-1].ms,span=t1-t0;
  const pct=ms=>span>0?Math.min(100,Math.max(0,(ms-t0)/span*100)):0;
  m.forEach(x=>{x.pct=pct(x.ms);});
  const a=Number.isFinite(segFrom)?pct(segFrom):0,b=Number.isFinite(segTo)?pct(segTo):a;
  return{marks:m,seg:{left:Math.min(a,b),width:Math.abs(b-a)},spanMs:span};
}

/* The "log it" checklist. dir = 'entering' | 'leaving'; t = {port,startTxt,finishTxt,lineTxt,fuelFrom,fuelTo,scrubber}. */
export function ecoChecklist(dir,t={}){
  const s=k=>String(t[k]==null?'':t[k]);
  const logIt='Make the entries in the Oil Record Book / fuel change-over log (MARPOL Annex VI Reg. 14 and your SMS).';
  if(dir==='leaving')return[
    `Confirm the vessel is fully clear of the ECA/SECA line (${s('lineTxt')}) before starting. Do not resume the higher-sulphur fuel earlier.`,
    `Start the change-over ${s('fuelFrom')} \u2192 ${s('fuelTo')} at ${s('startTxt')}. Record the start time, position and tank quantities.`,
    `Planned finish ${s('finishTxt')}. Record the time, position and the quantity of each fuel in the tanks.`,
    logIt
  ];
  return[
    t.scrubber?`Scrubber (EGCS) is ready for use inside the ECA/SECA, and the fuel change-over is carried out as planned.`
              :`The low-sulphur fuel (${s('fuelTo')}) is on board in the tanks to be used and is enough for the change-over and the stay inside the ECA/SECA.`,
    `Start the change-over ${s('fuelFrom')} \u2192 ${s('fuelTo')} at ${s('startTxt')} at the latest. Record the start time, position and tank quantities.`,
    `Change Main Engine, Aux. Engine and Boiler as planned and watch the sulphur at the engine inlet fall to the required limit.`,
    `Complete by ${s('finishTxt')}, before the ECA/SECA line (${s('lineTxt')}). Record the time, position and the quantity of low-sulphur fuel in each tank.`,
    logIt
  ];
}

/* ---- v1.63 chunk 3: Change-over Sheet (Word) ---- */

/* File name of the exported sheet: "Change-over Sheet - <port> - Entering - <vessel> - 2026-10-06.docx" (characters Windows forbids are removed). */
export function ecoSheetFileName({port,dir,vessel,date}={}){
  const clean=v=>String(v==null?'':v).replace(/[\\/:*?"<>|\u0000-\u001f]+/g,' ').replace(/\s+/g,' ').trim();
  const d=date instanceof Date&&!Number.isNaN(date.getTime())?date:new Date(),pad=x=>String(x).padStart(2,'0');
  const stamp=`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  return `Change-over Sheet - ${clean(port)||'Port'} - ${dir==='leaving'?'Leaving':'Entering'} - ${clean(vessel)||'Vessel'} - ${stamp}.docx`;
}

/* Rows of the blank "Record" table on the sheet (written in by hand during the change-over). */
export function ecoLogRows(dir){
  const lineRow=dir==='leaving'?'Vessel cleared the ECA/SECA line':'Vessel crossed the ECA/SECA line';
  const fuelRow=dir==='leaving'?'Higher-sulphur fuel in the tanks (quantity per tank)':'Low-sulphur fuel in the tanks (quantity per tank)';
  const order=dir==='leaving'?[lineRow,'Change-over started','Change-over finished']:['Change-over started','Change-over finished',lineRow];
  return[...order.map(x=>`${x} \u2014 time and position`),'Sulphur at engine inlet at the finish (%)',fuelRow,'Remarks'];
}

/* ---- v1.73: LSMGO -> VLSFO change-over outside the ECA/SECA (fixed 0.3 h) ----
   Outside an ECA/SECA the global sulphur limit is 0.50 % m/m, so the 0.10 % LSMGO already in the service system is
   compliant. Every blend of LSMGO and VLSFO (both <= 0.50 % S) is therefore compliant, and there is no sulphur target to
   wait for. The time is only the practical switch-over (valve change / line purge) = 0.3 h for the Main Engine, the Aux.
   Engine(s) and the Boiler(s). The three systems run side by side, so the vessel is ready after 0.3 h.
   Not applicable (falls back to the FOBAS mixing model) when the fuel to resume is above 0.50 % S (e.g. HFO). */
export const ECO_FIXED_LEAVE_HOURS=0.3;
export const ECO_OUTSIDE_ECA_LIMIT=0.5;

/* mode: 'auto' (default, fixed when allowed) | 'fobas' (always the mixing model). Returns {fixed,hours,reason}. */
export function ecoLeaveFixed({mode,fromS,toS,hours=ECO_FIXED_LEAVE_HOURS,limit=ECO_OUTSIDE_ECA_LIMIT}={}){
  if(mode==='fobas')return{fixed:false,hours:null,reason:'FOBAS mixing model selected.'};
  const f=num(fromS),t=num(toS),eps=1e-9;
  if(!(t>0))return{fixed:false,hours:null,reason:'Enter the sulphur of the fuel to resume.'};
  if(f>limit+eps||t>limit+eps)return{fixed:false,hours:null,reason:`A fuel above ${limit.toFixed(2)} % S is involved, so the mixing model is used.`};
  return{fixed:true,hours:hours,reason:`Both fuels are within the ${limit.toFixed(2)} % limit outside the ECA/SECA — no sulphur target to wait for.`};
}

/* Result for one system in the same shape app.js reads from fobasChangeover(). */
export function ecoFixedResult(hours=ECO_FIXED_LEAVE_HOURS){
  return{valid:true,reason:'',fixed:true,qeff:0,a:0,mixFraction:0,unstable:false,stepTime:hours,stepExceeds:false,exactTime:hours,exactRounded:hours,planning:hours,curve:[],exactCurve:[],alreadyOk:false};
}

/* Whole leaving change-over: systems = [{key,on}] ; ready = slowest of the systems that are switched on. */
export function ecoLeaveFixedPlan({systems,startMs,hours=ECO_FIXED_LEAVE_HOURS}={}){
  const list=(systems||[]).filter(s=>s&&s.on!==false).map(s=>({key:s.key,hours,startMs,finishMs:Number.isFinite(startMs)?startMs+hours*3600000:NaN}));
  const T=list.length?Math.max(...list.map(x=>x.hours)):null;
  return{systems:list,hours:T,finishMs:T!==null&&Number.isFinite(startMs)?startMs+T*3600000:NaN};
}
