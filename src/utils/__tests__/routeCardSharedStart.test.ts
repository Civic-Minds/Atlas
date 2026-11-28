import { describe, expect, it } from 'vitest';
import type { ShapeProperties, TimePeriod } from '../../hooks/useIntervalStats';
import { buildDirectionGroups } from '../routeCardDirectionGroups';
import { buildRouteCardModel, reportRowValueText } from '../routeCardRows';
import { rowStretchRunByOthers } from '../stretchCard';
import { rowTrips } from '../rowTrips';
import translink9json from './fixtures/translink-9-weekday.json';

// TransLink 9 Broadway, weekday, release-mwvbser2 (per-stop fields left out). Westbound, every branch starts at Boundary Loop:
// the main stretch is Granville St's whole run, and Alma St and UBC Exchange carry on past it (tails).
const tl9 = (translink9json as unknown as GeoJSON.FeatureCollection).features.map(f => f.properties as unknown as ShapeProperties);
const west = tl9.filter(d => d.directionId === 1);
const granville = west.find(d => d.headsign === 'Granville St')!;

function card(directions: ShapeProperties[], period: TimePeriod) {
  const current = { routeShortName: '009', routeLongName: '', directions };
  return buildRouteCardModel({
    directions, routeShortName: '009', routeLongName: '', directionGroups: buildDirectionGroups(current, period),
    agencyFeatures: undefined, period, maxHeadway: Infinity, nightView: false, stableColors: false, hideSpan: false,
  });
}
const group = (period: TimePeriod) => card(tl9, period).groups.find(g => g.dirId === 1)!;
const rowsText = (period: TimePeriod) => group(period).rows.map(r => `${r.label}: ${reportRowValueText(r)}`);

describe('#1823: branches that share a start: the trunk is the Shared stretch row, each branch reads its own trips', () => {
  it('TransLink 9 westbound AM: "Shared stretch every 8"; "to Granville St" reads its own trips, not the trunk\'s 8', () => {
    expect(group('amPeak').shared).toMatchObject({ label: 'Shared stretch', headway: 8 });
    // Each branch's own start or end is worded with the branch readings on (CIV-1959 B3, CIV-1241; #1825).
    expect(rowsText('amPeak')).toContain('to Granville St: every 18 min from 7:40 AM');
    expect(rowsText('amPeak')).toContain('to Alma St: every 16 min until 7:14 AM');
    expect(group('midday').shared).toMatchObject({ label: 'Shared stretch', headway: 11 });
    expect(rowsText('midday')).toContain('to Granville St: every 24 min');
  });

  it('the main row is run by others only while another destination\'s branch runs', () => {
    expect(rowStretchRunByOthers(granville, west, 'amPeak')).toBe(true);
    // The eastbound direction is one pattern: nothing to share.
    const east = tl9.filter(d => d.directionId === 0);
    expect(east.some(d => rowStretchRunByOthers(d, east, 'amPeak'))).toBe(false);
  });

  it('short turns and a main stretch with no branch keep reading the stretch', () => {
    const main = { headsign: 'Downtown', stretchRole: 'main', stretchIndex: 0, stretchCovers: ['main'] } as unknown as ShapeProperties;
    const shortTurn = { headsign: 'Midtown', stretchRole: 'variant', stretchCovers: ['main'], headwayByPeriod: { midday: 20 } } as unknown as ShapeProperties;
    expect(rowStretchRunByOthers(main, [main, shortTurn], 'midday')).toBe(false);
    // #1185: two patterns on one main stretch with no branch (TTC 29) are the pooled main stretch's, not this rule's.
    const second = { ...main, headsign: 'Princes Gates' } as ShapeProperties;
    expect(rowStretchRunByOthers(main, [main, second], 'midday')).toBe(false);
    // A branch with no trips in the period runs nothing there.
    const idleBranch = { headsign: 'Airport', stretchRole: 'tail', stretchIndex: 0, stretchCovers: ['main', 0], headwayByPeriod: { pmPeak: 30 } } as unknown as ShapeProperties;
    expect(rowStretchRunByOthers(main, [main, idleBranch], 'midday')).toBe(false);
    // The same destination on a longer pattern is the same row's riders, not another destination.
    const sameDest = { ...idleBranch, headsign: 'Downtown', headwayByPeriod: { midday: 30 } } as ShapeProperties;
    expect(rowStretchRunByOthers(main, [main, sameDest], 'midday')).toBe(false);
  });

  it('a row reading its own trips is never faster than the stretch that carries them', () => {
    const row = {
      headsign: 'Middletown', tier: '30', stretchRole: 'main', stretchIndex: 0, stretchRowPeriods: ['amPeak'],
      headwayByPeriod: { amPeak: 40 }, headwayByPeriodSustained: { amPeak: true },
      stretchMeta: { main: { stops: 20, refStop: 'm', trips: 6, period: { amPeak: 50 }, rows: { cadence: { amPeak: 50 }, longestGap: { amPeak: 60 }, consistent: ['amPeak'], hourly: {} } }, tails: [] },
    } as unknown as ShapeProperties;
    // CTtransit 55 AM to Middletown: its own 6:00, 6:30, 7:20, 8:20 read 40 by their median; the stretch's 50 stands.
    expect(rowTrips(row, 'amPeak', { stretchRunByOthers: true }).value).toBe(50);
    // A slower own reading is the row's own.
    expect(rowTrips({ ...row, headwayByPeriod: { amPeak: 60 } } as ShapeProperties, 'amPeak', { stretchRunByOthers: true }).value).toBe(60);
  });
});
