import * as fs from 'fs';
import { processGtfsBuffer } from '../pipeline/process-core.ts';

const buf = fs.readFileSync('/Users/ryan/Desktop/Data/GTFS/Files/Canada/Ontario/GO Transit.zip');
const result = await processGtfsBuffer(buf);
const fc = JSON.parse(result.geojson);

const lw = fc.features.filter((f: any) =>
  f.properties.routeShortName === 'LW' &&
  f.properties.day === 'Weekday' &&
  f.properties.directionId === 0 &&
  f.properties.headsign
);

for (const f of lw) {
  const p = f.properties;
  console.log(`"${p.headsign}"`);
  console.log(`  headway=${p.headway} tier=${p.tier}`);
  console.log(`  headwayByPeriod: ${JSON.stringify(p.headwayByPeriod)}`);
  console.log(`  minStopHeadwayByPeriod: ${JSON.stringify(p.minStopHeadwayByPeriod)}`);
  console.log();
}
