import { run } from './s1lib.ts'; import { headwayToTier } from '/Users/ryan/Developer/Code/Platforms/Atlas/pipeline/headway-utils.ts';
const r=run('T0'); const by=new Map<string,any[]>(); for(const [k,v] of Object.entries<any>(r.stops)){ if(!v.sk)continue; (by.get(v.sk)??[]).push({k,...v}); by.set(v.sk,by.get(v.sk)??[]); by.get(v.sk)!.push; }
const g=new Map<string,any[]>(); for(const [k,v] of Object.entries<any>(r.stops)){ if(!v.sk)continue; const a=g.get(v.sk)??[]; a.push({k,...v}); g.set(v.sk,a); }
const med=(a:number[])=>{const s=[...a].sort((x,y)=>x-y);const m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2;};
let refusedStops=0,chPF=0,chFP=0,chTier=0,noRef=0; const changed:any[]=[]; const passNb:any[]=[]; const perCase:any={};
for(const [sk,rows] of g){ const ok=rows.filter(x=>x.refused===false), rf=rows.filter(x=>x.refused===true); refusedStops+=rf.length; if(!rf.length)continue; if(!ok.length){noRef+=rf.length;continue;}
  const sv=med(ok.map(x=>x.value)); for(const x of rf){ const f=x.filter; const was=x.pub<=f, now=sv<=f; const t=headwayToTier(x.pub)!==headwayToTier(sv);
    if(was&&!now)chPF++; if(!was&&now)chFP++; if(t){chTier++; changed.push({...x,sv,sk});} const c=perCase[x.label]??={ref:0,tier:0,pf:0,fp:0}; c.ref++; if(t)c.tier++; if(was&&!now)c.pf++; if(!was&&now)c.fp++; }
  for(const x of ok) passNb.push({...x,sv}); }
console.log('stops in stretches with >=1 refused & >=1 passing stop: refused stops',refusedStops-noRef,'(refused in all-refused stretches, unchanged:',noRef,')');
console.log('colour (tier) would change',chTier,'| pass->fail',chPF,'| fail->pass',chFP); console.log(JSON.stringify(perCase));
const d=(a:number[])=>`n${a.length} min ${Math.min(...a)} med ${med(a)} max ${Math.max(...a)}`;
const ch=changed; console.log('changed stops: own longest wait',d(ch.map(x=>x.longest)),'| today pub',d(ch.map(x=>x.pub)),'| stretch value (becomes)',d(ch.map(x=>x.sv)));
const nb=passNb.filter(x=>x.sv<=x.filter); console.log('passing neighbours in those stretches (all stretches with a refused stop):',nb.length,'| their longest wait',d(nb.map(x=>x.longest)),'| their value',d(nb.map(x=>x.value)),'| with longest>=20:',nb.filter(x=>x.longest>=20).length,'| longest>=1.5x value:',nb.filter(x=>x.longest>=1.5*x.value).length);
const byLab:any={}; for(const x of nb){const k=x.label; (byLab[k]??=[]).push(x);} for(const [k,a] of Object.entries<any>(byLab)) console.log('  ',k,'passing nbrs',a.length,'value',d(a.map((x:any)=>x.value)),'longest',d(a.map((x:any)=>x.longest)));
const chl:any={}; for(const x of ch){(chl[x.label]??=[]).push(x);} for(const [k,a] of Object.entries<any>(chl)) console.log('  changed',k,a.length,'longest',d(a.map((x:any)=>x.longest)),'pub',d(a.map((x:any)=>x.pub)),'-> value',d(a.map((x:any)=>x.sv)));
