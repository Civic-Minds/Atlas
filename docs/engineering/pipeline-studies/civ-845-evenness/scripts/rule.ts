import { loadPatterns, readAll, type Reading } from './real.ts';
import { pooledReadingInWindow } from '/Users/ryan/Developer/Code/Platforms/Atlas/pipeline/stopPools.ts';
import { buildPooledStopMap } from '/Users/ryan/Developer/Code/Platforms/Atlas/pipeline/stopPools.ts';
const S='/private/tmp/claude-501/-Users-ryan/c8d09263-8b14-4eb3-a210-0831beabea38/scratchpad';

export function runCase(label:string, dir:string, stopsDir:string, route:string, dirId:string, date:string, start:number, end:number, filter:number, verbose=false) {
  const L = loadPatterns(S+'/'+dir, S+'/'+stopsDir, route, dirId, date);
  const { out, sharers } = readAll(L, start, end);
  const depsOf = new Map(L.pats.map(p => [p.key, p.deps]));
  // per (stop) choose the dominant pattern (most own trips at the stop)
  type Row = { pub: number|null; A: number|null; B: number|null; A2: number|null; stretchLen: number; pooled: boolean };
  const best = new Map<string, { n: number; row: Row }>();
  for (const p of L.pats) {
    const rs = out.get(p.key)!;
    const pooled = buildPooledStopMap(p.deps, sharers.get(p.key), k => depsOf.get(k), L.parent, p.deps);
    const sig = rs.map(r => r.pooled ? [...r.sharers].sort().join('+') : '');
    let a = 0;
    for (let i = 1; i <= rs.length; i++) if (i === rs.length || sig[i] !== sig[a]) {
      const idx = Array.from({ length: i - a }, (_, k) => a + k).filter(j => rs[j].n >= 3 || rs[j].pub != null);
      const run = rs.slice(a, i);
      if (idx.length) {
        const midJ = idx[idx.length >> 1];
        const fullJ = idx.reduce((b, j) => rs[j].n > rs[b].n ? j : b, idx[0]);
        const read = (j: number) => {
          const r = rs[j]; if (!r.pooled) return { A: r.pub, B: r.pub };
          const times = [...(pooled.map.get(r.stop) ?? [])].sort((x, y) => x - y);
          const own = [...(p.deps.get(r.stop) ?? [])].sort((x, y) => x - y);
          const g = pooledReadingInWindow(times, start, end, 3, false, own);
          return { A: g.value ?? g.worstWait ?? r.pub, B: g.value ?? r.own ?? g.worstWait };
        };
        const m = read(midJ), f = read(fullJ);
        for (let j = a; j < i; j++) {
          const r = rs[j]; if (r.pub == null) continue;
          const own = p.deps.get(r.stop)?.length ?? 0;
          const cur = best.get(r.stop);
          if (!cur || own > cur.n) best.set(r.stop, { n: own, row: { pub: r.pub, A: m.A, B: m.B, A2: f.A, stretchLen: i - a, pooled: r.pooled } });
        }
      }
      a = i;
    }
  }
  const T = { stops: 0, pooledStops: 0 } as any;
  for (const v of ['A','B','A2']) T[v] = { pf: 0, pfU20: 0, pf20eq: 0, fp: 0, fpO20: 0 };
  for (const { row } of best.values()) {
    T.stops++; if (row.pooled) T.pooledStops++;
    for (const v of ['A','B','A2'] as const) {
      const nv = row[v]; if (nv == null) continue;
      const wasPass = row.pub! <= filter, nowPass = nv <= filter;
      if (wasPass && !nowPass) { T[v].pf++; if (row.pub! < 20) T[v].pfU20++; else T[v].pf20eq++; }
      if (!wasPass && nowPass) { T[v].fp++; if (row.pub! > 20) T[v].fpO20++; }
    }
  }
  console.log(label.padEnd(12), 'patterns', L.pats.length, 'stops', T.stops, 'pooled', T.pooledStops, '| A(worst) pass->fail', T.A.pf, '(pub<20:', T.A.pfU20, ') fail->pass', T.A.fp, '| B(own-fallback) pf', T.B.pf, '(<20:', T.B.pfU20, ') fp', T.B.fp, '| A2(fullest stop) pf', T.A2.pf, '(<20:', T.A2.pfU20, ') fp', T.A2.fp);
  return T;
}
if (process.argv[2] === 'all') {
  const cases:[string,string,string,string,string,string,number,number,number][]=[
   ['900 EB eve','drt','drt','900','0','2026-11-18',1140,1380,20],['900 WB eve','drt','drt','900','1','2026-11-18',1140,1380,20],
   ['901 N AM','drt','drt','901','0','2026-11-18',360,540,20],['901 S AM','drt','drt','901','1','2026-11-18',360,540,20],
   ['901 N eve','drt','drt','901','0','2026-11-18',1140,1380,20],['901 S eve','drt','drt','901','1','2026-11-18',1140,1380,20],
   ['102 N eve','ttc102','ttc','102','1','2026-10-21',1140,1380,20],['102 S eve','ttc102','ttc','102','0','2026-10-21',1140,1380,20],
   ['102 N mid','ttc102','ttc','102','1','2026-10-21',540,900,15],['102 S mid','ttc102','ttc','102','0','2026-10-21',540,900,15],
   ['102 N am','ttc102','ttc','102','1','2026-10-21',360,540,15],['102 S am','ttc102','ttc','102','0','2026-10-21',360,540,15]];
  const tot:any={}; 
  for (const c of cases) { const T=runCase(...c); for (const v of ['A','B','A2']) for (const k of Object.keys(T[v])) { (tot[v]??={}); tot[v][k]=(tot[v][k]??0)+T[v][k]; } tot.stops=(tot.stops??0)+T.stops; }
  console.log('TOTAL', JSON.stringify(tot));
}
