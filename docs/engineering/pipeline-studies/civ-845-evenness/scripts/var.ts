import { loadPatterns, readAll } from './real.ts';
import { buildPooledStopMap, collapseBunched } from '/Users/ryan/Developer/Code/Platforms/Atlas/pipeline/stopPools.ts';
import { medianHeadwayInWindow, departuresInWindow, headwayToTier } from '/Users/ryan/Developer/Code/Platforms/Atlas/pipeline/headway-utils.ts';
const S='/private/tmp/claude-501/-Users-ryan/c8d09263-8b14-4eb3-a210-0831beabea38/scratchpad';
function gate(times:number[], start:number,end:number, own:number[]) {
  const w = collapseBunched(departuresInWindow(times,start,end,true));
  if (w.length<3) return null;
  const typical = medianHeadwayInWindow(w,start,end,3,true); if (typical==null) return null;
  const mean=(w[w.length-1]-w[0])/(w.length-1); let longest=0; for(let i=1;i<w.length;i++) longest=Math.max(longest,w[i]-w[i-1]);
  const os=departuresInWindow(own,start,end,true);
  const ov= os.length>=3? medianHeadwayInWindow(os,start,end,3,true):null;
  const floored=Math.max(typical,Math.round(mean)); const value= ov!=null?Math.min(floored,ov):floored;
  const l1=Math.max(1.75*mean,Math.round(mean)+5), l2=Math.max(1.6*value,value+5); const limit=Math.min(l1,l2);
  return { value, longest, limit, refused: longest>l1||longest>l2 };
}
const VARS=['C','D5','D10','E','F'] as const;
type V=typeof VARS[number];
const cases:[string,string,string,string,string,string,number,number,number][]=[
 ['900 EB eve','drt','drt','900','0','2026-11-18',1140,1380,20],['900 WB eve','drt','drt','900','1','2026-11-18',1140,1380,20],
 ['901 N AM','drt','drt','901','0','2026-11-18',360,540,20],['901 S AM','drt','drt','901','1','2026-11-18',360,540,20],
 ['901 N eve','drt','drt','901','0','2026-11-18',1140,1380,20],['901 S eve','drt','drt','901','1','2026-11-18',1140,1380,20],
 ['102 N eve','ttc102','ttc','102','1','2026-10-21',1140,1380,20],['102 S eve','ttc102','ttc','102','0','2026-10-21',1140,1380,20],
 ['102 N mid','ttc102','ttc','102','1','2026-10-21',540,900,15],['102 S mid','ttc102','ttc','102','0','2026-10-21',540,900,15],
 ['102 N am','ttc102','ttc','102','1','2026-10-21',360,540,15],['102 S am','ttc102','ttc','102','0','2026-10-21',360,540,15]];
