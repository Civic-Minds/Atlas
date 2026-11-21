import fs from 'node:fs';
import { computeFrequencySegmentOverlay as after } from '/Users/ryan/Developer/Code/Platforms/Atlas/.claude/worktrees/agent-ae871fec4ff3b70e0/src/utils/frequencySegments';
import { computeFrequencySegmentOverlay as before } from '/Users/ryan/Developer/Code/Platforms/Atlas/.claude/worktrees/agent-ae871fec4ff3b70e0/src/utils/frequencySegmentsMain';
const dir = '/private/tmp/claude-501/-Users-ryan/c8d09263-8b14-4eb3-a210-0831beabea38/scratchpad/v0';
const fc = JSON.parse(fs.readFileSync(`${dir}/ttc.json`, 'utf8'));
const feats = fc.features.filter((f: any) => f.properties?.day === 'Saturday' || f.properties?.stopId);
const layers: any = { ttc: { type: 'FeatureCollection', features: feats } };
for (const [n, fn] of [['before', before], ['after', after]] as const) {
  const segs = (fn as any)(layers, 'midday', 15).segments.filter((s: any) => s.properties.routeId === '86' || s.properties.routeShortName === '86');
  console.log(n, segs.map((s: any) => `${s.properties.directionId}|${s.properties.routeBranch}|${s.properties.headsign}|${s.properties.color}|${s.geometry.coordinates.length}|${s.geometry.coordinates[0]}`));
}
for (const f of feats.filter((f: any) => f.properties.routeShortName === '86' && f.geometry.type === 'LineString')) {
  const p = f.properties; console.log(p.directionId, p.routeBranch, p.headsign, p.stopOrder.length, JSON.stringify(p.sharedStretches), p.stopOrder.map((s: string) => p.stopPeriodHeadways?.[s]?.midday ?? '-').join(' '));
}
