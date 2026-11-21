import { csv, loadPatterns, TF } from './realx.ts';
import { computeStopSharers, buildPooledStopMap, collapseBunched } from '/Users/ryan/Developer/Code/Platforms/Atlas/pipeline/stopPools.ts';
import { medianHeadwayInWindow, typicalOfGaps } from '/Users/ryan/Developer/Code/Platforms/Atlas/pipeline/headway-utils.ts';
import { cases } from './step1.ts';
const S='/private/tmp/claude-501/-Users-ryan/c8d09263-8b14-4eb3-a210-0831beabea38/scratchpad';
const hms=(s:string)=>{const [h,m,x]=s.split(':').map(Number);return {h,m,x:x||0};};
const TFS:Record<string,(s:string)=>number>={floor:s=>{const t=hms(s);return t.h*60+t.m;},sec:s=>{const t=hms(s);return t.h*60+t.m+t.x/60;}};
const CFG:Record<string,{tf:string;gm:string}>={T0:{tf:'floor',gm:'pipe'},A1:{tf:'sec',gm:'pipe'},A2:{tf:'sec',gm:'frac'}};
function ownVal(t0:number[],gm:string){ const t=[...new Set(t0)].sort((a,b)=>a-b); if(t.length<3)return null; if(gm==='pipe')return medianHeadwayInWindow(t,-1e9,1e9,3,true); const g=[];for(let i=1;i<t.length;i++)g.push(t[i]-t[i-1]); return typicalOfGaps(g); }
function gate(pool:number[],own:number[],gm:string){
  const w=collapseBunched([...new Set(pool)].sort((a,b)=>a-b)); if(w.length<3)return null; const gaps=[];for(let i=1;i<w.length;i++)gaps.push(w[i]-w[i-1]);
  const typical=gm==='pipe'?medianHeadwayInWindow(w,-1e9,1e9,3,true)!:typicalOfGaps(gaps); const mean=(w[w.length-1]-w[0])/(w.length-1); const longest=Math.max(...gaps);
  const ov=ownVal(own,gm); const mr=gm==='pipe'?Math.round(mean):mean; const floored=Math.max(typical,mr); const value=ov!=null?Math.min(floored,ov):floored;
  const l1=Math.max(1.75*mean,mr+5),l2=Math.max(1.6*value,value+5); return {value,longest,limit:Math.min(l1,l2),refused:longest>l1||longest>l2,n:w.length,w,mean};
}
type E={t:number;trip:string};
function labelled(dir:string,shortName:string,dirId:string,date:string){
  const routes=csv(`${dir}/routes.txt`).filter(r=>r.route_short_name===shortName).map(r=>r.route_id);
  const dow=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][new Date(date+'T12:00:00').getDay()]; const ymd=date.replace(/-/g,'');
  const svc=new Set(csv(`${dir}/calendar.txt`).filter(c=>c[dow]==='1'&&c.start_date<=ymd&&c.end_date>=ymd).map(c=>c.service_id));
  const trips=csv(`${dir}/trips.txt`).filter(t=>routes.includes(t.route_id)&&svc.has(t.service_id)&&t.direction_id===dirId&&t.shape_id);
  const byId=new Map(trips.map(t=>[t.trip_id,t])); const st=new Map<string,any[]>();
  for(const r of csv(`${dir}/stop_times.txt`)){ if(!byId.has(r.trip_id))continue; const l=st.get(r.trip_id)??[]; const ts=r.departure_time||r.arrival_time; l.push({stop:r.stop_id,dep:TF.f(ts),raw:ts,seq:Number(r.stop_sequence),pu:r.pickup_type}); st.set(r.trip_id,l);}
  const depsT=new Map<string,Map<string,E[]>>(); const tripDep=new Map<string,Map<string,number>>(); const raw=new Map<string,string>();
  for(const t of trips){ const l=(st.get(t.trip_id)??[]).sort((a,b)=>a.seq-b.seq); if(l.length<2)continue; const key=`${t.route_id}|sh|${t.shape_id}`;
    let m=depsT.get(key); if(!m){m=new Map();depsT.set(key,m);} const s2=new Set<string>(); const td=new Map<string,number>();
    for(const x of l){ if(s2.has(x.stop))continue; s2.add(x.stop); if(x.pu==='1')continue; const a=m.get(x.stop)??[]; a.push({t:x.dep,trip:t.trip_id}); m.set(x.stop,a); td.set(x.stop,x.dep); raw.set(t.trip_id+'|'+x.stop,x.raw);} tripDep.set(t.trip_id,td);}
  return {depsT,tripDep,raw};
}
export function run2(cfgName:string,fallback=false,verbose=false,cs:any[]=cases){
  const cfg=CFG[cfgName]; TF.f=TFS[cfg.tf];
  const R:any={stretches:0,baseOne:0,r3One:0,baseUniRef:0,r3UniRef:0,mixedStretchesBase:0,mixedStretchesR3:0,pf:0,fp:0,worse:0,stops:0,worseL:[] as any[],fpL:[] as string[],pfL:[] as string[],flipsBase:{} as any,flipsR3:{} as any,fb:[] as string[],sameSetStretches:0,nonident:0,dRefusedAgree:0};
  const best=new Map<string,any>();
  for(const [label,dir,sd,route,dirId,date,start,end,filter] of cs){
    const L=loadPatterns(S+'/'+dir,S+'/'+sd,route,dirId,date); const LT=labelled(S+'/'+dir,route,dirId,date);
    const sp=L.pats.map(p=>({memberKey:p.key,routeId:p.key.split('|')[0],headsigns:[...p.headsigns].sort(),stopOrder:p.order}));
    const sharers=computeStopSharers(sp,L.stops,L.parent); const depsOf=new Map(L.pats.map(p=>[p.key,p.deps]));
    L.pats.forEach((p,pi)=>{
      const pooledM=buildPooledStopMap(p.deps,sharers.get(p.key),k=>depsOf.get(k),L.parent,p.deps); const myT=LT.depsT.get(p.key)!;
      const inW=(t:number)=>t>=start&&t<=end;
      const lab=p.order.map(stop=>{ const own=myT.get(stop)??[]; const isP=pooledM.pooledStops.has(stop); if(!isP)return {stop,isP,own,pool:own,sig:''};
        const others=sharers.get(p.key)?.get(L.parent.get(stop)??stop); const pool=[...own]; for(const k of [...(others??[])].sort()){const d=LT.depsT.get(k)?.get(stop); if(d)pool.push(...d);}
        return {stop,isP,own,pool,sig:[...(others??[])].sort().join('+')};});
      const val=(g:any,ownV:any)=>g?((!g.refused?g.value:null)??ownV??g.longest):ownV;
      const base=lab.map(r=>{ const w=r.pool.map(e=>e.t).filter(inW), o=r.own.map(e=>e.t).filter(inW); const ownV=ownVal(o,cfg.gm); const g=r.isP?gate(w,o,cfg.gm):null; return {g,ownV,pub:r.isP?val(g,ownV):ownV}; });
      let a=0; const sig=lab.map(r=>r.sig);
      for(let i=1;i<=lab.length;i++) if(i===lab.length||sig[i]!==sig[a]){
        const mid=a+((i-a)>>1);
        const ref=(trip:string)=>{ const td=LT.tripDep.get(trip)!; for(let d=0;d<i-a;d++) for(const j of [mid+d,mid-d]) if(j>=a&&j<i){const t=td.get(lab[j].stop); if(t!=null)return t;} return NaN; };
        const sets:string[]=[]; const r3=lab.slice(a,i).map((r,k)=>{ const j=a+k; const sel=r.pool.filter(e=>{const x=ref(e.trip);return x>=start&&x<=end;}); const selO=r.own.filter(e=>{const x=ref(e.trip);return x>=start&&x<=end;});
          sets.push([...new Set(sel.map(e=>e.trip))].sort().join(',')); const ownV=ownVal(selO.map(e=>e.t),cfg.gm); const g=r.isP?gate(sel.map(e=>e.t),selO.map(e=>e.t),cfg.gm):null; return {g,ownV,pub:r.isP?val(g,ownV):ownV,sel}; });
        const ident=new Set(sets).size===1; const useFb=fallback&&sig[a]!==''&&!ident&&i-a>=2;
        if(sig[a]!==''&&i-a>=2){ R.sameSetStretches++; if(!ident){R.nonident++; R.fb.push(`${label} P${pi} stops ${a}-${i-1}`);} }
        const fin=(k:number)=>useFb?base[a+k]:r3[k];
        const idx=[];for(let j=a;j<i;j++) if(base[j].pub!=null) idx.push(j);
        if(sig[a]!==''&&idx.length>=2){ R.stretches++;
          const bc=new Set(idx.map(j=>base[j].pub<=filter)).size===1, rc=new Set(idx.map(j=>fin(j-a).pub<=filter)).size===1; if(bc)R.baseOne++; if(rc)R.r3One++;
          const bg=idx.filter(j=>base[j].g), rg=idx.filter(j=>fin(j-a).g);
          if(bg.length&&new Set(bg.map(j=>base[j].g.refused)).size===1)R.baseUniRef++; if(rg.length&&new Set(rg.map(j=>fin(j-a).g.refused)).size===1)R.r3UniRef++; if(bg.length&&new Set(bg.map(j=>base[j].g.refused)).size>1)R.mixedStretchesBase++; if(rg.length&&new Set(rg.map(j=>fin(j-a).g.refused)).size>1)R.mixedStretchesR3++; }
        if(sig[a]!=='') for(let j=a+1;j<i;j++){ const g0=base[j-1].g,g1=base[j].g; if(g0&&g1&&g0.refused!==g1.refused) R.flipsBase[`${label}|${lab[j-1].stop}->${lab[j].stop}`]=1;
          const h0=fin(j-1-a).g,h1=fin(j-a).g; if(h0&&h1&&h0.refused!==h1.refused) R.flipsR3[`${label}|${lab[j-1].stop}->${lab[j].stop}`]=1; }
        for(let j=a;j<i;j++){ const b=base[j]; if(b.pub==null)continue; const n=p.deps.get(lab[j].stop)?.length??0; const key=`${label}|${lab[j].stop}`; const cur=best.get(key);
          if(!cur||n>cur.n) best.set(key,{n,label,stop:lab[j].stop,pub:b.pub,ownV:b.ownV,x:fin(j-a).pub,filter,xs:fin(j-a),bs:b,sel:r3[j-a].sel,own:lab[j].own,pool:lab[j].pool,start,end,p:pi,j,raw:LT.raw}); }
        a=i; }
    });
  }
  for(const b of best.values()){ R.stops++; if(b.x==null)continue; const w=b.pub<=b.filter,n=b.x<=b.filter; if(w&&!n){R.pf++;R.pfL.push(`${b.label}:${b.stop} ${b.pub}->${b.x}`);} if(!w&&n){R.fp++;R.fpL.push(`${b.label}:${b.stop} ${b.pub}->${b.x}`);} if(b.x>b.pub+1e-9){R.worse++;R.worseL.push(b);} }
  return {R,best};
}
if(process.argv[2]==='main'){
  for(const c of ['T0','A1','A2']) for(const fb of [false,true]){ const {R}=run2(c,fb);
    console.log(c,'fallback',fb,'| stretches',R.stretches,'one-colour base',R.baseOne,'R3',R.r3One,'| refusal-uniform base',R.baseUniRef,'R3',R.r3UniRef,'| mixed-refusal stretches base',R.mixedStretchesBase,'R3',R.mixedStretchesR3,'| refusal flips (unique pairs) base',Object.keys(R.flipsBase).length,'R3',Object.keys(R.flipsR3).length,'| stops',R.stops,'pass->fail',R.pf,'fail->pass',R.fp,'worse-than-today',R.worse,'| nonidentical-set stretches',R.nonident,'/',R.sameSetStretches,fb?'':R.fb.join(', ')); }
}
