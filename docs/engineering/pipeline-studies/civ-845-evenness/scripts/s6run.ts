import { run, SEQS } from './s6lib.ts';
import { headwayToTier } from '/Users/ryan/Developer/Code/Platforms/Atlas/pipeline/headway-utils.ts';
const names=['T0','V1','Va','Va2','Vc','Vb'];
const R:any={}; const SQ:any={};
for(const n of names){ R[n]=run(n); SQ[n]=SEQS.map(s=>({...s})); }
const T=R.T0;
const keyOf=(k:string)=>k;
for(const n of names.slice(1)){
  const r=R[n]; const ch:string[]=[]; let readingFlips=0, tot=0, f46=0;
  for(const k of Object.keys(T.stops)){const a=T.stops[k],b=r.stops[k]; if(!b)continue; if(Math.abs(a.pub-b.pub)>1e-9) ch.push(`${k} ${a.pub}->${b.pub} (filter ${a.filter})`);}
  // reading-level
  const aT=new Map(T.acc.all.map((x:any)=>[x.k,x])); for(const x of r.acc.all){const y:any=aT.get(x.k); tot++; if(y&&y.ref!==x.ref) readingFlips++;}
  // oshawa
  const s=SQ[n].find((x:any)=>x.label==='900 EB eve'&&x.pi===0); const o=[44,53,55,56].map(j=>`${j}:${s.recs[j].g.refused?'refused':'pass'}`).join(' ');
  console.log(`\n== ${n}: stops changed ${ch.length}; reading flips ${readingFlips}/${tot}; Oshawa ${o}`); ch.forEach(c=>console.log('  ',c));
}
// reading-level stats under T0
let n451=0, diffRead=0, newRef=0, maxd=0, tot=0, frac46=0;
for(const x of T.acc.all){ tot++; const g=x.g; const f=g.mean-Math.floor(g.mean); const inb=f>=0.4&&f<=0.6; if(inb) n451++; if(Math.abs(g.l2e-g.l2r)>1e-9) diffRead++; maxd=Math.max(maxd,g.l2r-g.l2e); if(!g.refused && g.longest>g.l2e+1e-9 && g.longest>= 0 && Math.min(Math.max(1.75*g.mean,g.mr+5),g.l2e)<g.longest) newRef++; if(inb&&Math.abs(g.l2e-g.l2r)>1e-9)frac46++; }
console.log('\nT0 readings',tot,'frac0.4-0.6',n451,'l2 differs',diffRead,'differs & frac in band',frac46,'newly refused readings (T0 pass -> unrounded fail)',newRef,'max l2 shift',maxd.toFixed(2));
import fs from 'fs'; fs.writeFileSync('s6_T0acc.json',JSON.stringify(T.acc.all.map((x:any)=>({k:x.k,same:x.same,ref:x.ref,...x.g,gaps:undefined}))));
