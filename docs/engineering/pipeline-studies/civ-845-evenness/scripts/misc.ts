import { metrics, tierOf } from './replay.ts';
const f=(x:number|null)=>x==null?'-':(+x.toFixed(1)).toString();
function show(label:string,deps:number[],w:[string,number,number][]){ for(const [n,s,e] of w){const m=metrics(deps,s,e);console.log(label.padEnd(26),n.padEnd(8),'n',m.n,'pooledGate',f(m.pooled ?? m.pooledWorst),'| worst',f(m.worst),'avg',f(m.avg),'rider',f(m.rider),'median(typ)',f(m.median));} }
// Clemson Gold: three frequency vehicles, 1213 s
const deps:number[]=[];
for(const [s,e] of [[7*3600,18*3600+7*60],[7*3600+900,13*3600+45*60],[13*3600+45*60,17*3600+52*60]]) for(let t=s;t<e;t+=1213) deps.push(Math.round(t/60));
deps.sort((a,b)=>a-b);
show('Clemson Gold (rounded min)',deps,[['AM',360,540],['midday',540,900],['PM',900,1140]]);
// #826 synthetic: two 30-min branches 3 min apart: 3,27,3,27
const s826:number[]=[]; for(let k=0;k<8;k++){s826.push(480+k*30,483+k*30);} 
show('#826 3/27 (synthetic)',s826,[['08-12',480,720]]);
