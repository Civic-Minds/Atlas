import * as fs from 'fs';
import { processGtfsBuffer } from '../pipeline/process-core.ts';

const zipBuf = fs.readFileSync('/Users/ryan/Desktop/Data/GTFS/Files/Canada/Ontario/GO Transit Metrolinx.zip');
const result = await processGtfsBuffer(zipBuf, (msg) => {}, { agencyName: 'GO Transit', center: [43.65, -79.38] });

const lwEast = (result.features as any[]).filter(f =>
  f.properties.shortName === 'LW' && f.properties.directionId === 1 && f.properties.day === 'Weekday'
);
for (const f of lwEast.slice(0, 4)) {
  const p = f.properties;
  const hw = p.stopHeadways;
  console.log('headsign:', p.headsign, '| route headway:', p.headway, '| AL stop headway:', hw?.['AL'] ?? 'n/a', '| stops w/ data:', hw ? Object.keys(hw).length : 0);
}
