import fs from 'node:fs';
import { failingRouteSharedRanges } from '/Users/ryan/Developer/Code/Platforms/Atlas/.claude/worktrees/agent-ae871fec4ff3b70e0/src/utils/frequencySegments';
const dir = '/private/tmp/claude-501/-Users-ryan/c8d09263-8b14-4eb3-a210-0831beabea38/scratchpad/v0';
const fc = JSON.parse(fs.readFileSync(`${dir}/drt.json`, 'utf8'));
const all = fc.features.filter((f: any) => f.properties.day === 'Weekday' || f.properties.stopId);
const r900 = all.filter((f: any) => f.properties.routeShortName === '900');
console.log(r900.length, r900.map((f: any) => f.properties.directionId + f.properties.headsign));
const out = failingRouteSharedRanges(r900, all, 'evening' as any, 20);
console.log(out.map(o => ({ ranges: o.ranges, vals: [...o.values.entries()].slice(0, 60).map(([i, v]) => i + ':' + v).join(' ') })));
