import { describe, expect, it } from 'vitest';
import { snapshotsNewestFirst, usableSnapshots } from '../historySnapshots';

const s = (label: string, year: number) => ({ label, year });

describe('snapshotsNewestFirst (#1030)', () => {
  it('keeps the published date order within a year: Dec 2026 is newer than Sep 2026', () => {
    expect(snapshotsNewestFirst([s('Sep 2026', 2026), s('Dec 2026', 2026)]).map(x => x.label)).toEqual(['Dec 2026', 'Sep 2026']);
  });

  it('orders mixed years newest first and months within each year by date', () => {
    const published = [s('Oct 2013', 2013), s('Aug 2025', 2025), s('Apr 2026', 2026), s('Aug 2026', 2026), s('Dec 2026', 2026)];
    expect(snapshotsNewestFirst(published).map(x => x.label)).toEqual(['Dec 2026', 'Aug 2026', 'Apr 2026', 'Aug 2025', 'Oct 2013']);
  });

  it('a year out of place in the list still sorts by year', () => {
    expect(snapshotsNewestFirst([s('2019', 2019), s('2015', 2015), s('2022', 2022)]).map(x => x.year)).toEqual([2022, 2019, 2015]);
  });
});

describe('usableSnapshots (#1030)', () => {
  it('leaves out empty labels and years after the current one', () => {
    const kept = usableSnapshots([s('Aug 2025', 2025), s('', 2026), s('Dec 2099', 2099), s('Feb 2035', 2035), s('Sep 2026', 2026)], 2026);
    expect(kept.map(x => x.label)).toEqual(['Aug 2025', 'Sep 2026']);
  });
});
