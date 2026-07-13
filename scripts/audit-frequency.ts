import fs from 'fs';
import path from 'path';
import { parseGtfsZip } from '../pipeline/parseGtfs';
import { detectReferenceDate } from '../pipeline/transit-calendar';
import { computeRawDepartures } from '../pipeline/transit-phase1';
import { medianHeadwayInWindow } from '../pipeline/headway-utils';

interface AgencyConfig {
  slug: string;
  file: string;
  name: string;
}

const AGENCIES: AgencyConfig[] = [
  { slug: 'barrie', file: 'Barrie Transit.zip', name: 'Barrie Transit' },
  { slug: 'burlington', file: 'Burlington Transit.zip', name: 'Burlington Transit' },
  { slug: 'grt', file: 'Grand River Transit.zip', name: 'Grand River Transit' },
  { slug: 'kingston', file: 'Kingston Transit.zip', name: 'Kingston Transit' },
  { slug: 'oakville', file: 'Oakville Transit.zip', name: 'Oakville Transit' },
];

const GTFS_DIR = '/Users/ryan/Desktop/Data/GTFS/Files/Canada/Ontario/';

interface RouteDirectionCombo {
  agencySlug: string;
  agencyName: string;
  routeId: string;
  routeShortName: string;
  routeLongName: string;
  directionId: string;
  headsign: string;
  headway: number;
}

async function main() {
  const allCombos: RouteDirectionCombo[] = [];

  for (const agency of AGENCIES) {
    const zipPath = path.join(GTFS_DIR, agency.file);
    if (!fs.existsSync(zipPath)) {
      console.error(`ZIP file not found: ${zipPath}`);
      continue;
    }

    console.log(`Processing ${agency.name}...`);
    const buffer = fs.readFileSync(zipPath);
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;

    const gtfs = await parseGtfsZip(arrayBuffer);
    const refDate = detectReferenceDate(gtfs.calendar || [], gtfs.calendarDates || [], gtfs.trips || []);
    console.log(`- Reference date for ${agency.name}: ${refDate}`);

    const rawDeps = computeRawDepartures(gtfs, refDate);
    const wednesdayDeps = rawDeps.filter(d => d.day === 'Wednesday');

    const routeMap = new Map((gtfs.routes || []).map(r => [r.route_id, r]));

    for (const dep of wednesdayDeps) {
      const routeObj = routeMap.get(dep.route);
      const shortName = routeObj?.route_short_name || dep.route;
      const longName = routeObj?.route_long_name || '';

      // Calculate headway in midday window (9:00 AM - 3:00 PM -> 540 to 900 minutes)
      const headway = medianHeadwayInWindow(dep.departureTimes, 540, 900, 3);
      if (headway !== null && headway > 0) {
        allCombos.push({
          agencySlug: agency.slug,
          agencyName: agency.name,
          routeId: dep.route,
          routeShortName: shortName,
          routeLongName: longName,
          directionId: dep.dir,
          headsign: dep.headsign || '',
          headway
        });
      }
    }
  }

  console.log(`Found a total of ${allCombos.length} active route-direction combos with midday weekday headways.`);

  if (allCombos.length < 10) {
    console.error('Not enough active routes found across these agencies.');
    return;
  }

  // Shuffle and pick 10 random combos
  const shuffled = [...allCombos].sort(() => 0.5 - Math.random());
  const selected = shuffled.slice(0, 10);

  // Sort them by agency then route name for a clean checklist table
  selected.sort((a, b) => {
    if (a.agencyName !== b.agencyName) return a.agencyName.localeCompare(b.agencyName);
    return a.routeShortName.localeCompare(b.routeShortName, undefined, { numeric: true, sensitivity: 'base' });
  });

  console.log('\n--- Selected 10 Routes for Audit ---\n');
  
  let mdTable = '| Verification | Agency | Route | Direction | Headsign | Scheduled Midday Headway |\n';
  mdTable += '| :---: | :--- | :--- | :---: | :--- | :---: |\n';

  for (const item of selected) {
    const routeDisplay = item.routeShortName + (item.routeLongName ? ` - ${item.routeLongName}` : '');
    const headsignDisplay = item.headsign ? `\`${item.headsign}\`` : 'N/A';
    mdTable += `| [ ] | ${item.agencyName} | ${routeDisplay} | ${item.directionId} | ${headsignDisplay} | ${item.headway} min |\n`;
  }

  console.log(mdTable);

  // Save the result to a file so we can read it easily or use it in the gh command
  const outPath = path.resolve('tmp/audit-results.md');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, mdTable, 'utf-8');
  console.log(`Saved output table to ${outPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
