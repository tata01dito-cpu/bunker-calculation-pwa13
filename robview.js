/* "Tank ROB" pop-up (v1.64, called "Show me Tank ROB" until v1.67) — pure helpers (no DOM, no app state), tested by test-robview.mjs.
   Works on the rows returned by calculateVoyage() (core.js): each row has arrivalUtc, departureUtc, utcOffset, port,
   arrivalFuel / departureFuel (fo, do) and arrivalLube / departureLube (cyl, mesys, gesys).
   Chunk 1 = this file. Chunk 2 wires port mode in app.js. Chunk 3 wires noon-report-by-date mode. */
const num=v=>{const x=Number(v);return Number.isFinite(x)?x:0;};
export const RV_PRODUCTS=['fo','do','cyl','mesys','gesys'];
const ms=iso=>new Date(iso).getTime();
const val=(r,when,g)=>{const f=r[when+'Fuel'],l=r[when+'Lube'];return num(f&&f[g]!==undefined?f[g]:l&&l[g]);};
const robOf=(r,when)=>Object.fromEntries(RV_PRODUCTS.map(g=>[g,val(r,when,g)]));

/* ROB of one port: at ETA and at ETD (what the Tank ROB card on the Dashboard shows). */
export function rvPortRob(results,i){
  const r=(results||[])[i];if(!r)return null;
  return{index:i,port:r.port,etaUtc:r.arrivalUtc,etdUtc:r.departureUtc,utcOffset:num(r.utcOffset),eta:robOf(r,'arrival'),etd:robOf(r,'departure')};
}

/* UTC instant (ms) of 12:00 local on "YYYY-MM-DD" at the given UTC offset (hours). NaN if the date is invalid. */
export function rvNoonMs(date,offset){
  const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(date||'');if(!m)return NaN;
  return Date.UTC(+m[1],+m[2]-1,+m[3],12,0)-num(offset)*3600000;
}

/* Where is the vessel at instant t (ms)?  phase: 'before' | 'sea' | 'port' | 'after'.
   sea  -> from (-1 = the present position at plan start) to (next port index), frac 0..1 along the leg.
   port -> index, frac 0..1 through the stay. */
export function rvPositionAt(results,startUtc,t){
  const rs=results||[];if(!rs.length||!Number.isFinite(t))return{phase:'none'};
  const start=ms(startUtc);
  if(Number.isFinite(start)&&t<start)return{phase:'before'};
  const f=(a,b)=>b>a?Math.max(0,Math.min(1,(t-a)/(b-a))):0;
  const a0=ms(rs[0].arrivalUtc);
  if(Number.isFinite(start)&&t<a0)return{phase:'sea',from:-1,to:0,frac:f(start,a0)};
  for(let i=0;i<rs.length;i++){
    const a=ms(rs[i].arrivalUtc),d=ms(rs[i].departureUtc);
    if(t>=a&&t<=d)return{phase:'port',index:i,frac:f(a,d)};
    const nx=rs[i+1];if(nx){const na=ms(nx.arrivalUtc);if(t>d&&t<na)return{phase:'sea',from:i,to:i+1,frac:f(d,na)};}
  }
  return{phase:'after',index:rs.length-1};
}

/* Planned ROB of every product at that position (straight-line between the plan's ETA / ETD figures).
   startRob = ROB at the start of the plan (actual tank ROB at the noon-report date). */
export function rvRobAt(results,pos,startRob){
  const rs=results||[],lerp=(a,b,k)=>a+(b-a)*k,sr=startRob||{};
  const out={};
  for(const g of RV_PRODUCTS){
    let v=0;
    if(pos.phase==='before')v=num(sr[g]);
    else if(pos.phase==='sea'){const a=pos.from<0?num(sr[g]):val(rs[pos.from],'departure',g);v=lerp(a,val(rs[pos.to],'arrival',g),pos.frac);}
    else if(pos.phase==='port')v=lerp(val(rs[pos.index],'arrival',g),val(rs[pos.index],'departure',g),pos.frac);
    else if(pos.phase==='after')v=val(rs[pos.index],'departure',g);
    out[g]=Math.round(v*1000)/1000;
  }
  return out;
}

/* Words for the pop-up: "In port — Singapore" / "At sea — Singapore → Busan" / ... */
export function rvPositionText(results,pos,presentName){
  const rs=results||[];
  if(pos.phase==='port')return{status:'In port',detail:rs[pos.index].port};
  if(pos.phase==='sea'){const from=pos.from<0?(presentName||'present position'):rs[pos.from].port;return{status:'At sea',detail:`${from} \u2192 ${rs[pos.to].port}`};}
  if(pos.phase==='before')return{status:'Before plan start',detail:'The date is earlier than the noon report this plan starts from.'};
  if(pos.phase==='after')return{status:'After last departure',detail:`Voyage plan ends at ${rs[pos.index].port}.`};
  return{status:'No route',detail:'Add ports in the Voyage tab.'};
}

const sameDay=(wall,date)=>String(wall||'').slice(0,10)===date;
/* Which saved record does the date point to?  noon = the Noon report entry (Tanks tab, Logbook ROB),
   log = a saved tank condition (Tanks tab, Save tank condition), plan = calculated from the voyage plan. */
export function rvSourceFor(date,noonLocal,tankLog){
  if(sameDay(noonLocal,date))return{kind:'noon'};
  const hit=(tankLog||[]).find(l=>l&&sameDay(l.atLocal,date));
  return hit?{kind:'log',logId:hit.id}:{kind:'plan'};
}

/* Sum of the tanks saved in a tank-condition entry, per product. */
export function rvLogTotals(entry){
  const out=Object.fromEntries(RV_PRODUCTS.map(g=>[g,0]));
  for(const t of (entry&&entry.tanks)||[])if(t.group in out)out[t.group]+=num(t.rob);
  for(const g of RV_PRODUCTS)out[g]=Math.round(out[g]*1000)/1000;return out;
}

/* One call for the noon-report-by-date pop-up.
   opts: {results,startUtc,date:'YYYY-MM-DD',defaultOffset,startRob,noonLocal,noonRob,tankLog,presentName}
   The local noon is taken at the vessel's UTC offset: the port's own offset when the vessel is in port that day,
   otherwise defaultOffset (offset of the present position). */
export function rvLookupNoon(o){
  const date=String(o.date||'').slice(0,10);
  let t=rvNoonMs(date,o.defaultOffset);if(!Number.isFinite(t))return{ok:false,reason:'Pick a valid date.'};
  let pos=rvPositionAt(o.results,o.startUtc,t),offset=num(o.defaultOffset);
  if(pos.phase==='port'){offset=num(o.results[pos.index].utcOffset);t=rvNoonMs(date,offset);pos=rvPositionAt(o.results,o.startUtc,t);}
  const source=rvSourceFor(date,o.noonLocal,o.tankLog);
  let rob,basis;
  if(source.kind==='noon'){rob={...Object.fromEntries(RV_PRODUCTS.map(g=>[g,0])),...(o.noonRob||{})};basis='Noon report entry (Logbook ROB)';}
  else if(source.kind==='log'){rob=rvLogTotals((o.tankLog||[]).find(l=>l.id===source.logId));basis='Saved tank condition';}
  else{rob=rvRobAt(o.results,pos,o.startRob);basis='Calculated from the voyage plan';}
  const text=rvPositionText(o.results,pos,o.presentName);
  return{ok:true,date,noonMs:t,utcOffset:offset,pos,status:text.status,detail:text.detail,rob,source,basis,
    port:pos.phase==='port'?rvPortRob(o.results,pos.index):null};
}
