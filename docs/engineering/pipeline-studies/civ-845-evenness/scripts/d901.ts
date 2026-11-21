import { analyse } from './analyse.ts';
const S='/private/tmp/claude-501/-Users-ryan/c8d09263-8b14-4eb3-a210-0831beabea38/scratchpad';
for (const d of ['0','1']) { const r = analyse('DRT 901 dir'+d+' AM peak', S+'/drt','901',d,'2026-11-18',360,540,20,undefined,false);
  const i = r.lists.findIndex(l=>l.stopId==='691'); if(i>=0){const m=r.ms[i]; console.log('>>> stop 691 idx',i,'n',m.n,'pub',m.pooled??m.pooledWorst,'worst',m.worst,'avg',m.avg?.toFixed(1),'rider',m.rider?.toFixed(1),'med',m.median, 'buses',[...r.lists[i].patterns].join('+'));
   const [a,b]=r.stretches.find(([a,b])=>i>=a&&i<=b)!; console.log('    in stretch',a,b);} }
