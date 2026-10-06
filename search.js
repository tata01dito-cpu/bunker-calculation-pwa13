/* Home search (v1.65) — pure helpers (no DOM, no app state), tested by test-search.mjs.
   buildSearchIndex(ctx) turns the plan (route rows from calculateVoyage(), tanks, products, bunkering, ECA, alerts, noon report)
   into small "cards"; searchIndex(index, query) ranks them for the keywords typed on the Home screen.
   Every card carries a `source` that app.js (chunk 2) uses for the "Go to source" button.
   Chunk 1 = this file. Chunk 2 wires it in app.js. Chunk 3 = smarter answers + polish. */
const num=v=>{const x=Number(v);return Number.isFinite(x)?x:0;};
const STOP=new Set(['the','a','an','is','are','was','were','of','to','in','on','at','for','and','or','me','my','show','tell','what','whats','where','when','how','much','many','do','does','i','we','you','please','about','give','find','get','need','want','see','can','should','will','be','it','this','that','with','from']);
/* typed word -> extra words it also means */
export const SYNONYMS={vlsfo:['fo','fuel'],hfo:['fo','fuel'],ifo:['fo','fuel'],fuel:['fo'],lsmgo:['do','diesel'],mgo:['do','diesel'],gasoil:['do','diesel'],diesel:['do'],cyl:['cylinder'],lube:['cylinder','system','lub'],lubricant:['lube','lub'],
  arrival:['eta'],arrive:['eta'],arriving:['eta'],departure:['etd'],depart:['etd'],sail:['etd'],sailing:['etd'],remaining:['rob'],remain:['rob'],onboard:['rob'],quantity:['rob'],stock:['rob'],
  consumption:['rate'],consume:['rate'],burn:['rate'],speed:['kn'],knot:['kn'],distance:['nm'],mile:['nm'],
  sulphur:['eca','sul'],sulfur:['eca','sul'],emission:['eca'],seca:['eca'],changeover:['eca'],change:['eca'],
  refuel:['bunker'],bunkering:['bunker'],bunkers:['bunker'],supply:['bunker'],
  capacity:['cap'],full:['cap'],percent:['cap'],warning:['alert'],alerts:['alert'],problem:['alert'],shortage:['alert','bunker'],
  noon:['logbook'],report:['noon'],position:['noon','port'],ports:['port'],tanks:['tank'],save:['saved'],export:['docx'],word:['docx'],print:['docx']};
const TYPE_WORDS={tank:'tank',port:'port',bunker:'bunker',eca:'eca',alert:'alert',noon:'noon',logbook:'noon',rate:'product',setup:'help',help:'help'};

export function tokenize(q){
  const raw=String(q||'').toLowerCase().replace(/[^a-z0-9.\s%]+/g,' ').split(/\s+/).filter(Boolean);
  const out=[];
  for(const w0 of raw){
    let w=w0.replace(/^\.+|\.+$/g,'');if(!w||STOP.has(w))continue;
    if(w.length>3&&w.endsWith('s')&&!/(ss|us|is)$/.test(w))w=w.slice(0,-1);
    if(!out.includes(w))out.push(w);
  }
  return out;
}
const words=s=>String(s||'').toLowerCase().replace(/[^a-z0-9\s]+/g,' ').split(/\s+/).filter(Boolean);
const q2=(v,u)=>`${num(v).toFixed(u==='L'?0:2)} ${u||'MT'}`;
const d2=(iso,off)=>{const d=new Date(iso);if(Number.isNaN(d.getTime()))return'\u2014';const l=new Date(d.getTime()+num(off)*3600000),p=x=>String(x).padStart(2,'0');return `${l.getUTCFullYear()}-${p(l.getUTCMonth()+1)}-${p(l.getUTCDate())} ${p(l.getUTCHours())}:${p(l.getUTCMinutes())}`;};
const card=(id,type,title,lines,keywords,source,extra)=>({id,type,title,lines:lines.filter(l=>l&&l[1]!==''&&l[1]!==undefined),keywords:keywords||'',source,...(extra||{})});

