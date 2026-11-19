import { csv, loadPatterns, TF } from './realx.ts';
export const COORDS:Map<string,{lat:number;lon:number}>=new Map();
import { computeStopSharers, buildPooledStopMap, collapseBunched } from '/Users/ryan/Developer/Code/Platforms/Atlas/.claude/worktrees/agent-a92708b45d34993ae/pipeline/stopPools.ts';
import { pooledReadingInWindow } from '/Users/ryan/Developer/Code/Platforms/Atlas/.claude/worktrees/agent-a92708b45d34993ae/pipeline/stopPools.ts';
import { medianHeadwayInWindow, typicalOfGaps, headwayToTier } from '/Users/ryan/Developer/Code/Platforms/Atlas/pipeline/headway-utils.ts';
const S='/private/tmp/claude-501/-Users-ryan/c8d09263-8b14-4eb3-a210-0831beabea38/scratchpad';
const hms=(s:string)=>{const [h,m,x]=s.split(':').map(Number);return {h,m,x:x||0};};
const TFS:Record<string,(s:string)=>number>={
  floor:s=>{const t=hms(s);return t.h*60+t.m;},
  sec:s=>{const t=hms(s);return t.h*60+t.m+t.x/60;},
  round:s=>{const t=hms(s);return t.h*60+t.m+(t.x>=30?1:0);}};
