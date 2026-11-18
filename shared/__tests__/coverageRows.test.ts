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
