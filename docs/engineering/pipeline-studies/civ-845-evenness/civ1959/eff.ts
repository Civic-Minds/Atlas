import { loadPatterns, TF } from '/private/tmp/claude-501/-Users-ryan/c8d09263-8b14-4eb3-a210-0831beabea38/scratchpad/realx.ts';
import { computeStopSharers, buildPooledStopMap, collapseBunched } from '../civ845-evidence/snap/main/pipeline/stopPools.ts';
import { departuresInWindow } from '../civ845-evidence/snap/main/pipeline/headway-utils.ts';
const S = '/private/tmp/claude-501/-Users-ryan/c8d09263-8b14-4eb3-a210-0831beabea38/scratchpad';
TF.f = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
for (const dir of ['0', '1']) {
  const L = loadPatterns(S + '/drt', S + '/drt', '900', dir, '2026-11-18');
  const sp = L.pats.map(p => ({ memberKey: p.key, routeId: p.key.split('|')[0], headsigns: [...p.headsigns].sort(), stopOrder: p.order }));
  const sharers = computeStopSharers(sp, L.stops, L.parent); const depsOf = new Map(L.pats.map(p => [p.key, p.deps]));
  const p = L.pats.slice().sort((a, b) => b.order.length - a.order.length)[0];
  const pooled = buildPooledStopMap(p.deps, sharers.get(p.key), k => depsOf.get(k), L.parent, p.deps);
  const out: string[] = [];
  p.order.forEach((stop: string) => { if (!pooled.pooledStops.has(stop)) { out.push('-'); return; }
    const t = [...(pooled.map.get(stop) ?? [])].sort((a, b) => a - b); const w = collapseBunched(departuresInWindow(t, 1140, 1380, true));
    if (w.length < 3) { out.push('?'); return; } const g = w.slice(1).map((x, i) => x - w[i]); const sum = g.reduce((a, b) => a + b, 0); const sq = g.reduce((a, b) => a + b * b, 0);
    out.push(`${(sq / sum).toFixed(1)}/${Math.max(...g)}`); });
  console.log('dir', dir, p.headsigns.join('|'), 'stops', p.order.length, '\n eff/longest:', out.join(' '));
}
