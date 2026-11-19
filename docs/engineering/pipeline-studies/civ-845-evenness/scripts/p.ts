import { pooledReadingInWindow as r } from '/Users/ryan/Developer/Code/Platforms/Atlas/.claude/worktrees/agent-a92708b45d34993ae/pipeline/stopPools.ts';
const fg=(g:number[])=>g.reduce<number[]>((o,x)=>[...o,o[o.length-1]+x],[540]);
console.log(r(fg(Array.from({length:12},(_,i)=>i%3==2?30:15)),540,900));
