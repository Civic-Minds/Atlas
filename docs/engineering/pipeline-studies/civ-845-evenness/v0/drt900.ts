import fs from 'node:fs';
import { computeFrequencySegmentOverlay as after } from '/Users/ryan/Developer/Code/Platforms/Atlas/.claude/worktrees/agent-ae871fec4ff3b70e0/src/utils/frequencySegments';
import { computeFrequencySegmentOverlay as before } from '/Users/ryan/Developer/Code/Platforms/Atlas/.claude/worktrees/agent-ae871fec4ff3b70e0/src/utils/frequencySegmentsMain';

const dir = '/private/tmp/claude-501/-Users-ryan/c8d09263-8b14-4eb3-a210-0831beabea38/scratchpad/v0';
const fc = JSON.parse(fs.readFileSync(`${dir}/drt.json`, 'utf8'));
const period = process.argv[2] ?? 'evening';
const thr = Number(process.argv[3] ?? 20);
const feats = fc.features.filter((f: any) => f.properties?.day === 'Weekday' || f.properties?.stopId);
const layers: any = { drt: { type: 'FeatureCollection', features: feats } };
const out: any = { period, thr, routes: {} };
for (const [name, fn] of [['before', before], ['after', after]] as const) {
  const segs = (fn as any)(layers, period, thr).segments.filter((s: any) => s.properties.routeShortName === '900');
  out[name] = segs.map((s: any) => ({
    dir: s.properties.directionId, headsign: s.properties.headsign, color: s.properties.color,
    from: s.geometry.coordinates[0], to: s.geometry.coordinates.at(-1), vertices: s.geometry.coordinates.length,
  }));
}
for (const f of feats.filter((f: any) => f.properties.routeShortName === '900')) {
  const p = f.properties;
  out.routes[`${p.directionId}|${p.headsign}`] = (p.stopOrder as string[]).map((id, i) => [i, p.stopPeriodHeadways?.[id]?.[period] ?? null]);
}
fs.writeFileSync(`${dir}/drt900-${period}-${thr}.json`, JSON.stringify(out, null, 1));
for (const n of ['before', 'after']) { console.log(n, out[n].length); for (const s of out[n]) console.log(' ', s.dir, s.headsign, s.color, s.vertices); }
for (const [k, v] of Object.entries(out.routes)) console.log(k, (v as any[]).map(x => x[1]).join(' '));
