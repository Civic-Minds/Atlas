import { describe, expect, it } from 'vitest';
import { mergeIntoCardRows, DIRECTION_UNCLEAR } from '../liveGrouping';
import type { LiveVehicle } from '../../context/LiveVehiclesMapOverlay';

const car = (id: string, directionId: number | null, lastStop?: string) => ({ id, directionId, lastStop: lastStop ? { name: lastStop } : null }) as unknown as LiveVehicle;

// #1877 (Ryan, a fifth time, 2026-11-27): TTC 512's "St Clair" cars were a row of their own under "to St Clair Station".
describe('mergeIntoCardRows', () => {
  it('puts a group under the only row of its direction', () => {
    const out = mergeIntoCardRows(new Map([['St Clair', [car('a', 0), car('b', 0)]], ['St Clair Station', [car('c', 0)]], ['Keele', [car('d', 1)]]]),
      [{ key: 'St Clair Station', directionId: 0 }, { key: 'Keele', directionId: 1 }]);
    expect([...out.keys()]).toEqual(['St Clair Station', 'Keele']);
    expect(out.get('St Clair Station')!.map(v => v.id)).toEqual(['a', 'b', 'c']);
  });
  it('with several rows, joins the one whose name leads with the group\'s or its last stop\'s, else keeps its own row', () => {
    const rows = [{ key: 'St Clair Station', directionId: 0 }, { key: 'Gunns Loop', directionId: 0 }];
    expect([...mergeIntoCardRows(new Map([['St Clair', [car('a', 0)]]]), rows).keys()]).toEqual(['St Clair Station']);
    expect([...mergeIntoCardRows(new Map([['Eastbound', [car('a', 0, 'Gunns Loop')]]]), rows).keys()]).toEqual(['Gunns Loop']);
    expect([...mergeIntoCardRows(new Map([['Yonge', [car('a', 0)]]]), rows).keys()]).toEqual(['Yonge']);
    expect([...mergeIntoCardRows(new Map([[DIRECTION_UNCLEAR, [car('a', null)]]]), rows).keys()]).toEqual([DIRECTION_UNCLEAR]);
  });
});
