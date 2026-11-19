import { run, cases } from './s6lib.ts';
cases.splice(0,cases.length);
const add=(l:string,dir:string,sd:string,r:string,d:string,date:string,s:number,e:number,f:number)=>cases.push([l,dir,sd,r,d,date,s,e,f] as any);
for(const d of ['0','1']){ add(`52 d${d} mid Wed`,'ttc5241','ttc','52',d,'2026-10-21',540,900,15); add(`41 d${d} mid Sat`,'ttc5241','ttc','41',d,'2026-10-24',540,900,15); add(`41 d${d} mid Wed`,'ttc5241','ttc','41',d,'2026-10-21',540,900,15);
  add(`900 d${d} mid Wed`,'drt','drt','900',d,'2026-11-18',540,900,15); add(`900 d${d} eve Wed`,'drt','drt','900',d,'2026-11-18',1140,1380,20);}
const names=['T0','V1','Va','W155','W150','W149','WM']; const R:any={}; for(const n of names)R[n]=run(n);
const T=R.T0; console.log('pooled readings',T.acc.all.length,'stops',Object.keys(T.stops).length);
for(const n of names.slice(1)){ const ch:string[]=[]; for(const k of Object.keys(T.stops)){const a=T.stops[k],b=R[n].stops[k]; if(b&&Math.abs(a.pub-b.pub)>1e-9)ch.push(k+` ${a.pub}->${b.pub} f${a.filter}`);} const by:any={}; ch.forEach(c=>{const l=c.split('|')[0]; by[l]=(by[l]||0)+1;}); console.log(n,'stops changed',ch.length,JSON.stringify(by)); }
for(const n of ['W155','W150']){ for(const k of Object.keys(T.stops)){const a=T.stops[k],b=R[n].stops[k]; if(b&&Math.abs(a.pub-b.pub)>1e-9&&k.includes('mid'))console.log(n,k,a.pub,'->',b.pub,'longest',a.longest,'lim',a.limit,'vs',b.limit);}}
