import { pooledHeadwayInWindow, collapseBunched } from '/Users/ryan/Developer/Code/Platforms/Atlas/pipeline/stopPools.ts';
import { typicalOfGaps, departuresInWindow } from '/Users/ryan/Developer/Code/Platforms/Atlas/pipeline/headway-utils.ts';
// fractional replica of pooledReadingInWindow (A3: no Math.round anywhere), no own
function frac(times:number[],start:number,end:number):number|null{
  const w=collapseBunched(departuresInWindow(times,start,end,true)); if(w.length<3)return null;
  const gaps:number[]=[];for(let i=1;i<w.length;i++)gaps.push(w[i]-w[i-1]);
  const typical=typicalOfGaps(gaps); const mean=(w[w.length-1]-w[0])/(w.length-1); const longest=Math.max(...gaps);
  const value=Math.max(typical,mean);
  if(longest>Math.max(1.75*mean,mean+5)||longest>Math.max(1.6*value,value+5))return null; return value;}
const every=(a:number,b:number,s:number)=>{const o:number[]=[];for(let t=a;t<=b;t+=s)o.push(t);return o;};
const T:[string,number[],number,number,any][]=[];
const t1=every(540,900,5).filter(t=>t!==875); T.push(['held bus every5 (test1)',t1,540,900,5]);
T.push(['two 30s 3 apart (test2)',[...every(540,900,30),...every(543,873,30)].sort((a,b)=>a-b),540,900,null]);
T.push(['hole vs every-20 (test3)',every(540,900,20).filter(t=>t!==700),540,900,null]);
const m=[...every(540,900,10),...every(541,901,10)].sort((a,b)=>a-b); T.push(['two every-10 1 apart (bunched test)',m,540,900,10]);
// RTC 219 style 15/15/30: 30-min at :00,:30 and hourly at :15, windows of different clipping
for(const off of [0,5,10,15,20,25,40,50]) T.push([`15/15/30 window start +${off}`,[...every(300,1400,30),...every(315,1400,60)].sort((a,b)=>a-b),540+off,900,'19?']);
// Freedom M #813: 165 hole vs 98
T.push(['165 hole (freedom M style, every ~60 around)',[540,600,660,720,885,945,1005].filter(t=>true),540,1080,null]);
for(const [l,t,s,e,exp] of T) console.log(l.padEnd(44),'real',pooledHeadwayInWindow(t,s,e),'| fractional',frac(t,s,e),'| test expects',exp);
