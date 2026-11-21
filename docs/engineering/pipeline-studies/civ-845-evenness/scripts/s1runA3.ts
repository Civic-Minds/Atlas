import { headwayToTier } from '/Users/ryan/Developer/Code/Platforms/Atlas/pipeline/headway-utils.ts';
import { run } from './s1lib.ts';
const R:any={}; for(const c of ['T0','A1','A2','A3']) R[c]=run(c);
const T=R.T0; const keys=Object.keys(T.stops);
const fl0=new Set(Object.keys(T.flips)); console.log('today flips unique',fl0.size);
for(const c of ['T0','A1','A2','A3']){ const r=R[c]; const fl=new Set(Object.keys(r.flips));
  const gone=[...fl0].filter(k=>!fl.has(k)).length, nw=[...fl].filter(k=>!fl0.has(k)).length;
  let pf=0,pfU=0,pfEq=0,fp=0,fpO=0,fpEq=0,pubDiff=0,tier=0,n=0;
  for(const k of keys){ const a=T.stops[k],b=r.stops[k]; if(!b){continue;} n++; const wp=a.pub<=a.filter,np=b.pub<=a.filter;
    if(wp&&!np){pf++; if(a.pub<20)pfU++;} if(!wp&&np){fp++; if(a.pub>20)fpO++;} if(Math.abs(a.pub-b.pub)>1e-9)pubDiff++; if(headwayToTier(a.pub)!==headwayToTier(b.pub))tier++; }
  console.log(c,'flips',fl.size,'disappear',gone,'new',nw,'| stops',n,'pass->fail',pf,'(own-under-20',pfU,') fail->pass',fp,'(over-limit-rule',fpO,') pubChanged',pubDiff,'tierChanged',tier,'| pooledStops',r.pooledN,'within1minOfLimit',r.within1);
}
// whether R[c] rows (pattern 0) for the ranges
const show=(c:string,label:string,a:number,b:number)=>R[c].rows.filter((x:any)=>x.label===label&&x.j>=a&&x.j<=b).map((x:any)=>`${x.j}:${x.refused==null?'-':x.refused?'R':'ok'}${x.longest!=null?'('+(+x.longest).toFixed(1)+'/'+(+x.limit).toFixed(1)+')':''}`).join(' ');
for(const c of ['T0','A1','A2','A3']){ console.log(c,'WB900 P0 33-42:',show(c,'900 WB eve',33,42)); console.log(c,'EB900 P0 42-58:',show(c,'900 EB eve',42,58)); }
// bias
import fs from 'fs';
// validate T0 vs real readAll
import { loadPatterns, readAll, TF } from './realx.ts'; import { cases } from './s1lib.ts';
TF.f=(s:string)=>{const [h,m]=s.split(':').map(Number);return h*60+m;};
const S='/private/tmp/claude-501/-Users-ryan/c8d09263-8b14-4eb3-a210-0831beabea38/scratchpad'; let mism=0,tot=0; for(const [label,dir,sd,route,dirId,date,start,end] of cases){ const L=loadPatterns(S+'/'+dir,S+'/'+sd,route,dirId,date); const {out}=readAll(L,start,end);
  const best=new Map<string,{n:number;pub:number}>(); L.pats.forEach(p=>{ out.get(p.key)!.forEach(r=>{ if(r.pub==null)return; const n=p.deps.get(r.stop)?.length??0; const c=best.get(r.stop); if(!c||n>c.n)best.set(r.stop,{n,pub:r.pub});});});
  for(const [st,b] of best){ tot++; const m=R.T0.stops[`${label}|${st}`]; if(!m||m.pub!==b.pub)mism++; } }
console.log('T0 replica vs real readAll: stops',tot,'mismatch',mism);
