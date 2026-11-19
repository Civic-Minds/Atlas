import { load, referenceOrder, stopLists, metrics, pubValue, tierOf } from './replay.ts';
const S='/private/tmp/claude-501/-Users-ryan/c8d09263-8b14-4eb3-a210-0831beabea38/scratchpad';
for (const d of ['0','1']) {
  const { trips, st } = load(S+'/drt','900',d,'2026-11-18');
  console.log('\n=== dir',d,'trips',trips.length, 'headsigns',[...new Set(trips.map(t=>t.trip_headsign))]);
  const order = referenceOrder(st); const lists = stopLists(st, order);
  lists.forEach((l,i)=>{const m=metrics(l.deps,1140,1380);console.log(i,l.stopId,[...l.patterns].join(','),'n',m.n,'pub',pubValue(m),'worst',m.worst,'avg',m.avg?.toFixed(1),'rider',m.rider?.toFixed(1),'med',m.median)});
}
