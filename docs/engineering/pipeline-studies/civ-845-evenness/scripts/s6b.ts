import { run, SEQS, cases } from './s6lib.ts';
import { csv } from './realx.ts';
cases.splice(0,cases.length,...cases.filter(c=>c[0]==='900 EB eve'));
run('V1');
const names=new Map(csv('drt/stops.txt').map(r=>[r.stop_id,r.stop_name]));
const f=(x:number)=>x.toFixed(2);
for(const s of SEQS){ console.log('pattern',s.pi,'nstops',s.recs.length);
 s.recs.forEach((r:any,j:number)=>{ const g=r.g; if(!g)return; const ex=g.l2e<g.longest&&g.l2r>=g.longest&&Math.min(Math.max(1.75*g.mean,g.mr+5),g.l2r)>=g.longest; 
  if([44,53,55,56].includes(j)||ex) console.log(' pat',s.pi,'idx',j,r.stop,names.get(r.stop),'| n',g.n,'mean',f(g.mean),'frac',f(g.frac),'typ',g.typical,'value',g.value,'exV',f(g.exV),'longest',g.longest,'l1',f(Math.max(1.75*g.mean,g.mr+5)),'l2r',f(g.l2r),'l2e',f(g.l2e),'ownV',g.ov,ex?'<== newly refused':'');});}
