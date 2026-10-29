import { describe, expect, it } from 'vitest';
import { noOwnServicePeriods, ownDeparturesInPeriod } from '../noOwnService';

// CIV-1074: every period a row does not run itself, whatever supplies its number.
describe('periods a row does not run itself (CIV-1074)', () => {
  it('counts own departures per period from departures per hour, past midnight too', () => {
    const byHour = { '8': 4, '13': 2, '25': 1, '26': 2 };
    expect(ownDeparturesInPeriod(byHour, 'amPeak')).toBe(4);
    expect(ownDeparturesInPeriod(byHour, 'midday')).toBe(2);
    expect(ownDeparturesInPeriod(byHour, 'overnight')).toBe(2);
  });

  it('marks a variant reading the stretch, a sparse overnight and a borrowed value; never a row reading its stretch', () => {
    // SEPTA 98 Norristown: a variant with no midday trips that would show the stretch's 31.
    expect(noOwnServicePeriods({ departuresByHour: { '7': 1, '18': 1 }, headwayByPeriod: {}, stretchRole: 'variant', stretchMeta: { main: { period: { midday: 31 } } } })).toEqual(['midday']);
    // TTC 340 overnight: two own trips beside a borrowed 30.
    expect(noOwnServicePeriods({ departuresByHour: { '26': 2 }, headwayByPeriod: { overnight: 30 } })).toEqual(['overnight']);
    // Three own departures keep the value; a main row reads its stretch and is never marked.
    expect(noOwnServicePeriods({ departuresByHour: { '20': 1, '21': 2 }, headwayByPeriod: { evening: 30 } })).toEqual([]);
    expect(noOwnServicePeriods({ departuresByHour: { '26': 1 }, headwayByPeriod: { overnight: 30 }, stretchRole: 'main' })).toEqual([]);
    // Periods already marked in Step 5 are kept.
    expect(noOwnServicePeriods({ departuresByHour: { '8': 5 }, headwayByPeriod: { amPeak: 10 }, noOwnServiceByPeriod: ['amPeak'] })).toEqual(['amPeak']);
  });
});
