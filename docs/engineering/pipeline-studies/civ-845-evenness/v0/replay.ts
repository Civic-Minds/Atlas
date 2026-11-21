import fs from 'node:fs';
import { computeFrequencySegmentOverlay as after } from '/Users/ryan/Developer/Code/Platforms/Atlas/.claude/worktrees/agent-ae871fec4ff3b70e0/src/utils/frequencySegments';
import { computeFrequencySegmentOverlay as before } from '/Users/ryan/Developer/Code/Platforms/Atlas/.claude/worktrees/agent-ae871fec4ff3b70e0/src/utils/frequencySegmentsMain';
import { headwayToTierColor } from '/Users/ryan/Developer/Code/Platforms/Atlas/.claude/worktrees/agent-ae871fec4ff3b70e0/src/utils/colors';
import { PERIOD_KEYS } from '/Users/ryan/Developer/Code/Platforms/Atlas/.claude/worktrees/agent-ae871fec4ff3b70e0/shared/config';

const dir = '/private/tmp/claude-501/-Users-ryan/c8d09263-8b14-4eb3-a210-0831beabea38/scratchpad/v0';
const agencies = process.argv.slice(2);
const THRESH = [10, 15, 20, 30, 60];
const rank = new Map<string, number>();
[8, 10, 15, 20, 30, 60, 90].forEach((h, i) => rank.set(headwayToTierColor(h), i));
const periods = (PERIOD_KEYS as readonly string[]).filter(p => p !== 'all');
type E = { k: string; a: number[]; b: number[]; r: number };
const rk = (p: any) => [p.routeId, p.routeBranch, p.directionId, p.headsign, p.day].join('|');
const distSq = (px: number, py: number, a: number[], b: number[]) => {
  const dx = b[0] - a[0], dy = b[1] - a[1]; const l = dx * dx + dy * dy;
  let t = l === 0 ? 0 : ((px - a[0]) * dx + (py - a[1]) * dy) / l; t = Math.max(0, Math.min(1, t));
  const x = a[0] + t * dx - px, y = a[1] + t * dy - py; return x * x + y * y;
};
const edgesOf = (segs: any[]): E[] => {
  const out: E[] = [];
  for (const s of segs) { const c = s.geometry.coordinates; const r = rank.get(s.properties.color) ?? -1; const k = rk(s.properties);
    for (let i = 0; i + 1 < c.length; i++) out.push({ k, a: c[i], b: c[i + 1], r }); }
  return out;
};

for (const slug of agencies) {
  const fc = JSON.parse(fs.readFileSync(`${dir}/${slug}.json`, 'utf8'));
  let better = 0, worse = 0, same = 0, combos = 0, changedCombos = 0, routesChanged = new Set<string>();
  for (const day of ['Weekday', 'Saturday', 'Sunday']) {
    const feats = fc.features.filter((f: any) => f.properties?.day === day || f.properties?.stopId);
    const layers: any = { [slug]: { type: 'FeatureCollection', features: feats } };
    for (const period of periods) for (const t of THRESH) {
      const eb = edgesOf(before(layers, period as any, t).segments), ea = edgesOf(after(layers, period as any, t).segments);
      combos++;
      // Compare at each after-edge's midpoint against the before-edge it lies on (same route key): robust to junction splits.
      const byKey = new Map<string, E[]>(); for (const e of eb) (byKey.get(e.k) ?? byKey.set(e.k, []).get(e.k)!).push(e);
      let changed = false; const covered = new Set<E>();
      for (const e of ea) {
        const mx = (e.a[0] + e.b[0]) / 2, my = (e.a[1] + e.b[1]) / 2;
        const hits = (byKey.get(e.k) ?? []).filter(c => distSq(mx, my, c.a, c.b) <= 1e-12);
        if (!hits.length) { worse++; changed = true; console.log('NEW (not on any before edge)', slug, day, period, t, e.k); continue; }
        hits.forEach(h => covered.add(h));
        // Overlapping before edges of one route key can carry different colours; judge against all of them.
        const lo = Math.min(...hits.map(h => h.r)), hi = Math.max(...hits.map(h => h.r));
        if (e.r < lo) { better++; changed = true; routesChanged.add(slug + '|' + e.k); } else if (e.r > hi) { worse++; changed = true; console.log('WORSE', slug, day, period, t, e.k); } else same++;
      }
      for (const c of eb) if (!covered.has(c)) { // before edge with no after edge on it (split pieces each cover part; midpoint test may miss)
        const mx = (c.a[0] + c.b[0]) / 2, my = (c.a[1] + c.b[1]) / 2;
        const ok = ea.some(e => e.k === c.k && distSq(mx, my, e.a, e.b) <= 1e-12);
        if (!ok) { worse++; changed = true; console.log('DROPPED', slug, day, period, t, c.k); }
      }
      if (changed) changedCombos++;
    }
  }
  console.log(JSON.stringify({ slug, combos, changedCombos, afterEdgesBetter: better, afterEdgesWorse: worse, afterEdgesSame: same, routeDirDayChanged: routesChanged.size }));
}