const med=(a:number[])=>{const s=[...a].sort((x,y)=>x-y);const m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2;};
const T:any={stretches:0, base1:0}; for(const v of VARS) T[v]={one:0,pf:0,pfU20:0,fp:0,fpOver:0,fpDetail:[] as string[],tier:0,chg:0};
for (const [label,dir,sd,route,dirId,date,start,end,filter] of cases) {
  const L=loadPatterns(S+'/'+dir,S+'/'+sd,route,dirId,date); const {out,sharers}=readAll(L,start,end);
  const depsOf=new Map(L.pats.map(p=>[p.key,p.deps]));
  const best=new Map<string,{n:number,pub:number,nv:Record<V,number>,ownLongest:number}>();
  const mark:Record<string,string[]>={};
  L.pats.forEach((p,pi)=>{
    const rs=out.get(p.key)!; const pooled=buildPooledStopMap(p.deps,sharers.get(p.key),k=>depsOf.get(k),L.parent,p.deps);
    const info=rs.map(r=>{ const own=[...(p.deps.get(r.stop)??[])].sort((a,b)=>a-b);
      const times=[...(pooled.map.get(r.stop)??own)].sort((a,b)=>a-b);
      const g=r.pooled?gate(times,start,end,own):null;
      const ow=departuresInWindow(own,start,end,true); let ol=0; for(let i=1;i<ow.length;i++) ol=Math.max(ol,ow[i]-ow[i-1]);
      return {g,ol}; });
    const sig=rs.map(r=>r.pooled?[...r.sharers].sort().join('+'):'');
    const newv:Record<V,(number|null)[]>={C:[],D5:[],D10:[],E:[],F:[]} as any;
    for(const v of VARS) newv[v]=rs.map(r=>r.pub);
    let a=0;
    for(let i=1;i<=rs.length;i++) if(i===rs.length||sig[i]!==sig[a]){
      if(sig[a]!==''){
        const idx=[];for(let j=a;j<i;j++) if(rs[j].pub!=null) idx.push(j);
        if(idx.length>=2){
          T.stretches++; const pubs=idx.map(j=>rs[j].pub!);
          if(new Set(pubs.map(x=>x<=filter)).size===1) T.base1++;
          const bestV=Math.min(...pubs), mdn=med(pubs);
          for(const j of idx){ newv.C[j]=Math.min(rs[j].pub!,bestV); newv.F[j]=Math.min(rs[j].pub!,mdn); }
          const fj=idx.reduce((b,j)=>rs[j].n>rs[b].n?j:b,idx[0]);
          const fg=info[fj].g; const pass=fg!=null&&!fg.refused;
          for(const j of idx){ const g=info[j].g;
            if(pass&&g) newv.E[j]=Math.min(rs[j].pub!,g.value);
            for(const [k,x] of [['D5',.05],['D10',.10]] as const) if(g&&g.refused&&g.longest<=g.limit*(1+x)) newv[k][j]=g.value; }
          for(const v of VARS){ const ns=idx.map(j=>newv[v][j]!); if(new Set(ns.map(x=>x<=filter)).size===1) T[v].one++; }
        }
      }
      a=i;
    }
    mark[p.key]=[]; 
    rs.forEach((r,j)=>{ if(r.pub==null) return; const own=p.deps.get(r.stop)?.length??0; const cur=best.get(r.stop);
      if(!cur||own>cur.n){ const nv:any={}; for(const v of VARS) nv[v]=newv[v][j]; best.set(r.stop,{n:own,pub:r.pub,nv,ownLongest:info[j].ol}); } });
    if(label==='900 EB eve'||label==='900 WB eve'){
      const row=(arr:(number|null)[])=>{ let runs=1; for(let j=1;j<arr.length;j++){ const x=arr[j-1],y=arr[j]; if(x==null||y==null) continue; if((x<=filter)!==(y<=filter)) runs++; } return runs; };
      const s=`${label} P${pi} stops${rs.length} runs base ${row(rs.map(r=>r.pub))} `+VARS.map(v=>v+' '+row(newv[v])).join(' ');
      console.log(s);
      if(label==='900 WB eve'&&pi===0) { console.log('  WB idx34-42 base',rs.slice(34,43).map(r=>r.pub).join(','));
        for(const v of VARS) console.log('  ',v,newv[v].slice(34,43).join(',')); }
      if(label==='900 EB eve'&&pi===0) { console.log('  EB base',rs.map(r=>r.pub).join(','));
        for(const v of VARS) console.log('  ',v,newv[v].join(',')); }
    }
  });
  for(const [st,{pub,nv,ownLongest}] of best){ for(const v of VARS){ const x=nv[v]; if(x==null) continue;
    const w=pub<=filter,n=x<=filter; if(w&&!n){T[v].pf++; if(pub<20)T[v].pfU20++;}
    if(!w&&n){T[v].fp++; const over=ownLongest>20; if(over)T[v].fpOver++; T[v].fpDetail.push(`${label}:${st} pub${pub} ownLongest${ownLongest}`);}
    if(headwayToTier(x)!==headwayToTier(pub)) T[v].tier++; if(x!==pub) T[v].chg++; } }
}
console.log('stretches',T.stretches,'baseline one-colour',T.base1);
for(const v of VARS) console.log(v,JSON.stringify({...T[v],fpDetail:undefined}), '\n   fp detail:',T[v].fpDetail.join(' | '));