/* Static help cards: what each screen / button is for. */
export const HELP_CARDS=[
  ['dashboard','Dashboard','Route summary, Tank ROB of each port, bunker needed, logbook vs actual ROB.','home dashboard route summary overview',{kind:'tab',tab:'dashboard'}],
  ['setup','Setup','Vessel name, voyage no., present position, consumption rates, reserve days.','setup vessel voyage rates consumption reserve present position',{kind:'tab',tab:'setup'}],
  ['tanks','Tank Condition','Every tank: capacity, ROB, density, sequence; fresh and drinking water tanks and FWG; fuel additives; Logbook ROB and noon report date; Save tank condition.','tanks tank condition capacity density sequence logbook noon report save fresh water drinking fwg generator additive additives dosage',{kind:'tab',tab:'tanks'}],
  ['voyage','Ports (Voyage)','Add ports in sailing order: distance, speed, port stay, UTC offset, anchor stay.','ports voyage route distance speed stay offset anchor add port',{kind:'tab',tab:'voyage'}],
  ['bunkering','Bunkering & Lube Oil','Plan fuel bunkering and lube oil replenishment per port with tank allocation.','bunkering bunker lube oil replenishment allocation drums',{kind:'tab',tab:'bunkering'}],
  ['eca','ECA / SECA Changeover','Entering and leaving an Emission Control Area, fuel change-over timing.','eca seca emission control area changeover sulphur',{kind:'tab',tab:'eca'}],
  ['results','Results & Export','Consumption totals, Word voyage report, bunkering forms, save voyage.','results export docx word report form save voyage consumption totals',{kind:'tab',tab:'results'}],
  ['btn-plan','Plan a bunkering','Works out how much fuel, diesel and lube oil to take at a port.','plan bunkering how much bunker take quantity',{kind:'button',sel:'#planBunkerBtn'}],
  ['btn-rob','Tank ROB','Tank ROB at any port, or the noon report ROB for a date.','show tank rob port noon report date in port at sea',{kind:'button',sel:'#robViewBtn'}],
  ['btn-eco','Change-over Details','Start and finish of the ECA/SECA fuel change-over.','change-over details eca seca start finish',{kind:'button',sel:'#ecoBtn'}],
  ['btn-calc','Calculator','Built-in calculator.','calculator calc',{kind:'button',sel:'#calcBtn'}],
  ['btn-alerts','Planning alerts','Negative ROB, overfill, shortages and missing data.','alerts planning warning',{kind:'button',sel:'#alertsBtn'}]
].map(([id,title,text,kw,source])=>card('help:'+id,'help',title,[['What it does',text]],kw,source));

/* ctx: {meta, results, tanks, fuels, lubes, route, alerts:[{title,text}], tabs, fmt:{qty,date}} — all plain data. */
export function buildSearchIndex(ctx){
  const c=ctx||{},meta=c.meta||{},results=c.results||[],tanks=c.tanks||[],route=c.route||[];
  const qty=(c.fmt&&c.fmt.qty)||q2,dt=(c.fmt&&c.fmt.date)||d2;
  const profiles=[...(c.fuels||[]),...(c.lubes||[])];
  const prof=g=>profiles.find(p=>p.id===g)||{id:g,name:g,unit:'MT'};
  const items=[];
  results.forEach((r,i)=>{
    const rob=[...profiles].map(p=>{const a=r.arrivalFuel&&r.arrivalFuel[p.id]!==undefined?r.arrivalFuel[p.id]:r.arrivalLube&&r.arrivalLube[p.id];const d=r.departureFuel&&r.departureFuel[p.id]!==undefined?r.departureFuel[p.id]:r.departureLube&&r.departureLube[p.id];return[`${p.name} ROB (ETA \u2192 ETD)`,`${qty(a,p.unit)} \u2192 ${qty(d,p.unit)}`];});
    items.push(card('port:'+i,'port',`${r.port} (port ${i+1} of ${results.length})`,[
      ['ETA',`${dt(r.arrivalUtc,r.utcOffset)} local`],['ETD',`${dt(r.departureUtc,r.utcOffset)} local`],
      ['Distance / speed',`${num(r.distanceNm).toFixed(1)} NM at ${num(r.speedKn).toFixed(1)} kn`],
      ['Port stay',`${Math.floor(num(r.portStayDays))} d ${num(r.portStayHours)} h`],...rob],
      `${r.port} port eta etd arrival departure distance speed stay rob route`,{kind:'port',index:i},{name:r.port}));
    const bi=r.bunkerInfo||{},bl=Object.keys(bi).filter(g=>num(bi[g]&&bi[g].quantity)>0.0005||num(bi[g]&&bi[g].transferred)>0.0005);
    if(bl.length)items.push(card('bunker:'+i,'bunker',`Bunkering at ${r.port}`,bl.map(g=>[prof(g).name,qty(bi[g].quantity,prof(g).unit)]),`${r.port} bunker bunkering receive supply planned quantity`,{kind:'bunkerPort',index:i}));
  });
  tanks.forEach(t=>{
    const p=prof(t.group),cap=num(t.capacity||t.cap),rob=num(t.rob);
    items.push(card('tank:'+t.id,'tank',t.name||t.id,[
      ['Product',p.name],['ROB',qty(rob,p.unit)],cap>0?['Capacity',qty(cap,p.unit)]:null,cap>0?['Filled',`${(rob/cap*100).toFixed(0)} %`]:null,t.category?['Role',String(t.category)]:null],
      `${t.name||''} tank ${p.name} ${t.group} rob capacity`,{kind:'tank',id:t.id}));
  });
  const nr=meta.noonRob||{};
  for(const p of profiles){
    const sea=num(p.seaRate),port=num(p.portRate);
    items.push(card('product:'+p.id,'product',p.name,[
      ['Logbook ROB (noon report)',qty(nr[p.id],p.unit)],c.actual&&c.actual[p.id]!==undefined?['Actual tank ROB',qty(c.actual[p.id],p.unit)]:null,
      ['At sea / day',qty(sea,p.unit)],port>0?['In port / day',qty(port,p.unit)]:null,['Reserve',`${num(p.reserveDays)} days`]],
      `${p.name} ${p.id} rob rate consumption reserve logbook actual`,{kind:'product',id:p.id}));
  }
  items.push(card('noon','noon','Noon report',[['Date (local)',meta.noonLocal?String(meta.noonLocal).replace('T',' '):''],['Present position',meta.currentPosition||''],['Vessel',meta.vesselName||''],['Voyage',meta.voyageNo||'']],'noon report logbook date present position vessel voyage',{kind:'noon'}));
  route.forEach((s,i)=>{const e=s&&s.eca;if(!e)return;const on=[e.port&&e.port.enabled?'in an ECA/SECA':'',e.entering&&e.entering.enabled?'entering ECA/SECA':'',e.leaving&&e.leaving.enabled?'leaving ECA/SECA':''].filter(Boolean);
    if(on.length)items.push(card('eca:'+i,'eca',`ECA/SECA at ${s.port||'port '+(i+1)}`,[['Status',on.join(', ')]],`${s.port||''} eca seca emission changeover sulphur`,{kind:'eca',index:i}));});
  (c.alerts||[]).forEach((a,i)=>items.push(card('alert:'+i,'alert',a.title||'Alert',[['Detail',a.text||'']],`alert warning ${a.title||''}`,{kind:'alert',index:i})));
  return [...items,...HELP_CARDS];
}

