import fs from 'fs';
import { loadPatterns, readAll } from './real.ts';
const S='/private/tmp/claude-501/-Users-ryan/c8d09263-8b14-4eb3-a210-0831beabea38/scratchpad';
const fc=JSON.parse(fs.readFileSync('/Users/ryan/Developer/Code/Platforms/Atlas/tmp/agency-pages-cache/release-mwl8qwjk/drt.json','utf8'));
for (const [route,period,s,e] of [['901','evening',1140,1380],['900','evening',1140,1380],['901','amPeak',360,540]] as const) for (const d of ['0','1']) {
  const L=loadPatterns(S+'/drt',S+'/drt',route,d,'2026-11-18'); const {out}=readAll(L,s,e);
  const feats=fc.features.filter((f:any)=>f.geometry.type==='LineString'&&f.properties.routeShortName===route&&f.properties.day==='Weekday'&&String(f.properties.directionId)===d&&f.properties.stopOrder);
  let match=0,tot=0,bad:string[]=[];
  for (const f of feats){ const hs=f.properties.headsign; 
    // candidate patterns by headsign and stop-count equality
    const cands=L.pats.filter(p=>p.order.length===f.properties.stopOrder.length||false);
    const p=cands.find(p=>p.order.join()===f.properties.stopOrder.join()) ; if(!p){bad.push('nomatch '+hs+' '+f.properties.stopOrder.length);continue;}
    const rs=out.get(p.key)!; f.properties.stopOrder.forEach((st:string,i:number)=>{ const pubv=f.properties.stopPeriodHeadways?.[st]?.[period]; if(pubv==null&&rs[i].pub==null)return; tot++; if(pubv===rs[i].pub)match++; else if(bad.length<4)bad.push(`${hs} ${i}:${st} real ${pubv} mine ${rs[i].pub}`);});
  }
  console.log(route,period,'dir',d,'feats',feats.length,'match',match,'/',tot,bad.join(' ; '));
}
