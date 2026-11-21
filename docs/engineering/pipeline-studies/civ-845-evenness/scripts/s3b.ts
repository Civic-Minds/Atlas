import { run, cases } from './s1lib.ts';
cases.splice(0,cases.length);
const add=(l:string,dir:string,sd:string,r:string,d:string,date:string,s:number,e:number,f:number)=>cases.push([l,dir,sd,r,d,date,s,e,f] as any);
for(const d of ['0','1']){ add(`52 d${d} mid Wed`,'ttc5241','ttc','52',d,'2026-10-21',540,900,15); add(`41 d${d} mid Sat`,'ttc5241','ttc','41',d,'2026-10-24',540,900,15); add(`41 d${d} mid Wed`,'ttc5241','ttc','41',d,'2026-10-21',540,900,15);
  add(`900 d${d} mid Wed`,'drt','drt','900',d,'2026-11-18',540,900,15); add(`900 d${d} eve Wed`,'drt','drt','900',d,'2026-11-18',1140,1380,20);}
const R:any={}; for(const m of ['T0','A1','A2','A3']) R[m]=run(m);
const labels=cases.map(c=>c[0]);
for(const l of labels){ const line:string[]=[l]; for(const m of ['T0','A1','A2','A3']){ const st=Object.entries<any>(R[m].stops).filter(([k])=>k.startsWith(l+'|')).map(([,v])=>v); const acc=R[m].acc.all.filter((x:any)=>x.k.startsWith(l+'|')); const pubs=st.map(v=>v.pub); const cnt:any={}; pubs.forEach(p=>cnt[Math.round(p)]=(cnt[Math.round(p)]||0)+1);
  line.push(`${m}: n${st.length} refusedReadings ${acc.filter((x:any)=>x.ref).length}/${acc.length} pubs ${Object.entries(cnt).sort((a:any,b:any)=>b[1]-a[1]).slice(0,4).map(([k,v])=>k+'x'+v).join(',')}`); }
  console.log(line.join(' | ')); }
