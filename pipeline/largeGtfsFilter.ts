import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

/** Archives above this size can exceed V8's maximum string length in JSZip. */
export const LARGE_GTFS_ZIP_THRESHOLD_BYTES = 100 * 1024 * 1024;

type CsvRow = Record<string, string>;

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        value += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      values.push(value);
      value = '';
    } else {
      value += char;
    }
  }
  values.push(value);
  return values;
}

function* linesFromBytes(data: Uint8Array): Generator<string> {
  let start = 0;
  for (let i = 0; i < data.length; i++) {
    if (data[i] !== 10) continue;
    const line = strFromU8(data.subarray(start, i)).replace(/\r$/, '');
    start = i + 1;
    yield line;
  }
  if (start < data.length) yield strFromU8(data.subarray(start));
}

function findFile(files: Record<string, Uint8Array>, filename: string): Uint8Array | undefined {
  const key = Object.keys(files).find(name => name === filename || name.endsWith(`/${filename}`));
  return key ? files[key] : undefined;
}

function filterRows(
  data: Uint8Array,
  predicate: (row: CsvRow) => boolean,
): { header: string; rows: string[]; parsed: CsvRow[] } {
  const iterator = linesFromBytes(data);
  const first = iterator.next();
  if (first.done) return { header: '', rows: [], parsed: [] };
  const headers = parseCsvLine(first.value);
  const rows: string[] = [];
  const parsed: CsvRow[] = [];
  for (const line of iterator) {
    if (!line) continue;
    const values = parseCsvLine(line);
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
    if (predicate(row)) {
      rows.push(line);
      parsed.push(row);
    }
  }
  return { header: first.value, rows, parsed };
}

function csvBytes(header: string, rows: string[]): Uint8Array {
  return strToU8([header, ...rows].filter(Boolean).join('\n') + '\n');
}

function requiredFile(files: Record<string, Uint8Array>, filename: string): Uint8Array {
  const data = findFile(files, filename);
  if (!data) throw new Error(`Large GTFS filter: missing required ${filename}`);
  return data;
}

/**
 * Reduce a large multi-agency GTFS archive to one agency before JSZip parses it.
 * The normal parser remains responsible for validation and all downstream work.
 */
export function filterLargeGtfsZipByAgencyId(buffer: Buffer, agencyId: string): Buffer {
  const files = unzipSync(new Uint8Array(buffer));
  const agencyData = requiredFile(files, 'agency.txt');
  const agency = filterRows(agencyData, row => row.agency_id === agencyId);
  if (agency.parsed.length === 0) {
    throw new Error(`Large GTFS filter: agency_id not found: ${agencyId}`);
  }

  const routes = filterRows(requiredFile(files, 'routes.txt'), row => row.agency_id === agencyId);
  const routeIds = new Set(routes.parsed.map(row => row.route_id));
  const trips = filterRows(requiredFile(files, 'trips.txt'), row => routeIds.has(row.route_id));
  const tripIds = new Set(trips.parsed.map(row => row.trip_id));
  const shapeIds = new Set(trips.parsed.map(row => row.shape_id).filter(Boolean));
  const serviceIds = new Set(trips.parsed.map(row => row.service_id));
  const stopTimes = filterRows(requiredFile(files, 'stop_times.txt'), row => tripIds.has(row.trip_id));
  const stopIds = new Set(stopTimes.parsed.map(row => row.stop_id).filter(Boolean));

  const output: Record<string, Uint8Array> = {};
  output['agency.txt'] = csvBytes(agency.header, agency.rows);
  output['routes.txt'] = csvBytes(routes.header, routes.rows);
  output['trips.txt'] = csvBytes(trips.header, trips.rows);
  output['stop_times.txt'] = csvBytes(stopTimes.header, stopTimes.rows);
  const stops = filterRows(requiredFile(files, 'stops.txt'), row => stopIds.has(row.stop_id));
  output['stops.txt'] = csvBytes(stops.header, stops.rows);

  for (const filename of ['shapes.txt', 'calendar.txt', 'calendar_dates.txt', 'frequencies.txt', 'fare_attributes.txt', 'fare_rules.txt'] as const) {
    const data = findFile(files, filename);
    if (!data) continue;
    const filtered = filterRows(data, row =>
      filename === 'shapes.txt' ? shapeIds.has(row.shape_id) :
        filename === 'calendar.txt' || filename === 'calendar_dates.txt' ? serviceIds.has(row.service_id) :
        filename === 'frequencies.txt' ? tripIds.has(row.trip_id) :
          filename === 'fare_attributes.txt' ? !row.agency_id || row.agency_id === agencyId : routeIds.has(row.route_id),
    );
    output[filename] = csvBytes(filtered.header, filtered.rows);
  }

  for (const filename of ['feed_info.txt', 'fare_products.txt', 'rider_categories.txt', 'fare_leg_rules.txt'] as const) {
    const data = findFile(files, filename);
    if (data) output[filename] = data;
  }

  return Buffer.from(zipSync(output, { level: 1 }));
}

export function maybeFilterLargeGtfsZip(
  buffer: Buffer,
  agencyId: string | undefined,
  onStatus?: (message: string) => void,
): Buffer {
  if (!agencyId || buffer.length <= LARGE_GTFS_ZIP_THRESHOLD_BYTES) return buffer;
  onStatus?.(`Large feed: filtering agency_id=${agencyId} before parsing...`);
  return filterLargeGtfsZipByAgencyId(buffer, agencyId);
}
