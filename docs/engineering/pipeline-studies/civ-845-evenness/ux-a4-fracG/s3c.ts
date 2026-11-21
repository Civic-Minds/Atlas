import { run, cases } from './s1lib.ts';
cases.splice(0,cases.length); cases.push(['52 d1 mid Wed','ttc5241','ttc','52','1','2026-10-21',540,900,15] as any);
for(const m of ['T0','A3','A4']){ const R=run(m); const a=R.acc.all.filter((x:any)=>x.ref); const w=R.acc.all.filter((x:any)=>x.k.includes('')); 
 console.log(m,'refused',a.length); const s=a.slice(0,3); for(const x of s) console.log(' longest',x.l.toFixed(3),'limit',x.lim.toFixed(3),'mean',x.m.toFixed(3),'value',x.v.toFixed(3)); 
 const all=R.acc.all; const mm=all.map((x:any)=>x.m); console.log(' mean range',Math.min(...mm).toFixed(3),Math.max(...mm).toFixed(3),'longest set',[...new Set(all.map((x:any)=>x.l))].join(','));}
