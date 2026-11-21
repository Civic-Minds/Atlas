import { loadPatterns, readAll } from './real.ts';
import { buildPooledStopMap, collapseBunched } from '/Users/ryan/Developer/Code/Platforms/Atlas/pipeline/stopPools.ts';
import { medianHeadwayInWindow, departuresInWindow, headwayToTier } from '/Users/ryan/Developer/Code/Platforms/Atlas/pipeline/headway-utils.ts';
const S='/private/tmp/claude-501/-Users-ryan/c8d09263-8b14-4eb3-a210-0831beabea38/scratchpad';
function gate(times:number[], start:number,end:number, own:number[]) {
  const w = collapseBunched(departuresInWindow(times,start,end,true));
  if (w.length<3) return null;
  const typical = medianHeadwayInWindow(w,start,end,3,true); if (typical==null) return null;
  const mean=(w[w.length-1]-w[0])/(w.length-1); let longest=0; for(let i=1;i<w.length;i++) longest=Math.max(longest,w[i]-w[i-1]);
  const os=departuresInWindow(own,start,end,true);
  const ov= os.length>=3? medianHeadwayInWindow(os,start,end,3,true):null;
  const floored=Math.max(typical,Math.round(mean)); const value= ov!=null?Math.min(floored,ov):floored;
  const l1=Math.max(1.75*mean,Math.round(mean)+5), l2=Math.max(1.6*value,value+5); const limit=Math.min(l1,l2);
  return { value, longest, limit, l1, refused: longest>l1||longest>l2 };
}
const cases:[string,string,string,string,string,string,number,number,number][]=[
 ['900 EB eve','drt','drt','900','0','2026-11-18',1140,1380,20],['900 WB eve','drt','drt','900','1','2026-11-18',1140,1380,20],
 ['901 N AM','drt','drt','901','0','2026-11-18',360,540,20],['901 S AM','drt','drt','901','1','2026-11-18',360,540,20],
 ['901 N eve','drt','drt','901','0','2026-11-18',1140,1380,20],['901 S eve','drt','drt','901','1','2026-11-18',1140,1380,20],
 ['102 N eve','ttc102','ttc','102','1','2026-10-21',1140,1380,20],['102 S eve','ttc102','ttc','102','0','2026-10-21',1140,1380,20],
 ['102 N mid','ttc102','ttc','102','1','2026-10-21',540,900,15],['102 S mid','ttc102','ttc','102','0','2026-10-21',540,900,15],
 ['102 N am','ttc102','ttc','102','1','2026-10-21',360,540,15],['102 S am','ttc102','ttc','102','0','2026-10-21',360,540,15]];
