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
export const cases:Case[]=process.env.EXTRA?[
 ['52 dir0 mid','ttc5241','ttc','52','0','2026-10-21',540,900,15],['52 dir1 mid','ttc5241','ttc','52','1','2026-10-21',540,900,15],
 ['41 dir0 satmid','ttc5241','ttc','41','0','2026-10-24',540,900,15],['41 dir1 satmid','ttc5241','ttc','41','1','2026-10-24',540,900,15],
 ['52 dir0 satmid','ttc5241','ttc','52','0','2026-10-24',540,900,15],['52 dir1 satmid','ttc5241','ttc','52','1','2026-10-24',540,900,15]]:[
 ['900 EB eve','drt','drt','900','0','2026-11-18',1140,1380,20],['900 WB eve','drt','drt','900','1','2026-11-18',1140,1380,20],
 ['901 N AM','drt','drt','901','0','2026-11-18',360,540,20],['901 S AM','drt','drt','901','1','2026-11-18',360,540,20],
 ['901 N eve','drt','drt','901','0','2026-11-18',1140,1380,20],['901 S eve','drt','drt','901','1','2026-11-18',1140,1380,20],
 ['102 N eve','ttc102','ttc','102','1','2026-10-21',1140,1380,20],['102 S eve','ttc102','ttc','102','0','2026-10-21',1140,1380,20],
 ['102 N mid','ttc102','ttc','102','1','2026-10-21',540,900,15],['102 S mid','ttc102','ttc','102','0','2026-10-21',540,900,15],
 ['102 N am','ttc102','ttc','102','1','2026-10-21',360,540,15],['102 S am','ttc102','ttc','102','0','2026-10-21',360,540,15]];

