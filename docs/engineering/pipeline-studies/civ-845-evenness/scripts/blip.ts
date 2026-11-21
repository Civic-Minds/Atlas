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
const cases:[string,string,string,string,string,string,number,number,number][]=[
 ['900 EB eve','drt','drt','900','0','2026-11-18',1140,1380,20],['900 WB eve','drt','drt','900','1','2026-11-18',1140,1380,20],
 ['901 N AM','drt','drt','901','0','2026-11-18',360,540,20],['901 S AM','drt','drt','901','1','2026-11-18',360,540,20],
 ['901 N eve','drt','drt','901','0','2026-11-18',1140,1380,20],['901 S eve','drt','drt','901','1','2026-11-18',1140,1380,20],
 ['102 N eve','ttc102','ttc','102','1','2026-10-21',1140,1380,20],['102 S eve','ttc102','ttc','102','0','2026-10-21',1140,1380,20],
 ['102 N mid','ttc102','ttc','102','1','2026-10-21',540,900,15],['102 S mid','ttc102','ttc','102','0','2026-10-21',540,900,15],
 ['102 N am','ttc102','ttc','102','1','2026-10-21',360,540,15],['102 S am','ttc102','ttc','102','0','2026-10-21',360,540,15]];
const Ns=[1,2,3], Ms=[5,10,15], MODES=['up','both'];
const cfgs:string[]=[]; for(const m of MODES) for(const n of Ns) for(const M of Ms) cfgs.push(`${m}-N${n}-M${M}`);
const T:any={stretches:0,base1:0,endBlips:{1:0,2:0},endBlipsStops:{1:0,2:0}};
for(const c of cfgs) T[c]={one:0,pf:0,pfU20:0,fp:0,fpOver:0,fpMax:0,tier:0,chg:0,filled:0,eb:0,ebPer:[] as number[],wb:'',reasons:{} as any,left:[] as string[]};
const ebBase:number[]=[];
for (const [label,dir,sd,route,dirId,date,start,end,filter] of cases) {
  const L=loadPatterns(S+'/'+dir,S+'/'+sd,route,dirId,date); const {out,sharers}=readAll(L,start,end);
  const depsOf=new Map(L.pats.map(p=>[p.key,p.deps]));
  const best=new Map<string,{n:number,pub:number,nv:Record<string,number>,ol:number}>();
  L.pats.forEach((p,pi)=>{
    const rs=out.get(p.key)!; const pooled=buildPooledStopMap(p.deps,sharers.get(p.key),k=>depsOf.get(k),L.parent,p.deps);
    const info=rs.map(r=>{ const own=[...(p.deps.get(r.stop)??[])].sort((a,b)=>a-b);
      const times=[...(pooled.map.get(r.stop)??own)].sort((a,b)=>a-b);
      const g=r.pooled?gate(times,start,end,own):null;
      const ow=departuresInWindow(own,start,end,true); let ol=0; for(let i=1;i<ow.length;i++) ol=Math.max(ol,ow[i]-ow[i-1]);
      return {g,ol}; });
    const sig=rs.map(r=>r.pooled?[...r.sharers].sort().join('+'):'');
    const nv:Record<string,(number|null)[]>={}; for(const c of cfgs) nv[c]=rs.map(r=>r.pub);
    const key=(x:number)=>headwayToTier(x)+'|'+(x<=filter);
    let a=0;
    for(let i=1;i<=rs.length;i++) if(i===rs.length||sig[i]!==sig[a]){
      if(sig[a]!==''){
        const idx:number[]=[];for(let j=a;j<i;j++) if(rs[j].pub!=null) idx.push(j);
        if(idx.length>=2){
          T.stretches++; const pubs=idx.map(j=>rs[j].pub!);
          if(new Set(pubs.map(x=>x<=filter)).size===1) T.base1++;
          // runs by key
          const runs:{k:string,s:number,e:number}[]=[]; // positions in idx
          pubs.forEach((x,q)=>{const k=key(x); if(runs.length&&runs[runs.length-1].k===k) runs[runs.length-1].e=q; else runs.push({k,s:q,e:q});});
          // end blips (report once)
          if(runs.length>=2) for(const N of [1,2]){ let c=0; const f=runs[0],l=runs[runs.length-1];
            if(f.e-f.s+1<=N&&runs.length>=2){c++;T.endBlipsStops[N]+=f.e-f.s+1;} if(l.e-l.s+1<=N&&runs.length>=2&&runs.length>1){c++;T.endBlipsStops[N]+=l.e-l.s+1;} T.endBlips[N]+=c; }
          for(const c of cfgs){ const [mode,ns,ms]=c.split('-'); const N=+ns.slice(1), M=+ms.slice(1)/100;
            const R=T[c];
            for(let r=1;r<runs.length-1;r++){ const b=runs[r],pv=runs[r-1],nx=runs[r+1];
              if(pv.k!==nx.k||b.k===pv.k) continue;
              const len=b.e-b.s+1; const why=(w:string)=>{R.reasons[w]=(R.reasons[w]??0)+1;};
              if(len>N){why('blip longer than N');continue;}
              const nval=Math.max(pubs[pv.e],pubs[nx.s]); const bval=Math.max(...pubs.slice(b.s,b.e+1));
              const up=nval<bval;
              if(!up && mode==='up'){why('neighbours worse (up-only)');continue;}
              if(up){ let ok=true; for(let q=b.s;q<=b.e;q++){ const g=info[idx[q]].g; if(!g||(g.refused&&g.longest>g.limit*(1+M))) ok=false; }
                if(!ok){why('blip gate refusal > M');continue;} }
              for(let q=b.s;q<=b.e;q++) nv[c][idx[q]]=nval; R.filled++; why('filled');
            }
            const ns2=idx.map(j=>nv[c][j]!); if(new Set(ns2.map(x=>x<=filter)).size===1) R.one++; else R.left.push(`${label}P${pi}[${runs.map(r=>r.k.split('|')[1]==='true'?'P'+(r.e-r.s+1):'F'+(r.e-r.s+1)).join(',')}]`);
          }
        }
      }
      a=i;
    }
    rs.forEach((r,j)=>{ if(r.pub==null) return; const n=p.deps.get(r.stop)?.length??0; const cur=best.get(r.stop);
      if(!cur||n>cur.n){ const o:any={}; for(const c of cfgs) o[c]=nv[c][j]; best.set(r.stop,{n,pub:r.pub,nv:o,ol:info[j].ol}); } });
    if(label==='900 EB eve'||label==='900 WB eve'){
      const row=(arr:(number|null)[])=>{ let runs=1; for(let j=1;j<arr.length;j++){ const x=arr[j-1],y=arr[j]; if(x==null||y==null) continue; if((x<=filter)!==(y<=filter)) runs++; } return runs; };
      if(label==='900 EB eve'){ ebBase.push(row(rs.map(r=>r.pub))); for(const c of cfgs) T[c].ebPer.push(row(nv[c])); }
      else if(pi===0) for(const c of cfgs) T[c].wb=nv[c].slice(34,43).join(',');
    }
  });
  for(const [st,{pub,nv,ol}] of best) for(const c of cfgs){ const x=nv[c]; const R=T[c]; const w=pub<=filter,n=x<=filter;
    if(w&&!n){R.pf++; if(pub<20)R.pfU20++;}
    if(!w&&n){R.fp++; if(ol>20){R.fpOver++; R.fpMax=Math.max(R.fpMax,ol-20);} }
    if(headwayToTier(x)!==headwayToTier(pub)) R.tier++; if(x!==pub) R.chg++; }
}
console.log('stretches',T.stretches,'baseline one-colour',T.base1,'EB base runs per pattern',ebBase.join(','),'end blips (stretches w/ >=2 runs) by N',JSON.stringify(T.endBlips),'stops',JSON.stringify(T.endBlipsStops));
console.log('cfg | oneColour/126 | filled blips | pass->fail (<20) | fail->pass (ownLongest>20) maxOver | tierChg | chg | EB runs/pattern | WB34-42');
for(const c of cfgs){const R=T[c]; console.log(c,'|',R.one,'|',R.filled,'|',R.pf,`(${R.pfU20})`,'|',R.fp,`(${R.fpOver})`,R.fpMax,'|',R.tier,'|',R.chg,'|',R.ebPer.join('/'),'|',R.wb);}
for(const c of ['up-N3-M15','up-N2-M10','both-N3-M15']){console.log(c,'reasons',JSON.stringify(T[c].reasons)); console.log(' left',T[c].left.join(' ')); }
