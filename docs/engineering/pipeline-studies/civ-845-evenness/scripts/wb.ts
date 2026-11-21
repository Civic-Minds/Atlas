// Item 1: real gaps at DRT 900 WB weekday evening (19:00-23:00), stops idx 34-42 of the shared section (replay of the published schedule).
import { loadPatterns, TF } from '../realx.ts';
import { computeStopSharers, buildPooledStopMap, pooledReadingInWindow, collapseBunched } from './snap/main/pipeline/stopPools.ts';
import { departuresInWindow } from './snap/main/pipeline/headway-utils.ts';
const S = '/private/tmp/claude-501/-Users-ryan/c8d09263-8b14-4eb3-a210-0831beabea38/scratchpad';
TF.f = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const L = loadPatterns(S + '/drt', S + '/drt', '900', '1', '2026-11-18');
const sp = L.pats.map(p => ({ memberKey: p.key, routeId: p.key.split('|')[0], headsigns: [...p.headsigns].sort(), stopOrder: p.order }));
const sharers = computeStopSharers(sp, L.stops, L.parent); const depsOf = new Map(L.pats.map(p => [p.key, p.deps]));
const hm = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
const p = L.pats.filter(x => x.order.length >= 40).sort((a, b) => b.order.length - a.order.length).find(x => x.headsigns.includes('Pickering Parkway Terminal')) ?? L.pats[0];
console.log('pattern', p.key, 'headsigns', p.headsigns.join('|'), 'stops', p.order.length);
const pooled = buildPooledStopMap(p.deps, sharers.get(p.key), k => depsOf.get(k), L.parent, p.deps);
for (const idx of [30, 33, 34, 38, 42]) {
  const stop = p.order[idx]; const own = [...(p.deps.get(stop) ?? [])].sort((a, b) => a - b); const times = [...(pooled.map.get(stop) ?? own)].sort((a, b) => a - b);
  const w = collapseBunched(departuresInWindow(times, 1140, 1380, true)); const g = w.slice(1).map((t, i) => t - w[i]);
  const rd = pooledReadingInWindow(times, 1140, 1380, 3, false, own);
  const half = (a: number, b: number) => { const x = w.filter(t => t >= a && t < b); const gg = x.slice(1).map((t, i) => t - x[i]); return `n${x.length} mean ${(gg.reduce((s, y) => s + y, 0) / gg.length).toFixed(1)} longest ${Math.max(...gg)}`; };
  console.log(`\nidx ${idx} stop ${stop}: pooled departures ${w.length}; mean gap ${((w[w.length - 1] - w[0]) / (w.length - 1)).toFixed(2)}; longest ${Math.max(...g)}; reading ${JSON.stringify(rd)}`);
  console.log('  times', w.map(hm).join(' ')); console.log('  gaps ', g.join(' '));
  console.log('  19:00-21:00', half(1140, 1260), '| 21:00-23:00', half(1260, 1380));
  const o = collapseBunched(departuresInWindow(own, 1140, 1380, true)); console.log('  own-pattern gaps', o.slice(1).map((t, i) => t - o[i]).join(' '), 'own times', o.map(hm).join(' '));
}
