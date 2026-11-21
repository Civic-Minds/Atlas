import { csv, loadPatterns, readAll } from './real.ts';
import { buildPooledStopMap, collapseBunched } from '/Users/ryan/Developer/Code/Platforms/Atlas/pipeline/stopPools.ts';
import { medianHeadwayInWindow, headwayToTier } from '/Users/ryan/Developer/Code/Platforms/Atlas/pipeline/headway-utils.ts';
const S='/private/tmp/claude-501/-Users-ryan/c8d09263-8b14-4eb3-a210-0831beabea38/scratchpad';
const tmin=(s:string)=>{const [h,m]=s.split(':').map(Number);return h*60+m;};
type E={t:number;trip:string};
// trip-labelled departures per pattern (same filters as loadPatterns)
function labelled(dir:string,shortName:string,dirId:string,date:string){
  const routes=csv(`${dir}/routes.txt`).filter(r=>r.route_short_name===shortName).map(r=>r.route_id);
  const dow=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][new Date(date+'T12:00:00').getDay()]; const ymd=date.replace(/-/g,'');
  const svc=new Set(csv(`${dir}/calendar.txt`).filter(c=>c[dow]==='1'&&c.start_date<=ymd&&c.end_date>=ymd).map(c=>c.service_id));
  const trips=csv(`${dir}/trips.txt`).filter(t=>routes.includes(t.route_id)&&svc.has(t.service_id)&&t.direction_id===dirId&&t.shape_id);
  const byId=new Map(trips.map(t=>[t.trip_id,t])); const st=new Map<string,any[]>();
  for(const r of csv(`${dir}/stop_times.txt`)){ if(!byId.has(r.trip_id))continue; const l=st.get(r.trip_id)??[]; l.push({stop:r.stop_id,dep:tmin(r.departure_time||r.arrival_time),seq:Number(r.stop_sequence),pu:r.pickup_type}); st.set(r.trip_id,l);}
  const depsT=new Map<string,Map<string,E[]>>(); const tripDep=new Map<string,Map<string,number>>(); const tripPat=new Map<string,string>();
  for(const t of trips){ const l=(st.get(t.trip_id)??[]).sort((a,b)=>a.seq-b.seq); if(l.length<2)continue; const key=`${t.route_id}|sh|${t.shape_id}`;
    let m=depsT.get(key); if(!m){m=new Map();depsT.set(key,m);} const s2=new Set<string>(); const td=new Map<string,number>();
    for(const x of l){ if(s2.has(x.stop))continue; s2.add(x.stop); if(x.pu==='1')continue; const a=m.get(x.stop)??[]; a.push({t:x.dep,trip:t.trip_id}); m.set(x.stop,a); td.set(x.stop,x.dep);} tripDep.set(t.trip_id,td); tripPat.set(t.trip_id,key);}
  return {depsT,tripDep,tripPat};
}
function gate(w0:number[],ownW:number[]){ // w0 already the selected, sorted times
  const w=collapseBunched(w0); if(w.length<3) return null;
  const typical=medianHeadwayInWindow(w,-1e9,1e9,3,true); if(typical==null) return null;
  const mean=(w[w.length-1]-w[0])/(w.length-1); let longest=0,li=0; for(let i=1;i<w.length;i++) if(w[i]-w[i-1]>longest){longest=w[i]-w[i-1];li=i;}
  const os=[...new Set(ownW)].sort((a,b)=>a-b); const ov=os.length>=3?medianHeadwayInWindow(os,-1e9,1e9,3,true):null;
  const floored=Math.max(typical,Math.round(mean)); const value=ov!=null?Math.min(floored,ov):floored;
  const l1=Math.max(1.75*mean,Math.round(mean)+5), l2=Math.max(1.6*value,value+5);
  return {w,typical,mean,longest,ov,value,floored,l1,l2,limit:Math.min(l1,l2),refused:longest>l1||longest>l2,n:w.length,first:w[1]-w[0],last:w[w.length-1]-w[w.length-2]};
}
const ownMedian=(ownW:number[])=>{const os=[...new Set(ownW)].sort((a,b)=>a-b); return os.length>=3?medianHeadwayInWindow(os,-1e9,1e9,3,true):null;};
export type Case=[string,string,string,string,string,string,number,number,number];
export const cases:Case[]=[
 ['900 EB eve','drt','drt','900','0','2026-11-18',1140,1380,20],['900 WB eve','drt','drt','900','1','2026-11-18',1140,1380,20],
 ['901 N AM','drt','drt','901','0','2026-11-18',360,540,20],['901 S AM','drt','drt','901','1','2026-11-18',360,540,20],
 ['901 N eve','drt','drt','901','0','2026-11-18',1140,1380,20],['901 S eve','drt','drt','901','1','2026-11-18',1140,1380,20],
 ['102 N eve','ttc102','ttc','102','1','2026-10-21',1140,1380,20],['102 S eve','ttc102','ttc','102','0','2026-10-21',1140,1380,20],
 ['102 N mid','ttc102','ttc','102','1','2026-10-21',540,900,15],['102 S mid','ttc102','ttc','102','0','2026-10-21',540,900,15],
 ['102 N am','ttc102','ttc','102','1','2026-10-21',360,540,15],['102 S am','ttc102','ttc','102','0','2026-10-21',360,540,15]];