const med=(a:number[])=>{if(!a.length)return NaN;const s=[...a].sort((x,y)=>x-y);const m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2;};
const q=(a:number[],p:number)=>{if(!a.length)return NaN;const s=[...a].sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.floor(p*(s.length-1)+0.5))];};
const dist=(a:number[])=>a.length?`n${a.length} min ${Math.min(...a).toFixed(1)} med ${med(a).toFixed(1)} p90 ${q(a,.9).toFixed(1)} max ${Math.max(...a).toFixed(1)}`:'n0';
const MODES=['R1','R3','R4','R2','F','E'] as const; type Mode=typeof MODES[number];
const T:any={stretches:0,base1:0,stops:0}; for(const m of MODES) T[m]={one:0,pf:0,fp:0,tier:0,chg:0,worseOwn:0,worseBase:0,outside:0,outMax:0,fpM:[] as number[],pfL:[] as string[],fpL:[] as string[],worstDelta:[] as number[]};
const passM:number[]=[]; // margin longest-limit of base passing pooled stops
const FL:any={a:0,b:0,c:0,d:0,e:0,tot:0,w1:0,pairs:0,pooledStops:0,within1:0,details:[] as string[]}; const FLdrt:any={a:0,b:0,c:0,d:0,tot:0};
const prem:any={stretches:0,identical:0,nonident:[] as string[]};
const same:any={};
for(const [label,dir,sd,route,dirId,date,start,end,filter] of cases){
  const L=loadPatterns(S+'/'+dir,S+'/'+sd,route,dirId,date); const {out,sharers}=readAll(L,start,end);
  const LT=labelled(S+'/'+dir,route,dirId,date);
  const depsOf=new Map(L.pats.map(p=>[p.key,p.deps]));
  const best=new Map<string,{n:number;pub:number;ownPub:number|null;R:Record<Mode,number|null>;margin:number|null}>();
  const caseBase={pooled:0,refused:0}; const caseMode:any={}; for(const m of MODES) caseMode[m]={refused:0,worse:0,changed:0};
  L.pats.forEach((p,pi)=>{
    const rs=out.get(p.key)!; const myT=LT.depsT.get(p.key)!;
    const sig=rs.map(r=>r.pooled?[...r.sharers].sort().join('+'):'');
    const lab=rs.map(r=>{ const own=myT.get(r.stop)??[]; if(!r.pooled) return {own,pool:own};
      const others=sharers.get(p.key)?.get(L.parent.get(r.stop)??r.stop); const pool=[...own]; for(const k of [...(others??[])].sort()){const d=LT.depsT.get(k)?.get(r.stop); if(d)pool.push(...d);} return {own,pool};});
    const inW=(t:number)=>t>=start&&t<=end;
    const base=rs.map((r,j)=>{ const w=lab[j].pool.map(e=>e.t).filter(inW).sort((a,b)=>a-b); const o=lab[j].own.map(e=>e.t).filter(inW).sort((a,b)=>a-b); return r.pooled?gate(w,o):null;});
    const baseOwnV=rs.map((r,j)=>ownMedian(lab[j].own.map(e=>e.t).filter(inW)));
    const pubOf=(j:number)=>rs[j].pub;
    const R:Record<Mode,(number|null)[]>={R1:[],R3:[],R4:[],R2:[],F:rs.map(r=>r.pub),E:rs.map(r=>r.pub)};
    const trSet=(j:number)=>{const s=new Set<string>(); lab[j].pool.filter(e=>inW(e.t)).forEach(e=>s.add(e.trip)); return [...s].sort().join(',');};
    let a=0;
    for(let i=1;i<=rs.length;i++) if(i===rs.length||sig[i]!==sig[a]){
      // ---- R modes
      for(const mode of ['R1','R3','R4','R2'] as const){
        const refOf=(trip:string)=>{ const td=LT.tripDep.get(trip)!;
          if(mode==='R2'){ for(const [,t] of td) return t; return NaN; }
          if(mode==='R1'){ for(let j=a;j<i;j++){ const t=td.get(rs[j].stop); if(t!=null) return t; } return NaN; }
          if(mode==='R4'){ for(let j=i-1;j>=a;j--){ const t=td.get(rs[j].stop); if(t!=null) return t; } return NaN; }
          const mid=a+((i-a)>>1); for(let d=0;d<i-a;d++) for(const j of [mid+d,mid-d]) if(j>=a&&j<i){ const t=td.get(rs[j].stop); if(t!=null) return t; } return NaN; };
        const cache=new Map<string,number>(); const ref=(tr:string)=>{ if(!cache.has(tr)) cache.set(tr,refOf(tr)); return cache.get(tr)!; };
        for(let j=a;j<i;j++){
          const selP=lab[j].pool.filter(e=>{const rt=ref(e.trip);return rt>=start&&rt<=end;}); const selO=lab[j].own.filter(e=>{const rt=ref(e.trip);return rt>=start&&rt<=end;});
          const w=selP.map(e=>e.t).sort((x,y)=>x-y), o=selO.map(e=>e.t).sort((x,y)=>x-y);
          const g=rs[j].pooled?gate(w,o):null; const ownV=ownMedian(o); const worst=g&&g.refused?g.longest:null;
          R[mode][j]=rs[j].pooled?((g&&!g.refused?g.value:null)??ownV??worst):ownV;
          for(const e of selP) if(!inW(e.t)){ T[mode].outside++; T[mode].outMax=Math.max(T[mode].outMax,e.t<start?start-e.t:e.t-end); }
        }
      }
      // ---- stretch-level: F, E, premise, flips
      if(sig[a]!==''){
        const idx=[];for(let j=a;j<i;j++) if(rs[j].pub!=null) idx.push(j);
        // premise: identical all-day trip set at every stop of the stretch
        if(i-a>=2){ prem.stretches++; const sets=[]; for(let j=a;j<i;j++) sets.push([...new Set(lab[j].pool.map(e=>e.trip))].sort().join(','));
          if(new Set(sets).size===1) prem.identical++; else { const u=sets.map(x=>new Set(x.split(','))); let md=0; for(let j=1;j<u.length;j++){ const d=[...u[j]].filter(x=>!u[j-1].has(x)).length+[...u[j-1]].filter(x=>!u[j].has(x)).length; md=Math.max(md,d);} prem.nonident.push(`${label} P${pi} ${a}-${i-1} distinctSets ${new Set(sets).size} maxAdjDiff ${md}`); } }
        if(idx.length>=2){ T.stretches++; if(new Set(idx.map(j=>rs[j].pub!<=filter)).size===1) T.base1++;
          for(const m of MODES){ const ns=idx.filter(j=>R[m][j]!=null).map(j=>R[m][j]!); if(m==='F'||m==='E') continue; if(new Set(ns.map(x=>x<=filter)).size===1) T[m].one++; }
          const pubs=idx.map(j=>rs[j].pub!); const mdn=med(pubs); const fj=idx.reduce((b,j)=>rs[j].n>rs[b].n?j:b,idx[0]); const fg=base[fj]; const pass=fg!=null&&!fg.refused;
          for(const j of idx){ R.F[j]=Math.min(rs[j].pub!,mdn); if(pass&&base[j]) R.E[j]=Math.min(rs[j].pub!,fg!.value); }
          for(const m of ['F','E'] as const){ const ns=idx.map(j=>R[m][j]!); if(new Set(ns.map(x=>x<=filter)).size===1) T[m].one++; }
        }
        // flips between adjacent pooled stops of the stretch
        for(let j=a+1;j<i;j++){ const g0=base[j-1],g1=base[j]; if(!g0||!g1) continue; FL.pairs++;
          if(g0.refused===g1.refused) continue; FL.tot++; const isDrt=dir==='drt';
          let c:string; if(trSet(j-1)!==trSet(j)) c='a'; else if(g0.n!==g1.n) c='c'; else if(g0.ov!==g1.ov) c='d'; else c='b';
          FL[c]++; if(isDrt) FLdrt[c]++, FLdrt.tot++;
          const m0=g0.longest-g0.limit,m1=g1.longest-g1.limit; if(Math.abs(m0)<=1||Math.abs(m1)<=1) FL.w1++;
          FL.details.push(`${label} P${pi} ${j-1}->${j} ${rs[j-1].stop}->${rs[j].stop} cause ${c} margin ${m0.toFixed(1)}/${m1.toFixed(1)} longest ${g0.longest}/${g1.longest} limit ${g0.limit.toFixed(1)}/${g1.limit.toFixed(1)} n ${g0.n}/${g1.n}`); }
      }
      a=i; }
    for(let j=0;j<rs.length;j++){ const g=base[j]; if(g){ FL.pooledStops++; if(Math.abs(g.longest-g.limit)<=1) FL.within1++; caseBase.pooled++; if(g.refused) caseBase.refused++; } }
    rs.forEach((r,j)=>{ if(r.pub==null)return; const own=p.deps.get(r.stop)?.length??0; const cur=best.get(r.stop);
      if(!cur||own>cur.n){ const Rv:any={}; for(const m of MODES) Rv[m]=R[m][j]; best.set(r.stop,{n:own,pub:r.pub,ownPub:baseOwnV[j],R:Rv,margin:base[j]?base[j]!.longest-base[j]!.limit:null}); }
      if(base[j]&&!base[j]!.refused) passM.push(base[j]!.longest-base[j]!.limit); });
    if(process.env.SHOW&&label===process.env.SHOW&&pi===0){ rs.forEach((r,j)=>{ const g=base[j]; console.log(j,r.stop,'pub',r.pub,g?`n${g.n} long${g.longest} lim${g.limit.toFixed(1)} ${g.refused?'REF':'ok'}`:'-','R1',R.R1[j],'R3',R.R3[j],'R4',R.R4[j],'F',R.F[j],'E',R.E[j]); }); }
  });
  for(const [st,b] of best){ T.stops++; for(const m of MODES){ const x=b.R[m]; if(x==null)continue; const w=b.pub<=filter,n=x<=filter;
    if(w&&!n){T[m].pf++; T[m].pfL.push(`${label}:${st} ${b.pub}->${x}`);}
    if(!w&&n){T[m].fp++; T[m].fpL.push(`${label}:${st} ${b.pub}->${x}`); if(b.margin!=null) T[m].fpM.push(b.margin);}
    if(headwayToTier(x)!==headwayToTier(b.pub))T[m].tier++; if(x!==b.pub){T[m].chg++;}
    if(b.ownPub!=null&&x>b.ownPub)T[m].worseOwn++; if(x>b.pub){T[m].worseBase++; T[m].worstDelta.push(x-b.pub);} } }
  if(process.env.EXTRA){ console.log(label,'pooled stops',caseBase.pooled,'base refused',caseBase.refused,'| per mode (stops: changed/worse than base/pf/fp):',MODES.map(m=>{let ch=0,wo=0,pf=0,fp=0; for(const b of best.values()){const x=b.R[m]; if(x==null)continue; if(x!==b.pub)ch++; if(x>b.pub)wo++; if(b.pub<=filter&&x>filter)pf++; if(b.pub>filter&&x<=filter)fp++;} return `${m} ${ch}/${wo}/${pf}/${fp}`;}).join('  ')); }
}
console.log('stretches',T.stretches,'base one-colour',T.base1,'stops',T.stops);
for(const m of MODES) console.log(m,'one-colour',T[m].one,'pass->fail',T[m].pf,'fail->pass',T[m].fp,'tier-changed',T[m].tier,'value-changed',T[m].chg,'worse-than-own',T[m].worseOwn,'worse-than-base',T[m].worseBase,'(delta '+dist(T[m].worstDelta)+')','outsideTrips',T[m].outside,'maxMinOutside',T[m].outMax,'\n   fp margin(longest-limit at today gate):',dist(T[m].fpM),'\n   pf:',T[m].pfL.slice(0,40).join(' | '),'\n   fp:',T[m].fpL.slice(0,40).join(' | '));
console.log('passing-stop margin (longest-limit, negative=slack):',dist(passM));
console.log('FLIPS adjacent-pooled pairs',FL.pairs,'flips',FL.tot,'a',FL.a,'b',FL.b,'c',FL.c,'d',FL.d,'e',FL.e,'| DRT-only',JSON.stringify(FLdrt),'| flips within 1min of limit',FL.w1,'| pooled stops within 1min of limit',FL.within1,'/',FL.pooledStops);
console.log(FL.details.join('\n'));
console.log('PREMISE stretches',prem.stretches,'identical all-day trip set at every stop',prem.identical); console.log(prem.nonident.slice(0,60).join('\n'));
