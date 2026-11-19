import sys
p = sys.argv[1]
s = open(p).read()
s = s.replace("import { PERIOD_KEYS } from '../../shared/config';\n", "import { PERIOD_KEYS } from '../../shared/config';\nimport { PUBLIC_TIER_MAXES } from '../../shared/rules/frequency';\n", 1)
helper = '''/** A headway's public tier as an index, fastest first; past the last public tier is one more. */
const publicTierIndex = (h: number): number => {
  const i = PUBLIC_TIER_MAXES.findIndex(m => h <= m);
  return i < 0 ? PUBLIC_TIER_MAXES.length : i;
};

export interface StretchPiece { from: number; to: number; headway: number }

/**
 * The pieces a drawn stretch (stops `from` to `to`) is coloured in. Normally one piece in the worst stop's value. #1093 V0
 * (display only): an end stop that is a public tier worse than every other stop on the stretch colours only its own end
 * piece (that stop and its neighbour); the rest of the stretch takes the worst of the remaining stops. Each piece stays at
 * least as bad as the worse of its own two stops, so no piece shows better service than its stops' published values.
 * Needs 3 or more valued stops; map periods only (the all-day value keeps the one-colour rule). No published value changes.
 */
export function stretchPieces(
  period: TimePeriod,
  from: number,
  to: number,
  valueAt: (i: number) => number | null | undefined,
): StretchPiece[] {
  const vals: Array<{ i: number; v: number }> = [];
  for (let i = from; i <= to; i++) { const v = valueAt(i); if (v != null) vals.push({ i, v }); }
  if (vals.length === 0) return [];
  const whole = (): StretchPiece[] => [{ from, to, headway: Math.max(...vals.map(x => x.v)) }];
  if (period === 'all' || vals.length < 3 || to - from < 2) return whole();
  const tierOf = (i: number) => { const v = valueAt(i); return v == null ? null : publicTierIndex(v); };
  const peels = (end: number, others: number[]): boolean => {
    const t = tierOf(end);
    if (t == null) return false;
    return others.every(i => { const o = tierOf(i); return o == null || t > o; });
  };
  const all = vals.map(x => x.i);
  const startPeels = peels(from, all.filter(i => i !== from));
  const endPeels = peels(to, all.filter(i => i !== to));
  if (!startPeels && !endPeels) return whole();
  const inner = { from: startPeels ? from + 1 : from, to: endPeels ? to - 1 : to };
  const innerVals = vals.filter(x => x.i >= inner.from && x.i <= inner.to).map(x => x.v);
  const pieces: StretchPiece[] = [];
  if (startPeels) pieces.push({ from, to: from + 1, headway: Math.max(valueAt(from)!, valueAt(from + 1) ?? 0) });
  if (innerVals.length > 0 && inner.to > inner.from) pieces.push({ from: inner.from, to: inner.to, headway: Math.max(...innerVals) });
  if (endPeels) pieces.push({ from: to - 1, to, headway: Math.max(valueAt(to)!, valueAt(to - 1) ?? 0) });
  return pieces;
}

'''
s = s.replace("/** The overlay's per-stop pass for routes that FAIL", helper + "/** The overlay's per-stop pass for routes that FAIL", 1)
a = s.index("      const clipped = clipBetweenStopIndices((feature.geometry as GeoJSON.LineString).coordinates, p.stopPositions!, from, to);")
b = s.index("    }\n  }\n}\n\n/**\n * Client-side stand-in", a)
new1 = '''      for (const piece of stretchPieces(period, from, to, i => values.get(i) ?? maxHeadway)) {
        const clipped = clipBetweenStopIndices((feature.geometry as GeoJSON.LineString).coordinates, p.stopPositions!, piece.from, piece.to);
        if (!clipped) continue;
        segments.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: clipped },
          properties: {
            // Same tier palette as every route line; an end stop a tier worse colours only its own piece (#1093).
            color: headwayToTierColor(piece.headway || maxHeadway, colorMode),
            agencySlug: p.agencySlug ?? slug,
            routeId: p.routeId,
            routeBranch: (p as any).routeBranch ?? null,
            // The route's names and type, so a route drawn only by its segments is named and counted like its line (#1090).
            routeShortName: p.routeShortName ?? null,
            routeLongName: p.routeLongName ?? null,
            routeType: (p as any).routeType ?? null,
            directionId: p.directionId,
            headsign: p.headsign ?? null,
            day: p.day ?? null,
          },
        });
      }
'''
s = s[:a] + new1 + s[b:]
a = s.index("        const clipped = clipBetweenStopIndices(coords, stopPositions, from, to);")
b = s.index("      markPartial(p, slug);", a)
new2 = '''        for (const piece of stretchPieces(period, from, to, i => lineValues[i])) {
          const clipped = clipBetweenStopIndices(coords, stopPositions, piece.from, piece.to);
          if (!clipped) continue;
          segments.push({
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: clipped },
            properties: {
              color: headwayToTierColor(piece.headway, colorMode),
              agencySlug: p.agencySlug ?? slug,
              routeId: p.routeId,
              routeBranch: (p as any).routeBranch ?? null,
              // The route's names and type, so a route drawn only by its segments is named and counted like its line (#1090).
              routeShortName: p.routeShortName ?? null,
              routeLongName: p.routeLongName ?? null,
              routeType: (p as any).routeType ?? null,
              directionId: p.directionId,
              headsign: p.headsign ?? null,
              day: p.day ?? null,
            },
          });
        }
      }

'''
s = s[:a] + new2 + s[b:]
open(p, 'w').write(s)