/* Rank cards for a query. Returns [{item, score, matched:[tokens]}], best first. */
export function searchIndex(index,query,opts){
  const limit=(opts&&opts.limit)||8,toks=tokenize(query);
  if(!toks.length)return[];
  const intent=new Set();for(const t of toks){if(TYPE_WORDS[t])intent.add(TYPE_WORDS[t]);for(const s of SYNONYMS[t]||[])if(TYPE_WORDS[s])intent.add(TYPE_WORDS[s]);}
  const out=[];
  for(const it of index||[]){
    const title=new Set(words(it.title)),kw=new Set(words(it.keywords)),body=words(it.lines.map(l=>l[0]+' '+l[1]).join(' '));
    const bodySet=new Set(body);
    const hit=(set,w)=>set.has(w)||(w.length>=3&&[...set].some(x=>x.startsWith(w)));
    let score=0;const matched=[];
    for(const t of toks){
      const alts=[t,...(SYNONYMS[t]||[])];let best=0;
      alts.forEach((w,k)=>{const f=k===0?1:.6;if(hit(title,w))best=Math.max(best,5*f);else if(hit(kw,w))best=Math.max(best,3*f);else if(hit(bodySet,w))best=Math.max(best,1*f);});
      if(best>0){score+=best;matched.push(t);}
    }
    if(!matched.length)continue;
    score*=0.5+0.5*matched.length/toks.length;
    if(intent.has(it.type))score+=2;
    out.push({item:it,score:Math.round(score*100)/100,matched});
  }
  out.sort((a,b)=>b.score-a.score||String(a.item.title).localeCompare(String(b.item.title)));
  return out.slice(0,limit);
}

/* One-line direct answer for questions such as "how much fuel at Busan" / "Busan ETA" / "VLSFO ROB".
   Built only from the cards, so it always matches what the result list shows. Returns {text, id} or null. */
export function searchAnswer(index,query){
  const toks=tokenize(query);if(!toks.length)return null;
  const exp=new Set();for(const t of toks){exp.add(t);for(const x of SYNONYMS[t]||[])exp.add(x);}
  const pid=['fo','do','cyl'].find(p=>exp.has(p)||(p==='cyl'&&exp.has('cylinder')));
  const prod=pid&&(index||[]).find(c=>c.id==='product:'+pid);
  const port=(index||[]).find(c=>c.type==='port'&&c.name&&words(c.name).some(w=>w.length>=3&&toks.some(t=>t===w||(t.length>=3&&w.startsWith(t)))));
  const line=(c,label)=>c&&c.lines.find(l=>l[0].toLowerCase().startsWith(String(label).toLowerCase()));
  const wantBunker=exp.has('bunker'),wantTimes=exp.has('eta')||exp.has('etd');
  if(port&&prod&&wantBunker){const b=(index||[]).find(c=>c.id==='bunker:'+port.source.index),l=line(b,prod.title);
    return{text:l?`Bunkering at ${port.name}: ${prod.title} ${l[1]}.`:`No ${prod.title} bunkering is planned at ${port.name}.`,id:l?b.id:port.id};}
  if(port&&prod){const l=line(port,prod.title);if(l)return{text:`${prod.title} at ${port.name}: ${l[1]} (ETA \u2192 ETD).`,id:port.id};}
  if(port&&(wantTimes||toks.length===1)){const a=line(port,'ETA'),d=line(port,'ETD');if(a&&d)return{text:`${port.name}: ETA ${a[1]}; ETD ${d[1]}.`,id:port.id};}
  if(prod&&!port&&(exp.has('rob')||toks.length===1)){const a=line(prod,'Actual'),n=line(prod,'Logbook');if(a||n)return{text:`${prod.title}: ${a?`actual tank ROB ${a[1]}`:''}${a&&n?'; ':''}${n?`logbook ROB ${n[1]}`:''}.`,id:prod.id};}
  return null;
}