type Cfg={tf:string;gm:'pipe'|'frac'|'real';v?:string};
const CFG:Record<string,Cfg>={T0:{tf:'floor',gm:'pipe'},A1:{tf:'sec',gm:'pipe'},A2:{tf:'sec',gm:'frac'},B:{tf:'round',gm:'pipe'},A3:{tf:'floor',gm:'frac'},R:{tf:'floor',gm:'real'},V1:{tf:'floor',gm:'pipe',v:'V1'},Va:{tf:'floor',gm:'pipe',v:'Va'},Va2:{tf:'floor',gm:'pipe',v:'Va2'},Vc:{tf:'floor',gm:'pipe',v:'Vc'},Vb:{tf:'floor',gm:'pipe',v:'Vb'},W155:{tf:'floor',gm:'pipe',v:'W155'},W150:{tf:'floor',gm:'pipe',v:'W150'},W149:{tf:'floor',gm:'pipe',v:'W149'},WM:{tf:'floor',gm:'pipe',v:'WM'}};
export let CURV='';export let SAMEHS=false;export const setSame=(b:boolean)=>{SAMEHS=b;};
const medOf=(g:number[])=>{const s=[...g].sort((a,b)=>a-b);const m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2;};
function ownVal(own:number[],start:number,end:number,gm:string){
  const t=[...new Set(own)].filter(x=>x>=start&&x<=end).sort((a,b)=>a-b); if(t.length<3) return null;
  if(gm==='pipe'||gm==='real') return medianHeadwayInWindow(t,start,end,3,true);
  const g=[];for(let i=1;i<t.length;i++)g.push(t[i]-t[i-1]); return typicalOfGaps(g);
}
export function gate(pool:number[],own:number[],start:number,end:number,gm:string,v:string=''){
  if(gm==='real'){ const w0=collapseBunched([...new Set(pool)].filter(x=>x>=start&&x<=end).sort((a,b)=>a-b)); if(w0.length<3) return null;
    const r=pooledReadingInWindow(pool,start,end,3,false,own); const gp=[];for(let i=1;i<w0.length;i++)gp.push(w0[i]-w0[i-1]);
    return {value:r.value??0,longest:Math.max(...gp),limit:r.value==null?0:1e9,refused:r.value==null,n:w0.length,ov:null,mean:(w0[w0.length-1]-w0[0])/(w0.length-1),gaps:gp}; }
  const w=collapseBunched([...new Set(pool)].filter(x=>x>=start&&x<=end).sort((a,b)=>a-b)); if(w.length<3) return null;
  const gaps=[];for(let i=1;i<w.length;i++)gaps.push(w[i]-w[i-1]);
  const typical=gm==='pipe'?medianHeadwayInWindow(w,start,end,3,true)!:typicalOfGaps(gaps);
  const mean=(w[w.length-1]-w[0])/(w.length-1); const longest=Math.max(...gaps);
  const ov=ownVal(own,start,end,gm);
  const mr=gm==='pipe'?Math.round(mean):mean;
  const floored=Math.max(typical,mr); const value=ov!=null?Math.min(floored,ov):floored;
  const l1=Math.max(1.75*mean,mr+5); let l2=Math.max(1.6*value,value+5);
  // exact (unrounded) value as in the CIV-1957 change
  const exOf=(l:number[])=>{const g=[];for(let i=1;i<l.length;i++)g.push(l[i]-l[i-1]);return typicalOfGaps(g);};
  const ownT=[...new Set(own)].filter(x=>x>=start&&x<=end).sort((a,b)=>a-b);
  const exF=Math.max(exOf(w),mean); const exV=ownT.length>=3?Math.min(exF,exOf(ownT)):exF;
  const l2e=Math.max(1.6*exV,value+5);
  const frac=mean-Math.floor(mean);
  let use=false;
  if(v==='V1') use=true;
  if(v==='Va') use=frac>=0.4&&frac<=0.6;
  if(v==='Va2') use=frac>=0.3&&frac<=0.7;
  if(v==='Vc') use=SAMEHS;
  if(v==='Vb') use=(longest<=l2+1); // vacuous by construction, kept to count
  if(use) l2=l2e;
  if(v==='W155') l2=Math.max(1.55*exV,value+5);
  if(v==='W150') l2=Math.max(1.5*exV,value+5);
  if(v==='W149') l2=Math.max(1.49*exV,value+5);
  if(v==='WM') l2=Math.max(1.6*mean,value+5);
  const limit=Math.min(l1,l2);
  return {value,longest,limit,refused:longest>l1||longest>l2,n:w.length,ov,mean,gaps,l2r:Math.max(1.6*value,value+5),l2e,exV,frac,typical,mr};
}
export const cases:[string,string,string,string,string,string,number,number,number][]=[
 ['900 EB eve','drt','drt','900','0','2026-11-18',1140,1380,20],['900 WB eve','drt','drt','900','1','2026-11-18',1140,1380,20],
 ['901 N AM','drt','drt','901','0','2026-11-18',360,540,20],['901 S AM','drt','drt','901','1','2026-11-18',360,540,20],
 ['901 N eve','drt','drt','901','0','2026-11-18',1140,1380,20],['901 S eve','drt','drt','901','1','2026-11-18',1140,1380,20],
 ['102 N eve','ttc102','ttc','102','1','2026-10-21',1140,1380,20],['102 S eve','ttc102','ttc','102','0','2026-10-21',1140,1380,20],
 ['102 N mid','ttc102','ttc','102','1','2026-10-21',540,900,15],['102 S mid','ttc102','ttc','102','0','2026-10-21',540,900,15],
 ['102 N am','ttc102','ttc','102','1','2026-10-21',360,540,15],['102 S am','ttc102','ttc','102','0','2026-10-21',360,540,15]];

