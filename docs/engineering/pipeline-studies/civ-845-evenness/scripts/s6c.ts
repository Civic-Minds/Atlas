import { csv, loadPatterns, TF } from './realx.ts';
// independent: raw seconds from stop_times
const dir='drt'; const route='900', dirId='0', date='2026-11-18';
const routes=csv(dir+'/routes.txt').filter(r=>r.route_short_name===route).map(r=>r.route_id);
const dow='wednesday', ymd='20261118';
const svc=new Set(csv(dir+'/calendar.txt').filter(c=>c[dow]==='1'&&c.start_date<=ymd&&c.end_date>=ymd).map(c=>c.service_id));
const trips=new Set(csv(dir+'/trips.txt').filter(t=>routes.includes(t.route_id)&&svc.has(t.service_id)&&t.direction_id===dirId).map(t=>t.trip_id));
const want=new Set(['2220','434','1181','2603','1242']);
const by=new Map<string,number[]>();
for(const r of csv(dir+'/stop_times.txt')){ if(!trips.has(r.trip_id)||!want.has(r.stop_id))continue; const [h,m,s]=(r.departure_time||r.arrival_time).split(':').map(Number); const t=h*60+m+s/60; (by.get(r.stop_id)??by.set(r.stop_id,[]).get(r.stop_id)!).push(t); }
for(const [st,ts] of by){ const w=[...new Set(ts)].filter(t=>t>=1140&&t<1380+1).sort((a,b)=>a-b);
 const g=w.slice(1).map((t,i)=>+(t-w[i]).toFixed(2)); const mean=(w[w.length-1]-w[0])/(w.length-1);
 console.log(st,'deps',w.length,'times',w.map(t=>{const h=Math.floor(t/60),m=Math.floor(t%60),s=Math.round((t-Math.floor(t))*60);return `${h}:${String(m).padStart(2,'0')}`}).join(' '));
 console.log('  gaps(sec precision)',g.join(','),'mean',mean.toFixed(2),'max',Math.max(...g)); }
