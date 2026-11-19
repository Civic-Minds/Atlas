import { run2 } from './step2.ts';
const {R}=run2('T0',false);
const by:any={}; for(const b of R.worseL){by[b.label]=(by[b.label]||0)+1;} console.log('worse by case',JSON.stringify(by));
console.log('delta dist',R.worseL.map((b:any)=>b.x-b.pub).sort((a:number,b:number)=>a-b).join(','));
const hm=(m:number)=>`${Math.floor(m/60)}:${String(Math.floor(m%60)).padStart(2,'0')}`;
const seen=new Set<string>(); let shown=0;
for(const b of R.worseL){ if(seen.has(b.label)||shown>=5) continue; seen.add(b.label); shown++;
  const pool=[...new Set(b.pool.map((e:any)=>e.t))].sort((x:any,y:any)=>x-y) as number[]; const inW=pool.filter(t=>t>=b.start&&t<=b.end);
  const sel=[...new Set(b.sel.map((e:any)=>e.t))].sort((x:any,y:any)=>x-y) as number[];
  const gaps=(a:number[])=>a.slice(1).map((t,i)=>t-a[i]);
  console.log(`\n${b.label} stop ${b.stop} window ${hm(b.start)}-${hm(b.end)} today ${b.pub} -> R ${b.x}  (ownPattern ${b.ownV})`);
  console.log('  today in-window pooled deps :',inW.map(hm).join(' '),'\n   gaps',gaps(inW).join(','));
  console.log('  R selected deps (anchor trips):',sel.map(hm).join(' '),'\n   gaps',gaps(sel).join(','));
  console.log('  full pooled day around window:',pool.filter(t=>t>=b.start-40&&t<=b.end+40).map(hm).join(' '));
}
