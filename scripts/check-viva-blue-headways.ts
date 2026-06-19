import * as fs from 'fs';
import { processGtfsBuffer } from '../pipeline/process-core.ts';

const buf = fs.readFileSync('/Users/ryan/Desktop/Data/GTFS/Files/Canada/Ontario/York Region Transit.zip');
const result = await processGtfsBuffer(buf);
const fc = JSON.parse(result.geojson);

// Show all "blue" variants
const blues = fc.features.filter((f: any) =>
  (f.properties.routeShortName ?? '').toLowerCase().includes('blue') &&
  f.properties.day === 'Weekday'
);
for (const f of blues) {
  const p = f.properties;
  const hws: number[] = p.stopHeadways ? Object.values(p.stopHeadways) : [];
  console.log(`\n[${p.routeShortName}] dir=${p.directionId} "${p.headsign ?? '(none)'}"`);
  console.log(`  headway=${p.headway}, tier=${p.tier}, minStopHeadway=${p.minStopHeadway}`);
  if (hws.length) {
    console.log(`  stopHeadways: ${hws.length} stops, min=${Math.min(...hws)}, max=${Math.max(...hws)}`);
  }
  console.log(`  headwayByPeriod: ${JSON.stringify(p.headwayByPeriod)}`);
  console.log(`  minStopHeadwayByPeriod: ${JSON.stringify(p.minStopHeadwayByPeriod)}`);
}

// Spot-check a GO route with known short-turns (GO Lakeshore West)
const goFile = fs.readFileSync('/Users/ryan/Desktop/Data/GTFS/Files/Canada/Ontario/GO Transit.zip');
const goResult = await processGtfsBuffer(goFile);
const goFc = JSON.parse(goResult.geojson);
const lw = goFc.features.filter((f: any) =>
  (f.properties.routeShortName ?? '') === 'LW' &&
  f.properties.day === 'Weekday' &&
  f.properties.directionId === 0
);
console.log('\n=== GO Lakeshore West Westbound Weekday ===');
for (const f of lw) {
  const p = f.properties;
  const hws: number[] = p.stopHeadways ? Object.values(p.stopHeadways) : [];
  console.log(`\n"${p.headsign ?? '(none)'}"  headway=${p.headway}, tier=${p.tier}, minStopHeadway=${p.minStopHeadway}`);
  if (hws.length) console.log(`  stops: ${hws.length}, min=${Math.min(...hws)}, max=${Math.max(...hws)}`);
  console.log(`  headwayByPeriod: ${JSON.stringify(p.headwayByPeriod)}`);
}
