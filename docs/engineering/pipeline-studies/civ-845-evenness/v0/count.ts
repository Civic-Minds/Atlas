import fs from 'node:fs';
import { failingRouteSharedRanges, stretchPieces, lineStopHeadways, findQualifyingStopRanges } from '/Users/ryan/Developer/Code/Platforms/Atlas/.claude/worktrees/agent-ae871fec4ff3b70e0/src/utils/frequencySegments';
import { featurePassesHeadwayFilter } from '/Users/ryan/Developer/Code/Platforms/Atlas/.claude/worktrees/agent-ae871fec4ff3b70e0/shared/routeHeadwayFilter';
import { PERIOD_KEYS } from '/Users/ryan/Developer/Code/Platforms/Atlas/.claude/worktrees/agent-ae871fec4ff3b70e0/shared/config';
import { PUBLIC_TIER_MAXES } from '/Users/ryan/Developer/Code/Platforms/Atlas/.claude/worktrees/agent-ae871fec4ff3b70e0/shared/rules/frequency';

const dir = '/private/tmp/claude-501/-Users-ryan/c8d09263-8b14-4eb3-a210-0831beabea38/scratchpad/v0';
const tier = (h: number) => { const i = PUBLIC_TIER_MAXES.findIndex(m => h <= m); return i < 0 ? PUBLIC_TIER_MAXES.length : i; };
const periods = (PERIOD_KEYS as readonly string[]).filter(p => p !== 'all');
for (const slug of process.argv.slice(2)) {
  const fc = JSON.parse(fs.readFileSync(`${dir}/${slug}.json`, 'utf8'));
  let pieces = 0, better = 0, worse = 0, overstated = 0, ranges = 0, rangesSplit = 0; const routes = new Set<string>();
  const tally = (period: string, from: number, to: number, vals: (i: number) => number | null | undefined, route: string) => {
    ranges++;
    const ps = stretchPieces(period as any, from, to, vals);
    const whole = Math.max(...Array.from({ length: to - from + 1 }, (_, k) => vals(from + k) ?? 0));
    if (ps.length > 1) { rangesSplit++; routes.add(route); }
    for (const p of ps) for (let i = p.from; i < p.to; i++) {
      pieces++;
      const own = Math.max(vals(i) ?? 0, vals(i + 1) ?? 0);
      if (tier(p.headway) < tier(own)) overstated++;           // piece better than its own two stops' worse published value
      if (tier(p.headway) < tier(whole)) better++;
      if (tier(p.headway) > tier(whole)) worse++;
    }
  };
  for (const day of ['Weekday', 'Saturday', 'Sunday']) {
    const feats = fc.features.filter((f: any) => f.properties?.day === day || f.properties?.stopId);
    const lines = feats.filter((f: any) => f.geometry.type === 'LineString');
    for (const period of periods) for (const t of [10, 15, 20, 30, 60]) {
      for (const { feature, ranges: rs, values } of failingRouteSharedRanges(lines, feats, period as any, t)) {
        const p: any = feature.properties;
        for (const [a, b] of rs) tally(period, a, b, i => values.get(i) ?? t, `${p.routeId}|${p.routeBranch}|${p.directionId}|${day}`);
      }
      for (const f of lines) {
        const p: any = f.properties;
        if (!featurePassesHeadwayFilter(p, period as any, t) || !p.stopOrder || p.stopOrder.length < 2) continue;
        const lv = lineStopHeadways(p, period as any);
        const rs = findQualifyingStopRanges(p.stopOrder.map((_: any, i: number) => String(i)), (i: string) => lv[Number(i)], t);
        const full = rs.length === 1 && rs[0][0] === 0 && rs[0][1] === p.stopOrder.length - 1;
        if (full) continue;
        for (const [a, b] of rs) tally(period, a, b, i => lv[i], `${p.routeId}|${p.routeBranch}|${p.directionId}|${day}`);
      }
    }
  }
  console.log(JSON.stringify({ slug, ranges, rangesSplit, pieces, piecesBetter: better, piecesWorse: worse, piecesBelowOwnStops: overstated, routesWithChange: routes.size }));
}
