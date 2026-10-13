/** Ranking of the "large metro" list from the committed official population files. Pure, no I/O. */

export interface LargeMetro {
  country: 'United States' | 'Canada';
  /** The official name as the boundary services give it (Census BASENAME, StatCan CMA name). */
  name: string;
  population: number;
  rank: number;
}

export const TOP_US = 50;
export const TOP_CA = 10;

/** Minimal CSV reader: quoted fields, header row. */
export function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows;
  return body.map(r => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

/** Key for matching an area's official name: no parentheticals, no spacing around hyphens, lower case. */
export function metroKey(name: string): string {
  return name.replace(/\([^)]*\)/g, '').replace(/\s*-\s*/g, '-').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function rankLargeMetros(usCsv: string, caCsv: string): LargeMetro[] {
  const us = parseCsv(usCsv)
    .filter(r => r.LSAD === 'Metropolitan Statistical Area')
    .map(r => ({ name: r.NAME, population: Number(r.POPESTIMATE2024) }))
    .sort((a, b) => b.population - a.population)
    .slice(0, TOP_US);
  const ca = parseCsv(caCsv)
    .map(r => ({ name: r.GEO, population: Number(r.POPULATION2021) }))
    .sort((a, b) => b.population - a.population)
    .slice(0, TOP_CA);
  return [
    ...us.map((m, i) => ({ country: 'United States' as const, ...m, rank: i + 1 })),
    ...ca.map((m, i) => ({ country: 'Canada' as const, ...m, rank: i + 1 })),
  ];
}