const VARS=['C','F','D10','E','Gup','Gboth','L'] as const;
const med=(a:number[])=>{if(!a.length)return NaN;const s=[...a].sort((x,y)=>x-y);const m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2;};
const T:any={}; for(const v of VARS) T[v]={one:0,pf:0,pfU20:0,fp:0,fpOver:0,tier:0,chg:0,ex:[] as number[],nbEx:[] as number[],ebRuns:[] as number[],wb:'',touch2:0,eTouched:0,gTouched:0,vRevert:0,endBlipsSkipped:0};
let stretches=0,base1=0;
const key=(x:number,f:number)=>headwayToTier(x)+'|'+(x<=f);
// G blip fill over values vals aligned with idx (stretch positions). Worse neighbour used. Returns touched positions.
function applyG(vals:number[],gs:any[],filter:number,N:number,M:number,mode:'up'|'both'){
  const runs:{k:string,s:number,e:number}[]=[];
  vals.forEach((x,q)=>{const k=key(x,filter); if(runs.length&&runs[runs.length-1].k===k) runs[runs.length-1].e=q; else runs.push({k,s:q,e:q});});
  const out=[...vals]; const touched=new Set<number>();
  for(let r=1;r<runs.length-1;r++){const b=runs[r],pv=runs[r-1],nx=runs[r+1]; if(pv.k!==nx.k||b.k===pv.k) continue;
    if(b.e-b.s+1>N) continue; const nval=Math.max(vals[pv.e],vals[nx.s]); const bval=Math.max(...vals.slice(b.s,b.e+1)); const up=nval<bval;
    if(!up&&mode==='up') continue;
    if(up){let ok=true; for(let q=b.s;q<=b.e;q++){const g=gs[q]; if(!g||(g.refused&&g.longest>g.limit*(1+M))) ok=false;} if(!ok) continue;}
    for(let q=b.s;q<=b.e;q++){out[q]=nval;touched.add(q);} }
  return {out,touched};
}
const GN=2,GM=0.10;
for (const [label,dir,sd,route,dirId,date,start,end,filter] of cases) {
  const L=loadPatterns(S+'/'+dir,S+'/'+sd,route,dirId,date); const {out,sharers}=readAll(L,start,end);
  const depsOf=new Map(L.pats.map(p=>[p.key,p.deps]));
  const best=new Map<string,any>();
  L.pats.forEach((p,pi)=>{
    const rs=out.get(p.key)!; const pooled=buildPooledStopMap(p.deps,sharers.get(p.key),k=>depsOf.get(k),L.parent,p.deps);
    const info=rs.map(r=>{ const own=[...(p.deps.get(r.stop)??[])].sort((a,b)=>a-b);
      const times=[...(pooled.map.get(r.stop)??own)].sort((a,b)=>a-b);
      const g=r.pooled?gate(times,start,end,own):null;
      const ow=departuresInWindow(own,start,end,true); let ol=0; for(let i=1;i<ow.length;i++) ol=Math.max(ol,ow[i]-ow[i-1]);
      return {g,ol}; });
    const sig=rs.map(r=>r.pooled?[...r.sharers].sort().join('+'):'');
    const nv:any={}; const sid:number[]=rs.map(()=>-1); const tch:any={}; for(const v of VARS){nv[v]=rs.map(r=>r.pub); tch[v]=rs.map(()=>({E:0,G:0,V:0}));}
    let a=0;
    for(let i=1;i<=rs.length;i++) if(i===rs.length||sig[i]!==sig[a]){
      if(sig[a]!==''){
        const idx:number[]=[];for(let j=a;j<i;j++) if(rs[j].pub!=null) idx.push(j);
        if(idx.length>=2){
          stretches++; const pubs=idx.map(j=>rs[j].pub!); idx.forEach(j=>sid[j]=a);
          if(new Set(pubs.map(x=>x<=filter)).size===1) base1++;
          const bestV=Math.min(...pubs), mdn=med(pubs); const gs=idx.map(j=>info[j].g);
          idx.forEach((j,q)=>{ nv.C[j]=Math.min(pubs[q],bestV); nv.F[j]=Math.min(pubs[q],mdn);
            const g=gs[q]; if(g&&g.refused&&g.longest<=g.limit*1.10) nv.D10[j]=g.value; });
          // E
          const fj=idx.reduce((b,j)=>rs[j].n>rs[b].n?j:b,idx[0]); const fg=info[fj].g; const pass=fg!=null&&!fg.refused;
          const eVals=pubs.map((x,q)=>{const g=gs[q]; return pass&&g?Math.min(x,g.value):x;});
          idx.forEach((j,q)=>{nv.E[j]=eVals[q]; if(eVals[q]!==pubs[q]) {tch.E[j].E=1;tch.L[j].E=1;}});
          // G alone (on pubs)
          for(const [v,mode] of [['Gup','up'],['Gboth','both']] as const){ const r=applyG(pubs,gs,filter,GN,GM,mode); idx.forEach((j,q)=>{nv[v][j]=r.out[q]; if(r.touched.has(q)) tch[v][j].G=1;}); }
          // L: E -> G(up) -> V0 end handling
          const r2=applyG(eVals,gs,filter,GN,GM,'up'); const lv=[...r2.out];
          idx.forEach((j,q)=>{nv.L[j]=lv[q]; if(r2.touched.has(q)) tch.L[j].G=1;});
          // V0: end stop (first/last) whose own published tier is worse than its neighbour's layered value: keep own pub (display-only own piece)
          for(const q of [0,idx.length-1]){ const nb=q===0?1:idx.length-2; const j=idx[q];
            if(headwayToTier(pubs[q])!==headwayToTier(lv[nb]) && pubs[q]>lv[nb] && nv.L[j]!==pubs[q]){ nv.L[j]=pubs[q]; tch.L[j].V=1; T.L.vRevert++; } }
          // end blips count in G
          for(const v of VARS){ const ns=idx.map(j=>nv[v][j]!); if(new Set(ns.map(x=>x<=filter)).size===1) T[v].one++; }
        }
      }
      a=i;
    }
    rs.forEach((r,j)=>{ if(r.pub==null) return; const n=p.deps.get(r.stop)?.length??0; const cur=best.get(r.stop);
      if(!cur||n>cur.n){ const o:any={}; const t:any={}; for(const v of VARS){o[v]=nv[v][j];t[v]=tch[v][j];} best.set(r.stop,{n,pub:r.pub,nv:o,t,ol:info[j].ol,g:info[j].g,sid:`${label}|${pi}|${sid[j]}`}); }});
    if(label==='900 EB eve'||label==='900 WB eve'){
      const row=(arr:(number|null)[])=>{ let runs=1; for(let j=1;j<arr.length;j++){ const x=arr[j-1],y=arr[j]; if(x==null||y==null) continue; if((x<=filter)!==(y<=filter)) runs++; } return runs; };
      for(const v of VARS){ if(label==='900 EB eve') T[v].ebRuns.push(row(nv[v])); else if(pi===0) T[v].wb=nv[v].slice(34,43).join(','); } }
  });
  // excess scoring per stretch id
  const passEx=new Map<string,number[]>();
  for(const e of best.values()){ if(e.g&&e.pub<=filter&&e.sid.slice(-2)!=='|-1'){ const lim=Math.min(e.g.l1,Math.max(1.6*e.pub,e.pub+5)); const k=e.sid; (passEx.get(k)??passEx.set(k,[]).get(k)!).push(e.ol-lim);} }
  for(const e of best.values()) for(const v of VARS){ const x=e.nv[v],R=T[v]; if(x==null)continue; const w=e.pub<=filter,n=x<=filter;
    if(w&&!n){R.pf++; if(e.pub<20)R.pfU20++;}
    if(!w&&n){R.fp++; if(e.ol>20)R.fpOver++; if(e.g){const lim=Math.min(e.g.l1,Math.max(1.6*x,x+5)); R.ex.push(e.ol-lim); R.nbEx.push(...(passEx.get(e.sid)??[]));}}
    if(headwayToTier(x)!==headwayToTier(e.pub)) R.tier++; if(x!==e.pub) R.chg++;
    const t=e.t[v]; if(t.E) R.eTouched++; if(t.G) R.gTouched++; if(t.E+t.G+t.V>=2) R.touch2++; }
}
console.log('stretches',stretches,'base one-colour',base1);
const f=(a:number[])=>a.length?`n${a.length} med ${med(a).toFixed(1)} max ${Math.max(...a).toFixed(1)}`:'n0';
for(const v of VARS){const R=T[v]; console.log(v,'one',R.one,'pf',R.pf,`(${R.pfU20}<20)`,'fp',R.fp,`(ol>20: ${R.fpOver})`,'tier',R.tier,'chg',R.chg,'EBruns',R.ebRuns.join('/'),'WB',R.wb,'| newPasser excess',f(R.ex),'| their already-passing neighbours excess',f(R.nbEx),'| Etouched',R.eTouched,'Gtouched',R.gTouched,'twoLayers',R.touch2, v==='L'?`V0reverts ${R.vRevert}`:'');}