export let SEQS:any[]=[];
export function run(cfgName:string){
  SEQS=[];
  const cfg=CFG[cfgName]; TF.f=TFS[cfg.tf];
  const stops:Record<string,any>={}; const flips:Record<string,any>={}; const rows:any[]=[]; let pooledN=0, within1=0; const acc:any={ref:0,sl:0,ss:0,sm:0,sv:0,sx:0,all:[] as any[]};
  for(const [label,dir,sd,route,dirId,date,start,end,filter] of cases){
    const L=loadPatterns(S+'/'+dir,S+'/'+sd,route,dirId,date);
    for(const [k,v] of L.stops) COORDS.set(label+'|'+k,v);
    const sp=L.pats.map(p=>({memberKey:p.key,routeId:p.key.split('|')[0],headsigns:[...p.headsigns].sort(),stopOrder:p.order}));
    const sharers=computeStopSharers(sp,L.stops,L.parent); const depsOf=new Map(L.pats.map(p=>[p.key,p.deps]));
    const best=new Map<string,{n:number;rec:any}>();
    L.pats.forEach((p,pi)=>{
      const pooled=buildPooledStopMap(p.deps,sharers.get(p.key),k=>depsOf.get(k),L.parent,p.deps);
      let sk0=0; const recs:any[]=p.order.map(stop=>{
        const own=[...(p.deps.get(stop)??[])].sort((a,b)=>a-b); const isP=pooled.pooledStops.has(stop);
        const pool=pooled.map.get(stop)??own; const ownV=ownVal(own,start,end,cfg.gm);
        SAMEHS=false; if(isP){const shs=[...(sharers.get(p.key)?.get(L.parent.get(stop)??stop)??[])]; const mine=[...p.headsigns].sort().join('|'); SAMEHS=shs.some((k:any)=>{const q=L.pats.find(x=>x.key===k); return q&&[...q.headsigns].sort().join('|')===mine;});}
        const g=isP?gate(pool,own,start,end,cfg.gm,cfg.v||''):null;
        let pub:number|null; if(isP){ pub=(g&&!g.refused?g.value:null)??ownV??(g&&g.refused?g.longest:null); } else pub=ownV;
        const sh=[...(sharers.get(p.key)?.get(L.parent.get(stop)??stop)??[])].sort().join('+');
        return {stop,isP,g,ownV,pub,sig:isP?sh:'',own};
      });
      SEQS.push({label,pi,filter,recs});
      // flips
      let a=0; const sig=recs.map(r=>r.sig);
      { let b0=0; for(let i=1;i<=recs.length;i++) if(i===recs.length||sig[i]!==sig[b0]){ for(let j=b0;j<i;j++) recs[j].sk=`${label}|${pi}|${b0}`; b0=i; } }
      for(let i=1;i<=recs.length;i++) if(i===recs.length||sig[i]!==sig[a]){
        if(sig[a]!=='') for(let j=a+1;j<i;j++){ const g0=recs[j-1].g,g1=recs[j].g; if(!g0||!g1)continue; if(g0.refused===g1.refused)continue;
          const k=`${label}|${recs[j-1].stop}->${recs[j].stop}`; flips[k]={label,pi,j,k,m0:g0.longest-g0.limit,m1:g1.longest-g1.limit,l:[g0.longest,g1.longest],lim:[g0.limit,g1.limit]}; }
        a=i; }
      recs.forEach((r,j)=>{ if(r.g){ acc.all.push({k:`${label}|${p.key}|${r.stop}`,g:r.g,same:SAMEHS,ref:r.g.refused,l:r.g.longest,lim:r.g.limit,v:r.g.value,m:r.g.mean,gaps:r.g.gaps}); pooledN++; if(Math.abs(r.g.longest-r.g.limit)<=1) within1++;}
        if(r.pub==null)return; const n=p.deps.get(r.stop)?.length??0; const cur=best.get(r.stop);
        if(!cur||n>cur.n) best.set(r.stop,{n,rec:{sk:(r as any).sk,label,pub:r.pub,filter,ownV:r.ownV,refused:r.g?.refused??null,longest:r.g?.longest??null,limit:r.g?.limit??null,value:r.g?.value??null}});
        if(pi===0) rows.push({label,j,stop:r.stop,refused:r.g?r.g.refused:null,longest:r.g?.longest,limit:r.g?.limit,value:r.g?.value,pub:r.pub}); });
    });
    for(const [st,b] of best) stops[`${label}|${st}`]=b.rec;
  }
  return {stops,flips,rows,pooledN,within1,acc,seqs:SEQS,coords:null};
}
