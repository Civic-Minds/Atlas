import { describe, expect, it } from 'vitest';
import { pairChanges } from '../scheduleChangePairing';
import { pairedStudioFile, type StudioBeforeAfterFile } from '../studioBeforeAfter';

describe('schedule change pairing (CIV-1864)', () => {
  it('merges a route removed and added under a differently cased name into one change', () => {
    const out = pairChanges([
      { route: 'KING', name: 'King St', before: { trips: 10 }, after: null },
      { route: 'King', name: 'King Street', before: null, after: { trips: 12 } },
      { route: '5', name: null, before: { trips: 3 }, after: { trips: 4 } },
      { route: '7', name: null, before: { trips: 1 }, after: null },
    ]);
    expect(out).toHaveLength(3);
    expect(out.find(c => c.route === 'King')).toEqual({ route: 'King', name: 'King Street', before: { trips: 10 }, after: { trips: 12 } });
    expect(out.find(c => c.route === '7')?.after).toBeNull();
  });

  it('Studio\'s file shows a renamed route as one change and keeps its older lines under the new name (CIV-1868)', () => {
    const day = (trips: number) => ({ trips, first: 360, last: 1380, runMinutes: [40], headway: {} }) as never;
    const file = { slug: 'x', before: { file: 'a', date: '1' }, after: { file: 'b', date: '2' }, day: 'Weekday', leftOut: [], unchanged: [],
      changes: [{ route: 'KING', name: null, before: day(10), after: null, size: 'frequency' }, { route: 'King', name: null, before: null, after: day(10), size: 'frequency' }],
      lines: { before: { KING: [{ id: 'l' }] }, after: { King: [{ id: 'l' }] } } } as unknown as StudioBeforeAfterFile;
    const out = pairedStudioFile(file);
    expect(out.changes).toHaveLength(1);
    expect(out.changes[0].before && out.changes[0].after).toBeTruthy();
    expect(out.changes[0].size).toBe('small');
    expect(Object.keys(out.lines!.before)).toEqual(['King']);
  });

  // #1631: HSR's Industrial express was "X-IND" in the summer file and "X IND" in the fall one.
  it('merges a route whose name changed only in spacing or punctuation when its long name matches', () => {
    const out = pairChanges([
      { route: 'X-IND', name: 'INDUSTRIAL EXTRA', before: { trips: 6 }, after: null },
      { route: 'X IND', name: 'INDUSTRIAL EXTRA', before: null, after: { trips: 6 } },
    ]);
    expect(out).toEqual([{ route: 'X IND', name: 'INDUSTRIAL EXTRA', before: { trips: 6 }, after: { trips: 6 } }]);
  });

  it('keeps them apart when the long names differ, or when the loose name is not unique on a side', () => {
    expect(pairChanges([
      { route: '10-A', name: 'Airport', before: { trips: 1 }, after: null },
      { route: '10A', name: 'Downtown', before: null, after: { trips: 1 } },
    ])).toHaveLength(2);
    expect(pairChanges([
      { route: '1-A', name: 'Main', before: { trips: 1 }, after: null },
      { route: '1 A', name: 'Main', before: null, after: { trips: 1 } },
      { route: '1A', name: 'Main', before: null, after: { trips: 2 } },
    ])).toHaveLength(3);
  });
});
