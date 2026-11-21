import { run, cases } from './s6lib.ts';
const keep=['900 EB eve','900 WB eve','901 N AM','901 S AM','901 N eve','901 S eve','102 N eve','102 S eve','102 N mid','102 S mid','102 N am','102 S am'];
const T=run('T0'); const V=run('V1'); const aT=new Map(T.acc.all.map((x:any)=>[x.k,x])); const by:any={};
for(const x of V.acc.all){const y:any=aT.get(x.k); if(y&&y.ref!==x.ref){const l=x.k.split('|')[0]; by[l]=(by[l]||0)+1;}}
console.log('reading flips by case',by); const per:any={}; T.acc.all.forEach((x:any)=>{const l=x.k.split('|')[0]; per[l]=(per[l]||0)+1;}); console.log('readings per case',per);
const f:any={}; T.acc.all.forEach((x:any)=>{const l=x.k.split('|')[0]; const fr=x.g.mean-Math.floor(x.g.mean); if(fr>=0.4&&fr<=0.6)f[l]=(f[l]||0)+1;}); console.log('frac band per case',f);
