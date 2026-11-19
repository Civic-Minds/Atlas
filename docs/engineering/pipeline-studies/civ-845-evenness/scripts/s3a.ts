import { run } from './s1lib.ts';
const T=run('T0'), A=run('A2'), A3=run('A3');
const ix=(r:any)=>{const m=new Map<string,any[]>(); for(const x of r.acc.all){const p=x.k.split('|'); const k=p[0]+'|'+p[p.length-1]; {const a=m.get(k)??[]; a.push(x); m.set(k,a);}} return m;};
const iA=ix(A), iT=ix(T);
const rows:any[]=[];
for(const [k,a] of Object.entries<any>(T.stops)){ const b=(A.stops as any)[k]; if(!b)continue; if(a.pub<=a.filter&&!(b.pub<=a.filter)){
  const xs=(iA.get(k)??[]).filter(x=>x.ref).sort((p,q)=>q.l-p.l); const x=xs[0]; const t=(iT.get(k)??[])[0];
  rows.push({k,filter:a.filter,todayPub:a.pub,a2pub:b.pub,ownV:b.ownV,L:x?.l,lim:x?.lim,m:x?.m,mean:x?.m,v:x?.v,Lt:t?.l,limT:t?.lim,gaps:x?.gaps.map((g:number)=>+g.toFixed(2))}); } }
console.log(rows.length);
for(const r of rows) console.log(JSON.stringify({k:r.k,pubT:r.todayPub,pubA2:r.a2pub,ownV:r.ownV&&+r.ownV.toFixed(2),A2longest:+r.L?.toFixed(2),A2limit:+r.lim?.toFixed(2),T0longest:r.Lt,T0limit:+r.limT?.toFixed(2),margin:+(r.L-r.lim).toFixed(2),gaps:r.gaps?.join(',')}));
