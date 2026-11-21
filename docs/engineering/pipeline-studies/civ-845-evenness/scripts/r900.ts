import { loadPatterns, readAll } from './real.ts';
const S='/private/tmp/claude-501/-Users-ryan/c8d09263-8b14-4eb3-a210-0831beabea38/scratchpad';
for (const d of ['1','0']) {
  const L = loadPatterns(S+'/drt',S+'/drt','900',d,'2026-11-18');
  console.log('=== dir',d); L.pats.forEach((p,i)=>console.log('P'+i,p.key,p.headsigns,'trips',p.ntrips,'stops',p.order.length));
  const {out}=readAll(L,1140,1380);
  L.pats.forEach((p,i)=>{ console.log('\nP'+i,p.headsigns.join('/'),'pub:',out.get(p.key)!.map((r,j)=>`${j}:${r.pub??'-'}${r.pooled?'p':''}${r.value==null&&r.pooled?'*':''}`).join(' ')); });
}
