import { run, SEQS, cases, gate } from './s6lib.ts';
import { headwayToTier } from '/Users/ryan/Developer/Code/Platforms/Atlas/pipeline/headway-utils.ts';
const names=['T0','V1','W155','W150','W149','WM'];
const R:any={}; const SQ:any={}; for(const n of names){ R[n]=run(n); SQ[n]=SEQS.map(s=>({...s})); }
const T=R.T0;
for(const n of names.slice(1)){ const r=R[n]; const ch:string[]=[]; let dropU20=0; const byLab:Record<string,number>={};
  for(const k of Object.keys(T.stops)){const a=T.stops[k],b=r.stops[k]; if(!b)continue; if(Math.abs(a.pub-b.pub)>1e-9){ ch.push(k+` ${a.pub}->${b.pub} f${a.filter}`); const lab=k.split('|')[0]; byLab[lab]=(byLab[lab]||0)+1; if(a.pub<=a.filter&&b.pub>a.filter&&a.pub<20)dropU20++; }}
  const s=SQ[n].find((x:any)=>x.label==='900 EB eve'&&x.pi===0); const o=[44,53,55,56].map(j=>`${j}:${s.recs[j].g.refused?'R':'pass'}`).join(' ');
  const aT=new Map(T.acc.all.map((x:any)=>[x.k,x])); let fl=0; for(const x of r.acc.all){const y:any=aT.get(x.k); if(y&&y.ref!==x.ref)fl++;}
  console.log(`${n}: stops changed ${ch.length} (pass->over filter ${dropU20}) byCase ${JSON.stringify(byLab)} readingFlips ${fl} Oshawa ${o}`);
  if(n!=='V1') console.log('   '+ch.filter(c=>!c.startsWith('900 EB eve')).join('; '));
}
// 15/15/30 and TTC52 unit-style
const fromGaps=(g:number[])=>g.reduce<number[]>((o,x)=>[...o,o[o.length-1]+x],[540]);
const seq=Array.from({length:12},(_,i)=>i%3===2?30:15);
const gaps52=[...Array.from({length:25},()=>5),10,...Array.from({length:10},()=>4),...Array.from({length:15},()=>5)];
const gaps145=[6,18,6,15,9,15,9,13,11,15,9,10,24,24,24,24];
const even=[6,18,6,15,9,15,9,13,11,15,9,10,22,22,22,22];
for(const [nm,g] of [['15/15/30',seq],['ttc52 10gap',gaps52],['900 mean14.5',gaps145],['even 22s',even]] as any){ const t=fromGaps(g); const line=['T0','V1','W155','W150','W149','WM'].map(v=>{ const r:any=gate(t,[],540,900,'pipe',v==='T0'?'':v); return `${v}:${r?(r.refused?'refused':'pub '+r.value):'null'}`}); console.log(nm,line.join(' ')); }
