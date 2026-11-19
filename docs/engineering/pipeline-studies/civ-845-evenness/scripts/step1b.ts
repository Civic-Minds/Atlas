import { run } from './step1.ts';
const R:any={}; for(const c of ['T0','A1','A2','B']) R[c]=run(c);
const idx=(c:string)=>new Map<string,any>(R[c].acc.all.map((x:any)=>[x.k,x]));
const T=idx('T0'),A1=idx('A1'),A2=idx('A2'),B=idx('B');
for(const c of ['T0','A1','A2','B']){ const a=R[c].acc.all; console.log(c,'pooled stop-readings',a.length,'refused',a.filter((x:any)=>x.ref).length,'mean longest',(a.reduce((s:number,x:any)=>s+x.l,0)/a.length).toFixed(3),'mean limit',(a.reduce((s:number,x:any)=>s+x.lim,0)/a.length).toFixed(3),'mean value',(a.reduce((s:number,x:any)=>s+x.v,0)/a.length).toFixed(3)); }
const d=(X:Map<string,any>,f:(t:any,x:any)=>number)=>{let s=0,n=0,pos=0,neg=0;for(const [k,t] of T){const x=X.get(k);if(!x)continue;const v=f(t,x);s+=v;n++;if(v>1e-9)pos++;if(v<-1e-9)neg++;}return `n${n} mean ${(s/n).toFixed(3)} T0-longer ${pos} T0-shorter ${neg}`;};
console.log('longest gap, T0 minus seconds:',d(A2,(t,x)=>t.l-x.l));
console.log('mean gap, T0 minus seconds:',d(A2,(t,x)=>t.m-x.m));
console.log('limit, T0 minus A2(frac):',d(A2,(t,x)=>t.lim-x.lim));
console.log('limit, T0 minus A1(int value):',d(A1,(t,x)=>t.lim-x.lim));
// status transitions T0 -> each mode over all pooled readings
for(const [n,X] of [['A1',A1],['A2',A2],['B',B]] as any){ let pf=0,fp=0,same=0; for(const [k,t] of T){const x=X.get(k); if(!x)continue; if(!t.ref&&x.ref)pf++; else if(t.ref&&!x.ref)fp++; else same++;} console.log(n,'all pooled readings: pass->refuse',pf,'refuse->pass',fp,'unchanged',same); }
// A1 vs A2: effect of integer rounding only
let a1ref_a2pass=0,a1pass_a2ref=0; const ex:string[]=[];
for(const [k,x] of A1){const y=A2.get(k); if(!y)continue; if(x.ref&&!y.ref)a1ref_a2pass++; if(!x.ref&&y.ref){a1pass_a2ref++; if(ex.length<6)ex.push(`${k.split('|').pop()} ${k.split('|')[0]} mean ${y.m.toFixed(2)} intValue ${x.v} limit ${x.lim.toFixed(1)} | frac value ${y.v.toFixed(2)} limit ${y.lim.toFixed(2)} longest ${y.l.toFixed(2)}`);}}
console.log('seconds kept, integer value/mean (A1) vs fully fractional (A2): A1 refuse & A2 pass',a1ref_a2pass,'A1 pass & A2 refuse',a1pass_a2ref); console.log(ex.join('\n'));
// the EB mean 14.5 tip: stops whose mean fractional part in [.4,.6]
const tip=[...A2.values()].filter(y=>{const f=y.m%1;return f>=0.4&&f<=0.6;}).length; console.log('pooled readings with mean within .4-.6 of a minute (rounding tips value by 1 = limit by 1.6):',tip,'/',A2.size);
// flips lists
const show=(c:string)=>Object.values(R[c].flips).map((f:any)=>`${f.k} long ${f.l.map((x:number)=>x.toFixed(1))} lim ${f.lim.map((x:number)=>x.toFixed(1))}`).join('\n');
console.log('--- A1 flips\n'+show('A1')); console.log('--- A2 flips\n'+show('A2'));
// flips disappear/new for A1 by keys
const k0=new Set(Object.keys(R.T0.flips)); for(const c of ['A1','A2','B']){ const k=new Set(Object.keys(R[c].flips)); console.log(c,'new:',[...k].filter(x=>!k0.has(x)).join(' ; ')); }
// stops within 1 min of limit with |longest-limit|<=1 : fraction
// sum on the 18 flips: how many were 'cause b'(same trips) - from earlier
