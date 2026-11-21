import { describe, expect, it } from 'vitest';
import { coverageRows, type CoverageSources } from '../coverageRows';
import type { LiveCoverage } from '../liveCoverage';

const cov = (over: Partial<LiveCoverage>): LiveCoverage => ({ slug: 'x', feeds: ['vehicle positions'], routes: 'every route', firstDay: '2026-11-14', lastDay: '2026-11-18', daysRecorded: 5, recordingNow: true, archiveOnly: false, ...over });
const base: CoverageSources = {
  agencies: [{ slug: 'zeta', name: 'Zeta Transit' }, { slug: 'alpha', name: 'Alpha Transit' }, { slug: 'kingston', name: 'Kingston Transit' }, { slug: 'ttc', name: 'TTC' }],
  historySlugs: ['ttc'], liveArchiveSlugs: ['ttc', 'kingston', 'stm'], liveMapSlugs: ['ttc'],
  studioSlugs: ['kingston'], vehiclesSlugs: ['kingston', 'ttc'],
  coverage: { kingston: cov({ slug: 'kingston', firstDay: '2026-11-17', daysRecorded: 2 }) }, today: '2026-11-18',
};

describe('coverage rows (CIV-1871)', () => {
  const rows = coverageRows(base);
  const row = (slug: string) => rows.find(r => r.slug === slug)!;

  it('lists focus agencies first, in the focus list order, then the rest by name, and leaves out agencies with only the map', () => {
    expect(rows.map(r => r.slug)).toEqual(['ttc', 'kingston']);
    const more = coverageRows({ ...base, historySlugs: ['ttc', 'zeta'] });
    expect(more.map(r => r.slug)).toEqual(['ttc', 'kingston', 'zeta']);
    expect(more.find(r => r.slug === 'zeta')!.focus).toBe(false);
  });

  it('keeps the place beside a name shared by several feeds, so they can be told apart', () => {
    const two = coverageRows({ ...base, agencies: [{ slug: 'ttc', name: 'MTA NYCT Bus', place: 'Bronx' }, { slug: 'kingston', name: 'MTA NYCT Bus', place: 'Queens Village' }] });
    expect(two.map(r => `${r.name} · ${r.place}`)).toEqual(['MTA NYCT Bus · Bronx', 'MTA NYCT Bus · Queens Village']);
  });

  it('reads each column from its source', () => {
    expect(row('ttc')).toMatchObject({ history: true, liveRecorded: true, liveReport: true, liveRealtime: true, studioSchedule: false, studioVehicles: true });
    expect(row('kingston')).toMatchObject({ history: false, liveRealtime: false, studioSchedule: true, studioVehicles: true });
    expect(coverageRows({ ...base, historySlugs: ['alpha'] }).find(r => r.slug === 'alpha')).toMatchObject({ history: true, liveRecorded: false, liveReport: false, mcpLive: null, studioSchedule: false, studioVehicles: false });
  });

  it('shows no paused recorder: an agency whose recorder is paused has nothing from Live', () => {
    const paused = coverageRows({ ...base, agencies: [{ slug: 'stm', name: 'STM' }] });
    expect(paused).toEqual([]);
  });

  it('says when figures start while recordings build up, and where it has no coverage file', () => {
    expect(row('kingston')).toMatchObject({ mcpLive: 'from', mcpLiveFrom: 'Nov 22, 2026' });
    expect(row('ttc')).toMatchObject({ mcpLive: null, mcpLiveFrom: null });
  });
});

describe('a parent agency is one row (CIV-1963)', () => {
  it("lists MTA New York's feeds as one row with any feed's columns", () => {
    const rows = coverageRows({ ...base, agencies: [...base.agencies, { slug: 'nyct-subway', name: 'NYCT Subway', parentAgency: 'mta-new-york' }, { slug: 'lirr', name: 'LIRR', parentAgency: 'mta-new-york' }, { slug: 'mnr', name: 'Metro-North', parentAgency: 'mta-new-york' }], historySlugs: ['ttc', 'nyct-subway'] });
    const mta = rows.filter(r => ['mta-new-york', 'nyct-subway', 'lirr', 'mnr'].includes(r.slug));
    expect(mta.map(r => [r.slug, r.name, r.history])).toEqual([['mta-new-york', 'MTA New York', true]]);
  });
});
