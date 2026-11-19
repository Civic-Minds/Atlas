import { csv, loadPatterns, readAll } from './real.ts';
const S='/private/tmp/claude-501/-Users-ryan/c8d09263-8b14-4eb3-a210-0831beabea38/scratchpad';
const tmin=(s:string)=>{const [h,m]=s.split(':').map(Number);return h*60+m;};
type E={t:number;trip:string};
function labelled(dir:string,shortName:string,dirId:string,date:string){
  const routes=csv(`${dir}/routes.txt`).filter(r=>r.route_short_name===shortName).map(r=>r.route_id);
  const dow=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][new Date(date+'T12:00:00').getDay()]; const ymd=date.replace(/-/g,'');
  const svc=new Set(csv(`${dir}/calendar.txt`).filter(c=>c[dow]==='1'&&c.start_date<=ymd&&c.end_date>=ymd).map(c=>c.service_id));
  const trips=csv(`${dir}/trips.txt`).filter(t=>routes.includes(t.route_id)&&svc.has(t.service_id)&&t.direction_id===dirId&&t.shape_id);
  const byId=new Map(trips.map(t=>[t.trip_id,t])); const st=new Map<string,any[]>();
  for(const r of csv(`${dir}/stop_times.txt`)){ if(!byId.has(r.trip_id))continue; const l=st.get(r.trip_id)??[]; l.push({stop:r.stop_id,dep:tmin(r.departure_time||r.arrival_time),seq:Number(r.stop_sequence),pu:r.pickup_type}); st.set(r.trip_id,l);}
  const depsT=new Map<string,Map<string,E[]>>(); const tripDep=new Map<string,Map<string,number>>(); const tripPat=new Map<string,string>();
  for(const t of trips){ const l=(st.get(t.trip_id)??[]).sort((a,b)=>a.seq-b.seq); if(l.length<2)continue; const key=`${t.route_id}|sh|${t.shape_id}`;
    let m=depsT.get(key); if(!m){m=new Map();depsT.set(key,m);} const s2=new Set<string>(); const td=new Map<string,number>();
    for(const x of l){ if(s2.has(x.stop))continue; s2.add(x.stop); if(x.pu==='1')continue; const a=m.get(x.stop)??[]; a.push({t:x.dep,trip:t.trip_id}); m.set(x.stop,a); td.set(x.stop,x.dep);} tripDep.set(t.trip_id,td); tripPat.set(t.trip_id,key);}
  return {depsT,tripDep,tripPat};
}
const f=(m:number)=>`${Math.floor(m/60)}:${String(m%60).padStart(2,'0')}`;
const raw=(dir:string,trip:string,stop:string)=>{ return '' };
const [dirId,stops]=[process.argv[2],process.argv.slice(3)];
const LT=labelled(S+'/drt','900',dirId,'2026-11-18');
// raw stop_times text for exactness
const rawst=new Map<string,string>();
for(const r of csv(S+'/drt/stop_times.txt')) if(stops.includes(r.stop_id)) rawst.set(r.trip_id+'|'+r.stop_id,r.departure_time+'/'+r.arrival_time+'/tp'+(r.timepoint??'?'));
const tripsRoute=new Map(csv(S+'/drt/trips.txt').map(t=>[t.trip_id,t]));
for(const stop of stops){ const all:E[]=[]; for(const m of LT.depsT.values()) all.push(...(m.get(stop)??[])); all.sort((a,b)=>a.t-b.t);
  console.log('== stop',stop,'all trips',all.length); let prev=0;
  for(const e of all){ if(e.t<1080||e.t>1440) continue; console.log(' ',f(e.t),'gap',prev?e.t-prev:'-', e.trip.slice(-9),'raw',rawst.get(e.trip+'|'+stop),'hs',tripsRoute.get(e.trip)?.trip_headsign); prev=e.t; } }
