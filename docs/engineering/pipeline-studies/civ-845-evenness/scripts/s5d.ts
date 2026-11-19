import { run, cases, SEQS } from './s5lib.ts';
cases.splice(0,cases.length,...cases.filter(c=>c[0]==='900 EB eve'));
run('T0');
const s=SEQS.find((x:any)=>x.pi===0);
for(const j of [44,53,55,56]){const g=s.recs[j].g; console.log(j,'n',g.n,'mean',g.mean.toFixed(3),'value',g.value,'ownV',g.ov,'longest',g.longest,'gaps',g.gaps.join(','));}
