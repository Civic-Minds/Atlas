const H='/private/tmp/claude-501/-Users-ryan/c8d09263-8b14-4eb3-a210-0831beabea38/scratchpad/civ1959/snap/';
const every=(a:number,b:number,s:number)=>{const o:number[]=[];for(let t=a;t<=b;t+=s)o.push(t);return o;};
(async()=>{
for (const v of ['main','exact15c','exact155c']) {
  const root = v==='main' ? '/private/tmp/claude-501/-Users-ryan/c8d09263-8b14-4eb3-a210-0831beabea38/scratchpad/civ845-evidence/snap/main/pipeline/stopPools.ts' : H+v+'/pipeline/stopPools.ts';
  const sp = await import(root);
  const r = (t:number[],o?:number[])=>JSON.stringify(sp.pooledReadingInWindow(t,540,900,3,false,o));
  const alt=[...every(540,900,30),...every(555,900,60)].sort((a,b)=>a-b);
  const bunched=[...every(540,900,30),...every(543,873,30)].sort((a,b)=>a-b);
  const hole=every(540,900,20).filter(t=>t!==700);
  const held=every(540,900,5).filter(t=>t!==875);
  const own=[400,498,596,694];
  console.log(v,'| alt 15/15/30:',r(alt),'| bunched 3/27:',r(bunched),'| 20 w/ 30 hole:',r(hole),'| ttc52 held bus:',r(held),'| 165 hole vs 98:',JSON.stringify(sp.pooledReadingInWindow([...own,859],360,1320,3,false,own)));
}})();
