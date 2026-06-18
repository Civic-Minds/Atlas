import * as fs from 'fs';
import { processGtfsBuffer } from '../pipeline/process-core.ts';

const buf = fs.readFileSync('/Users/ryan/Desktop/Data/GTFS/Files/Canada/Ontario/York Region Transit.zip');
const result = await processGtfsBuffer(buf, () => {}, { agencyName: 'YRT', center: [43.85, -79.46] });
const fc = JSON.parse(result.geojson);

const viva = (fc.features as any[]).filter((f: any) =>
  f.properties.routeShortName === 'VIVA blue' || (f.properties.routeShortName ?? '').toLowerCase().includes('blue')
);

for (const f of (viva as any[]).slice(0, 6)) {
  const p = f.properties;
  const hw = p.stopHeadways;
  const order = p.stopOrder as string[] | undefined;
  const pos = p.stopPositions as number[] | undefined;
  const nStops = order?.length ?? 0;
  const nWithHw = hw ? Object.keys(hw).length : 0;
  // Show headway range across stops
  const hws = hw ? Object.values(hw as Record<string, number>) : [];
  const minHw = hws.length ? Math.min(...hws) : null;
  const maxHw = hws.length ? Math.max(...hws) : null;
  console.log(
    `dir=${p.directionId} day=${p.day} headsign="${p.headsign}" headway=${p.headway}`,
    `| stops ordered:${nStops} withHw:${nWithHw}`,
    `| stopHw range: ${minHw}–${maxHw} min`,
    pos ? `| t: ${pos[0]}…${pos[pos.length-1]}` : '',
  );
}
