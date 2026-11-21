import { analyse } from './analyse.ts';
const S='/private/tmp/claude-501/-Users-ryan/c8d09263-8b14-4eb3-a210-0831beabea38/scratchpad';
const log=console.log; const cases:[string,string,string,string,string,number,number,number][]=[
 ['900 EB eve','drt','900','0','2026-11-18',1140,1380,20],['900 WB eve','drt','900','1','2026-11-18',1140,1380,20],
 ['901 N AM','drt','901','0','2026-11-18',360,540,20],['901 S AM','drt','901','1','2026-11-18',360,540,20],
 ['901 N eve','drt','901','0','2026-11-18',1140,1380,20],['901 S eve','drt','901','1','2026-11-18',1140,1380,20],
 ['102 N eve','ttc102','102','1','2026-10-21',1140,1380,20],['102 S eve','ttc102','102','0','2026-10-21',1140,1380,20],
 ['102 N mid','ttc102','102','1','2026-10-21',540,900,15],['102 S mid','ttc102','102','0','2026-10-21',540,900,15],
 ['102 N am','ttc102','102','1','2026-10-21',360,540,15],['102 S am','ttc102','102','0','2026-10-21',360,540,15]];
const agg:any={};
for(const c of cases){ console.log=()=>{}; analyse(c[0],S+'/'+c[1],c[2],c[3],c[4],c[5],c[6],c[7]); console.log=log; const t=(globalThis as any).__tot;
  log('\n'+c[0]); for(const [r,e] of Object.entries<any>(t)){ log('  ',r.padEnd(17),'stops',e.stops,'stretches',e.strN,'one-colour stretches',e.unitOK,'tier-changed',e.changeTier,'passfail-changed',e.changePass,'better>1',e.better,'worse>1',e.worse); const g=(agg[r]??={stops:0,strN:0,unitOK:0,changeTier:0,changePass:0,better:0,worse:0}); for(const k of Object.keys(g)) g[k]+=e[k]; } }
log('\nTOTAL'); for(const [r,g] of Object.entries<any>(agg)) log(r.padEnd(17),JSON.stringify(g));
