import { loadPatterns, readAll } from './real.ts';
import { collapseBunched } from '/Users/ryan/Developer/Code/Platforms/Atlas/pipeline/stopPools.ts';
const S='/private/tmp/claude-501/-Users-ryan/c8d09263-8b14-4eb3-a210-0831beabea38/scratchpad';
const L = loadPatterns(S+'/drt',S+'/drt','900','1','2026-11-18');
const {out}=readAll(L,1140,1380);
const [a,b]=L.pats;
for (const i of [0,10,20,30,33,34,38,42,43]) {
  const st=a.order[i];
  const w=(p:any)=> (p.deps.get(st)??[]).filter((t:number)=>t>=1140&&t<=1380).sort((x:number,y:number)=>x-y);
  const r=out.get(a.key)![i];
  const m=[...w(a),...w(b)].sort((x,y)=>x-y); const c=collapseBunched(m);
  console.log(i,st,'sharers',r.sharers.length,'A',w(a).join(','),'| B',w(b).join(','),'| value',r.value,'worst',r.worst,'own',r.own, 'gaps',c.slice(1).map((t,k)=>t-c[k]).join(','));
}
console.log(JSON.stringify(a.order.slice(0,43))===JSON.stringify(b.order.slice(0,43)));
