import { load, referenceOrder, stopLists, metrics, pubValue, tierOf, type Metrics } from './replay.ts';
import { pooledReadingInWindow, collapseBunched } from '/Users/ryan/Developer/Code/Platforms/Atlas/pipeline/stopPools.ts';
import { departuresInWindow } from '/Users/ryan/Developer/Code/Platforms/Atlas/pipeline/headway-utils.ts';
const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pct = (a: number[], q: number) => { const s=[...a].sort((x,y)=>x-y); return s[Math.floor((s.length-1)*q)]; };

export function analyse(label: string, dir: string, route: string, dirId: string, date: string, start: number, end: number, filter: number, headsign?: string, verbose = false, ownHeadsign?: string) {
  const { trips, st } = load(dir, route, dirId, date, headsign ? h => h === headsign : undefined);
  const order = referenceOrder(st); const lists = stopLists(st, order);
  const ownBy = new Map<string, number[]>();
  if (ownHeadsign) { const o = load(dir, route, dirId, date, h => h === ownHeadsign); for (const l of o.st.values()) for (const x of l) { const e = ownBy.get(x.stop) ?? []; e.push(x.dep); ownBy.set(x.stop, e); } }
  const ms = lists.map(l => metrics(l.deps, start, end, ownHeadsign ? (ownBy.get(l.stopId) ?? []) : undefined));
  // stretches: maximal runs with identical serving pattern sets
  const key = lists.map(l => [...l.patterns].sort().join('+'));
  const stretches: [number, number][] = []; let s0 = 0;
  for (let i = 1; i <= lists.length; i++) if (i === lists.length || key[i] !== key[s0]) { stretches.push([s0, i - 1]); s0 = i; }
  console.log(`\n##### ${label}  trips=${trips.length} stops=${lists.length} window=${start/60}-${end/60}h filter<=${filter}`);
  const tot: Record<string, any> = {};
  for (const [a, b] of stretches) {
    const n = b - a + 1; if (n < 3) continue;
    const idx = Array.from({ length: n }, (_, k) => a + k);
    const valid = idx.filter(i => ms[i].n >= 3);
    if (valid.length < 3) continue;
    const pub = valid.map(i => pubValue(ms[i])!);
    const W = valid.map(i => ms[i].worst!), A = valid.map(i => ms[i].avg!), R = valid.map(i => ms[i].rider!), M = valid.map(i => ms[i].median!);
    const rules: Record<string, number[]> = {
      pub_today: pub,
      worst: valid.map(() => med(W)),
      average: valid.map(() => med(A)),
      riderwait: valid.map(() => med(R)),
      median: valid.map(() => med(M)),
      pub_median: valid.map(() => med(pub)),
      median_cap1: valid.map((_, k) => Math.max(med(M), pub[k] - 1)),
    };
    // one-unit pooled reading on the stretch's middle stop list
    const mid = valid[valid.length >> 1]; const mr = pooledReadingInWindow(lists[mid].deps, start, end, 3, false, ownHeadsign ? ownBy.get(lists[mid].stopId) : undefined);
    rules['unit_pooled_gate'] = valid.map(() => (mr.value ?? mr.worstWait)!);
    const sig = key[a];
    const pieces = (vals: number[]) => { let p = 1; for (let i = 1; i < vals.length; i++) if (tierOf(vals[i]) !== tierOf(vals[i - 1]) || (vals[i] <= filter) !== (vals[i - 1] <= filter)) p++; return p; };
    console.log(`stretch idx ${a}-${b} (${n} stops, ${valid.length} valued) buses=${sig}  trips/stop ~${med(valid.map(i => ms[i].n))}`);
    for (const [r, v] of Object.entries(rules)) {
      const t = new Set(v.map(x => tierOf(x))), ps = v.filter(x => x <= filter).length;
      const mn = Math.min(...v), mx = Math.max(...v);
      console.log(`   ${r.padEnd(16)} value ${mn === mx ? mn.toFixed(1) : mn.toFixed(0) + '-' + mx.toFixed(0)}  tiers {${[...t].join(',')}}  pieces ${pieces(v)}  pass@${filter}: ${ps}/${v.length}`);
      const e = (tot[r] ??= { changeTier: 0, changePass: 0, stops: 0, unitOK: 0, better: 0, worse: 0, strN: 0 } as any); e.strN++;
      e.stops += v.length; e.unitOK += pieces(v) === 1 ? 1 : 0;
      v.forEach((x, k) => { if (x < pub[k] - 1) e.better++; if (x > pub[k] + 1) e.worse++; if (tierOf(x) !== tierOf(pub[k])) e.changeTier++; if ((x <= filter) !== (pub[k] <= filter)) e.changePass++; });
    }
    console.log(`   raw per-stop spread: worst ${Math.min(...W)}-${Math.max(...W)}, mean gap ${Math.min(...A).toFixed(1)}-${Math.max(...A).toFixed(1)}, median ${Math.min(...M)}-${Math.max(...M)}, pub ${Math.min(...pub)}-${Math.max(...pub)} (distinct ${new Set(pub).size})`);
    if (verbose) console.log('   pub by stop:', pub.join(' '));
  }
  (globalThis as any).__tot = tot; return { tot, stretches, ms, lists };
}
