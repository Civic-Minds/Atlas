import { describe, expect, it } from 'vitest';
import { livePills, type LiveDays } from '../StudioCoveragePage';
import { COVERAGE_LIVE_TAGS } from '../content/noticeCopy';
import { studioPath } from '../../shared/studioAgencies';
import type { CoverageRow } from '../../shared/coverageRows';

const row = (slug: string): CoverageRow => ({
  slug, name: slug, place: null, focus: true, history: false, historyYears: 0,
  liveRecorded: true, liveRealtime: false, liveReport: true, studioSchedule: false, studioVehicles: false, mcpLive: null, mcpLiveFrom: null,
});
const live: LiveDays = { minDays: 7, days: { ttc: 15, hamilton: 3 } };

describe('Status page Live cell: the Lateness pill (CIV-2205)', () => {
  it('shows "Lateness" for an agency with Live route analyses, opening it on Studio\'s Live page', () => {
    const pill = livePills(row('ttc'), live).find(p => p.label === COVERAGE_LIVE_TAGS.lateness);
    expect(pill).toEqual({ label: 'Lateness', to: studioPath({ page: 'live', agency: 'ttc', route: null }) });
  });

  it('shows it while recordings are still short of the Studio minimum (being recorded and computed)', () => {
    expect(livePills(row('hamilton'), live).map(p => p.label)).toContain('Lateness');
  });

  it('shows no Lateness pill without analyses, or when the dev server gave no file', () => {
    expect(livePills(row('mbta'), live).map(p => p.label)).not.toContain('Lateness');
    expect(livePills(row('ttc'), null).map(p => p.label)).toEqual(['Recorded', 'Report']);
  });
});
