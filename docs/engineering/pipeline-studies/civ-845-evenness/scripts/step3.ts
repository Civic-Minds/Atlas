import { run2 } from './step2.ts';
import { headwayToTier } from '/Users/ryan/Developer/Code/Platforms/Atlas/pipeline/headway-utils.ts';
const PER:[string,number,number,number][]=[['AM',360,540,15],['Mid',540,900,15],['PM',900,1140,15],['Eve',1140,1380,20]];
const feeds:[string,string,string,string][]=[['drt','drt','2026-11-18','drt'],['ttc102','ttc','2026-10-21','t102'],['ttc5241','ttc','2026-10-21','t52'],['ttcm','ttc','2026-10-21','ttcm'],['ttc5','ttc','2026-10-21','ttc5']];
const routes:Record<string,string[]>={drt:['900','901'],ttc102:['102'],ttc5241:['52','41'],ttcm:['25','29','35','54','95','10','85','32'],ttc5:['5']};
const cs:any[]=[]; for(const [dir,sd,date] of feeds) for(const r of routes[dir]) for(const d of ['0','1']) for(const [pn,st,en,f] of PER) cs.push([`${dir}:${r}${d} ${pn}`,dir,sd,r,d,date,st,en,f]);
const only=process.env.ONLY; const use=only?cs.filter(c=>c[0].startsWith(only)):cs;
const {R,best}=run2('T0',false,false,use);
const med=(a:number[])=>{if(!a.length)return NaN;const s=[...a].sort((x,y)=>x-y);const m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2;};
const hw=(t:number[],a:number,b:number)=>{const w=[...new Set(t)].filter(x=>x>=a&&x<=b).sort((x,y)=>x-y);const g=w.slice(1).map((x,i)=>x-w[i]);return g.length>=2?med(g):NaN;};
const hm=(m:number)=>`${Math.floor(m/60)}:${String(Math.floor(m%60)).padStart(2,'0')}`;
let stops=0,withOut=0,flagged=0,changed=0,tierCh=0,filtCh=0,maxOut=0,outTrips=0; const outMins:number[]=[]; const ex:any[]=[]; const perWin:any={};
for(const b of best.values()){ if(b.x==null||b.pub==null)continue; stops++; const pool=b.pool.map((e:any)=>e.t); const tp=[...new Set(b.sel.map((e:any)=>e.t))] as number[];
  const lo=tp.filter(t=>t<b.start),hi=tp.filter(t=>t>b.end); const n=lo.length+hi.length; if(!n)continue; withOut++; outTrips+=n;
  const mo=Math.max(...lo.map(t=>b.start-t),...hi.map(t=>t-b.end),0); maxOut=Math.max(maxOut,mo); outMins.push(mo);
  let real=false,info:string[]=[];
  if(lo.length){const o=hw(pool,b.start-45,b.start),i=hw(pool,b.start,b.start+45); if(i>0&&o>0){const r=o/i; if(r>=1.5||r<=1/1.5){real=true;info.push(`start side: ${o.toFixed(0)} outside vs ${i.toFixed(0)} inside`);}}}
  if(hi.length){const o=hw(pool,b.end,b.end+45),i=hw(pool,b.end-45,b.end); if(i>0&&o>0){const r=o/i; if(r>=1.5||r<=1/1.5){real=true;info.push(`end side: ${o.toFixed(0)} outside vs ${i.toFixed(0)} inside`);}}}
  const w=(perWin[b.label.split(' ').pop()]??={withOut:0,flagged:0,changed:0}); w.withOut++;
  if(!real)continue; flagged++; w.flagged++; const ch=Math.abs(b.x-b.pub)>1e-9; if(ch){changed++;w.changed++;} if(headwayToTier(b.x)!==headwayToTier(b.pub))tierCh++; if((b.pub<=b.filter)!==(b.x<=b.filter))filtCh++;
  if(ch&&ex.length<400)ex.push({lab:b.label,stop:b.stop,from:b.pub,to:b.x,out:mo,lo:lo.map(hm),hi:hi.map(hm),info:info.join('; ')}); }
console.log('windows',use.length,'stops with a reading',stops,'| stops reading >=1 trip outside window',withOut,'(trips',outTrips,') max minutes outside',maxOut,'median max-out per stop',med(outMins));
console.log('of those, on a side with real service change (>=1.5x headway across edge):',flagged,'| value changed vs today',changed,'| tier changed',tierCh,'| pass/fail changed',filtCh);
console.log('per period',JSON.stringify(perWin)); console.log('overall R3 vs today in these windows: pf',R.pf,'fp',R.fp,'worse',R.worse,'stops',R.stops);
const big=ex.filter(e=>Math.abs(e.to-e.from)>=3).sort((a,b)=>Math.abs(b.to-b.from)-Math.abs(a.to-a.from)); console.log('flagged & changed by >=3 min:',big.length,'of changed',ex.length);
const sel=[...big.slice(0,6)]; for(const e of sel) console.log(JSON.stringify(e));
console.log('delta distribution (flagged changed):',ex.map(e=>(e.to-e.from)).sort((a,b)=>a-b).join(','));
const ge=(x:number)=>outMins.filter(m=>m>=x).length; console.log('stops by max minutes outside: >=5',ge(5),'>=10',ge(10),'>=15',ge(15),'>=20',ge(20),'>=24',ge(24));
const fl=ex.filter(e=>true); const dir=(f:any)=>f.to>f.from?'worse(longer)':'better(shorter)'; console.log('flagged changed: longer',fl.filter(e=>e.to>e.from).length,'shorter',fl.filter(e=>e.to<e.from).length);
const pfc:any={}; for(const e of ex){const k=e.lab.split(' ')[0]+' '+e.lab.split(' ').pop()+' '+e.from+'->'+e.to+' out'+e.out; pfc[k]=(pfc[k]||0)+1;} console.log(JSON.stringify(pfc));
