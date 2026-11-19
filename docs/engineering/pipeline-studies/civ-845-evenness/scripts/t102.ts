import { analyse } from './analyse.ts';
const S='/private/tmp/claude-501/-Users-ryan/c8d09263-8b14-4eb3-a210-0831beabea38/scratchpad';
const out:any={};
for (const [pn,s,e,f] of [['evening',1140,1380,20],['midday',540,900,15],['amPeak',360,540,15]] as const) for (const d of ['0','1']) {
  const r=analyse('TTC 102 dir'+d+' '+pn,S+'/ttc102','102',d,'2026-10-21',s,e,f);
}