const med=(a:number[])=>{const s=[...a].sort((x,y)=>x-y);const m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2;};
const MODES=['R1','R2','R3'] as const; type Mode=typeof MODES[number];
const T:any={stretches:0,base1:0,stops:0}; for(const m of MODES) T[m]={one:0,pf:0,pfU20:0,fp:0,fpEx:[] as number[],tier:0,chg:0,worseOwn:0,worseBase:0,worseDetail:[] as string[],outsideTrips:0,outsideMaxMin:0,outsideStops:0,pfDetail:[] as string[],fpDetail:[] as string[]};
const passEx:number[]=[]; // longest-value for already passing stops
const DUMP=process.argv[2]==='dump';
for(const [label,dir,sd,route,dirId,date,start,end,filter] of cases){
  const L=loadPatterns(S+'/'+dir,S+'/'+sd,route,dirId,date); const {out,sharers}=readAll(L,start,end);
  const LT=labelled(S+'/'+dir,route,dirId,date);
  const depsOf=new Map(L.pats.map(p=>[p.key,p.deps]));
  const best=new Map<string,{n:number;pub:number;ownPub:number|null;R:Record<Mode,number|null>}>();
  L.pats.forEach((p,pi)=>{
    const rs=out.get(p.key)!; const pm=buildPooledStopMap(p.deps,sharers.get(p.key),k=>depsOf.get(k),L.parent,p.deps);
    const myT=LT.depsT.get(p.key)!;
    const sig=rs.map(r=>r.pooled?[...r.sharers].sort().join('+'):'');
    // labelled pooled list per stop
    const lab=rs.map(r=>{ const own=myT.get(r.stop)??[]; if(!r.pooled) return {own,pool:own};
      const others=sharers.get(p.key)?.get(L.parent.get(r.stop)??r.stop); const pool=[...own]; for(const k of [...(others??[])].sort()){const d=LT.depsT.get(k)?.get(r.stop); if(d)pool.push(...d);} return {own,pool};});
    const inW=(t:number)=>t>=start&&t<=end;
    // baseline per stop
    const base=rs.map((r,j)=>{ const w=lab[j].pool.map(e=>e.t).filter(inW).sort((a,b)=>a-b); const o=lab[j].own.map(e=>e.t).filter(inW).sort((a,b)=>a-b); return r.pooled?gate(w,o):null;});
    const R:Record<Mode,(number|null)[]>={R1:[],R2:[],R3:[]};
    const Rg:Record<Mode,any[]>={R1:[],R2:[],R3:[]};
    let a=0;
    for(let i=1;i<=rs.length;i++) if(i===rs.length||sig[i]!==sig[a]){
      for(const mode of MODES){
        // reference time per trip for this stretch
        const refOf=(trip:string)=>{ const td=LT.tripDep.get(trip)!; if(mode==='R2'){ const pk=LT.tripPat.get(trip)!; // origin: first served stop in that pattern's order
              let best:number|undefined; let bi=1e9; for(const [s,t] of td){ /* insertion order = seq order */ best=t; break;} return best!; }
          if(mode==='R3'){ const mid=a+((i-a)>>1); for(let d=0;d<i-a;d++){ for(const j of [mid+d,mid-d]){ if(j>=a&&j<i){ const t=td.get(rs[j].stop); if(t!=null) return t; } } } return NaN; }
          for(let j=a;j<i;j++){ const t=td.get(rs[j].stop); if(t!=null) return t; } return NaN; };
        const cache=new Map<string,number>(); const ref=(tr:string)=>{ if(!cache.has(tr)) cache.set(tr,refOf(tr)); return cache.get(tr)!; };
        for(let j=a;j<i;j++){
          const selP=lab[j].pool.filter(e=>{const rt=ref(e.trip);return rt>=start&&rt<=end;}); const selO=lab[j].own.filter(e=>{const rt=ref(e.trip);return rt>=start&&rt<=end;});
          const w=selP.map(e=>e.t).sort((x,y)=>x-y), o=selO.map(e=>e.t).sort((x,y)=>x-y);
          const g=rs[j].pooled?gate(w,o):null; const ownV=ownMedian(o);
          const worst=g&&g.refused?g.longest:null;
          R[mode][j]= rs[j].pooled ? ((g&&!g.refused?g.value:null) ?? ownV ?? worst) : ownV;
          Rg[mode][j]=g;
          // boundary: trips counted though clock at this stop is outside [start,end]
          for(const e of selP) if(!inW(e.t)){ T[mode].outsideTrips++; T[mode].outsideMaxMin=Math.max(T[mode].outsideMaxMin,e.t<start?start-e.t:e.t-end); }
        }
      }
      a=i;
    }
    // stretch stats (pooled stretches)
    a=0; for(let i=1;i<=rs.length;i++) if(i===rs.length||sig[i]!==sig[a]){
      if(sig[a]!==''){ const idx=[];for(let j=a;j<i;j++) if(rs[j].pub!=null) idx.push(j);
        if(idx.length>=2){ T.stretches++; if(new Set(idx.map(j=>rs[j].pub!<=filter)).size===1) T.base1++;
          for(const m of MODES){ const ns=idx.filter(j=>R[m][j]!=null).map(j=>R[m][j]!); if(new Set(ns.map(x=>x<=filter)).size===1) T[m].one++; }
          if(label==='900 EB eve'&&pi===0||label==='900 WB eve'&&pi===0) console.log(label,'P'+pi,'stretch',a,'-',i-1,'base',idx.map(j=>rs[j].pub).join(','),'\n   R1',idx.map(j=>R.R1[j]).join(','),'\n   R2',idx.map(j=>R.R2[j]).join(','),'\n   R3',idx.map(j=>R.R3[j]).join(',')); } }
      a=i; }
    rs.forEach((r,j)=>{ if(r.pub==null)return; const own=p.deps.get(r.stop)?.length??0; const cur=best.get(r.stop);
      if(!cur||own>cur.n) best.set(r.stop,{n:own,pub:r.pub,ownPub:r.own,R:{R1:R.R1[j],R2:R.R2[j]}});
      if(base[j]&&!base[j]!.refused) passEx.push(base[j]!.longest-base[j]!.value);
    });
    if(process.env.R1D&&label===process.env.R1D){ rs.forEach((r,j)=>{ const g=Rg.R1[j],b=base[j]; const f=(g:any)=>g?`n${g.n} ${g.w[0]}-${g.w[g.w.length-1]} first${g.first} last${g.last} long${g.longest} mean${Math.round(g.mean*10)/10} val${g.value} lim${Math.round(g.limit*10)/10} ${g.refused?'REF':'ok'}`:'-'; console.log('P'+pi,j,r.stop,'pub',r.pub,'| base',f(b),'| R1',f(g),'->',R.R1[j]); }); }
    if(DUMP&&((label==='900 EB eve'&&pi===0)||(label==='900 WB eve'&&pi===0))){
      console.log('=== dump',label,'pattern',pi,'stops',rs.length);
      let prev=new Set<string>();
      const lo=label.includes('EB')?38:0, hi=label.includes('EB')?60:43;
      // trip sets
      rs.forEach((r,j)=>{ if(j<lo||j>=hi) return; const set=new Map<string,number>(); lab[j].pool.filter(e=>inW(e.t)).forEach(e=>set.set(e.trip,e.t)); const ids=[...set.keys()];
        const enter=ids.filter(x=>!prev.has(x)), leave=[...prev].filter(x=>!set.has(x)); prev=new Set(ids);
        const g=base[j]; const f=(x:any)=>x==null?'-':(typeof x==='number'?(Math.round(x*10)/10):x);
        const fmt=(m:number)=>`${Math.floor(m/60)}:${String(m%60).padStart(2,'0')}`;
        console.log(String(j).padStart(2),r.stop.padEnd(6),'pooled',r.pooled?'Y':'n','pub',f(r.pub),g?`n${g.n} first ${fmt(g.w[0])} last ${fmt(g.w[g.w.length-1])} edgeGaps ${g.first}/${g.last} longest ${g.longest} mean ${f(g.mean)} typ ${g.typical} own ${g.ov} value ${g.value} l1 ${f(g.l1)} l2 ${f(g.l2)} limit ${f(g.limit)} ${g.refused?'REFUSED':'pass'}`:'',
          j>lo?` enter[${enter.map(x=>x.slice(-6)+'@'+fmt(set.get(x)!)).join(' ')}] leave[${leave.map(x=>x.slice(-6)).join(' ')}]`:''); });
    }
  });
  for(const [st,b] of best){ T.stops++; for(const m of MODES){ const x=b.R[m]; if(x==null)continue; const w=b.pub<=filter,n=x<=filter;
    if(w&&!n){T[m].pf++; if(b.pub<20)T[m].pfU20++; T[m].pfDetail.push(`${label}:${st} pub${b.pub}->${x}`);}
    if(!w&&n){T[m].fp++; T[m].fpDetail.push(`${label}:${st} pub${b.pub}->${x}`);}
    if(headwayToTier(x)!==headwayToTier(b.pub))T[m].tier++; if(x!==b.pub)T[m].chg++;
    if(b.ownPub!=null&&x>b.ownPub){T[m].worseOwn++;T[m].worseDetail.push(`${label}:${st} own${b.ownPub} R${x}`);} if(x>b.pub)T[m].worseBase++; } }
}
console.log('stretches',T.stretches,'base one-colour',T.base1,'stops',T.stops,'passEx median',med(passEx),'max',Math.max(...passEx));
for(const m of MODES) console.log(m,JSON.stringify({...T[m],fpDetail:undefined,pfDetail:undefined,worseDetail:undefined}),'\n  pf:',T[m].pfDetail.join(' | '),'\n  fp:',T[m].fpDetail.join(' | '),'\n  worseOwn:',T[m].worseDetail.join(' | '));
