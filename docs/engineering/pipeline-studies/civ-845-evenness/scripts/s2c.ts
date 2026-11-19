import { run, cases } from './s1lib.ts';
import { csv } from './realx.ts';
const S='/private/tmp/claude-501/-Users-ryan/c8d09263-8b14-4eb3-a210-0831beabea38/scratchpad';
const mode=process.argv[2]||'T0';
const routes=[...new Set(csv(S+'/drt/routes.txt').map(r=>r.route_short_name))];
cases.splice(0,cases.length);
for(const r of routes) for(const d of ['0','1']) cases.push([`${r} d${d} eve`,'drt','drt',r,d,'2026-11-18',1140,1380,20] as any);
const R=run(mode);
const FILT=20;
const out:any[]=[]; const summary:any={};
for(const q of R.seqs){ const rs=q.recs; let a=0;
  for(let i=1;i<=rs.length;i++) if(i===rs.length||rs[i].sig!==rs[a].sig){
    if(rs[a].sig!==''){ const blk=rs.slice(a,i).filter((x:any)=>x.g&&x.pub!=null); if(blk.length){
      const pass=(x:any)=>x.pub<=FILT; const P:any[]=[]; let s=0;
      for(let k=1;k<=blk.length;k++) if(k===blk.length||pass(blk[k])!==pass(blk[s])){P.push({s,e:k-1,pass:pass(blk[s])});s=k;}
      const anyPass=P.some(p=>p.pass);
      P.forEach((p,k)=>{ if(!p.pass)return; if(P.length===1&&false)return;
        const n=p.e-p.s+1; const ends:any[]=[];
        for(const side of ['L','R']){ const nbIdx=side==='L'?p.s-1:p.e+1; if(nbIdx<0||nbIdx>=blk.length){ends.push('blockend');continue;}
          const nb=blk[nbIdx]; const np=P[side==='L'?k-1:k+1]; const nbn=np.e-np.s+1;
          const atBlockEnd=(side==='L'?np.s===0:np.e===blk.length-1);
          const margin=nb.g.refused?(nb.g.longest-nb.g.limit):null;
          ends.push(`${nbn===1&&atBlockEnd?'endstop':'refused'}${margin!=null?`(m${margin.toFixed(1)})`:'(own>20)'}`); }
        out.push({route:q.label.split(' ')[0],dir:q.label.split(' ')[1],pi:q.pi,block:a,n,P:P.length,ends,whole:P.length===1,cutAt:blk.length,stretchLen:blk.length}); });
    } } a=i; } }
console.log(mode,'routes',routes.length,'shown (green) pieces',out.length);
// de-dup identical (route,dir,block stops) across patterns? keep per pattern
const key=(o:any)=>`${o.route} ${o.dir} p${o.pi} b${o.block}`;
const clipped=out.filter(o=>!o.whole);
console.log('pieces that are the whole same-bus block:',out.filter(o=>o.whole).length,'| partial (a neighbour in the block fails):',clipped.length);
for(const o of out.filter(o=>!o.whole)) console.log(key(o),`${o.n}/${o.stretchLen}st`,o.ends.join(' | '));
const byRoute:any={}; for(const o of out){byRoute[o.route]=(byRoute[o.route]||0)+1;} console.log('green pieces per route',JSON.stringify(byRoute));

for(const o of out.filter(o=>o.whole)) console.log('WHOLE',key(o),o.n,'st');
// all stops with a reading (pooled or not) per route/dir, visible pass count
const agg:any={}; for(const q of R.seqs){ const k=q.label.split(' ').slice(0,2).join(' '); const a=agg[k]??={pooled:0,poolPass:0,single:0,singlePass:0,pats:0}; a.pats++; for(const x of q.recs){ if(x.pub==null)continue; if(x.isP){a.pooled++; if(x.pub<=FILT)a.poolPass++;} else {a.single++; if(x.pub<=FILT)a.singlePass++;} } }
for(const [k,a] of Object.entries<any>(agg)) if(a.poolPass||a.singlePass) console.log('ANY PASS',k,JSON.stringify(a));
for(const q of R.seqs){ const k=q.label.split(' ').slice(0,2).join(' '); if(k!=='915 d1'&&k!=='921 d0')continue; console.log('SEQ',k,'p'+q.pi,q.recs.map((x:any)=>x.pub==null?'-':String(Math.round(x.pub))).join(' ')); }
