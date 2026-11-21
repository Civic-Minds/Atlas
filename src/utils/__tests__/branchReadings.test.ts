import { describe, expect, it } from 'vitest';
import type { ShapeProperties } from '../../hooks/useIntervalStats';
import type { PieceReadings } from '../../../shared/pieceReadings';
import { buildDirectionGroups } from '../routeCardDirectionGroups';
import { buildRouteCardModel, reportRowValueText } from '../routeCardRows';
import { directionPieceTreatments, stopBranchReading } from '../branchReadings';
import { buildStopRoutes } from '../stopRoutes';
import { HEADWAY_TIERS } from '../../../shared/config';

// CIV-1959 B3 (#1620, #1086): the route card's trunk line and branch lines, and the stop card's branch words. Every fixture is
// hand-set from the shape the pipeline writes (pipeline/__tests__/branchReadings.test.ts builds the same pieces from trips).

const stops = (p: string, n: number) => Array.from({ length: n }, (_, i) => `${p}${i}`);
const common = {
  routeId: '52', routeShortName: '52', routeType: 3, day: 'Weekday', directionId: 0, serviceClass: 'regular',
  directionFilterHeadwayByPeriod: { amPeak: 5, midday: 5, pmPeak: 5, evening: 6, late: 10, overnight: null },
  routeFilterHeadwayByPeriod: { amPeak: 5, midday: 5, pmPeak: 5, evening: 6, late: 10, overnight: null },
  routeRunsByPeriod: { amPeak: true, midday: true, pmPeak: true, evening: true, late: true },
  stretchPeriodOneGap: { amPeak: false, midday: false, pmPeak: false, evening: false, late: false, overnight: false },
};
const meta = {
  main: { stops: 20, refStop: 't10', trips: 180 },
  tails: [{ refStop: 'x3', stops: 8, km: 3, trips: 45 }],
};
const withReadings = (readings: PieceReadings | undefined, slot: 'main' | 'tail'): ShapeProperties => ({
  ...common,
  headsign: slot === 'main' ? 'Lawrence West Station' : 'Pearson Airport', tier: slot === 'main' ? '5' : '20',
  headway: slot === 'main' ? 5 : 20, stretchRole: slot, stretchIndex: 0, stopOrder: slot === 'main' ? stops('t', 20) : [...stops('t', 20), ...stops('x', 8)],
  headwayByPeriod: { amPeak: slot === 'main' ? 5 : 20, midday: slot === 'main' ? 5 : 20, pmPeak: slot === 'main' ? 5 : 20, evening: slot === 'main' ? 6 : 20 },
  headwayByPeriodSustained: { amPeak: true, midday: true, pmPeak: true, evening: true },
  maxGapByPeriod: { amPeak: 6, midday: 6, pmPeak: 6, evening: 8 },
  stretchMeta: meta, stretchRowPeriods: ['midday', 'evening'],
  ...(readings ? { pieceReadings: readings } : {}),
}) as unknown as ShapeProperties;

const piece = (kind: 'trunk' | 'branch', index: number, periods: PieceReadings['pieces'][number]['periods'], stopList?: string[]) =>
  ({ kind, index, stopCount: stopList?.length ?? 0, refStop: kind === 'trunk' ? 't10' : 'x3', periods, ...(stopList ? { stops: stopList } : {}) });
const card = (directions: ShapeProperties[], period: 'midday' | 'evening', branchReadings: boolean) => {
  const route = { routeShortName: '52', routeLongName: null as string | null, directions };
  return buildRouteCardModel({
    ...route, directionGroups: buildDirectionGroups(route, period), agencyFeatures: undefined, period, maxHeadway: Infinity,
    nightView: false, stableColors: false, hideSpan: false, branchReadings,
  });
};
/** The card as lines of text: the trunk line, then each branch line, as the issue report words them. */
const lines = (m: ReturnType<typeof card>) => m.groups.flatMap(g => [
  ...(g.shared ? [`${g.shared.label} ${g.shared.edgeText ?? `every ${g.shared.headway} min`}`] : []),
  ...g.rows.map(r => `${r.label}: ${reportRowValueText(r)}`),
]);

describe('route card branch lines (CIV-1959 B3)', () => {
  const trunkStops = stops('t', 20), branchStops = stops('x', 8);
  const readings = (branchMidday: NonNullable<PieceReadings['pieces'][number]['periods'][keyof PieceReadings['pieces'][number]['periods']]>): PieceReadings => ({
    pieces: [piece('trunk', 0, { midday: { t: 'reading', v: 5 } }), piece('branch', 0, { midday: branchMidday })],
  });

  it('TTC 52-like: the trunk (its main row reads every 5, so no second line) and the branch its own every 20', () => {
    const m = card([withReadings(readings({ t: 'reading', v: 20 }), 'main'), withReadings(readings({ t: 'reading', v: 20 }), 'tail')], 'midday', true);
    expect(lines(m)).toEqual(['to Lawrence West Station: every 5 min', 'to Pearson Airport: every 20 min']);
  });
  it('a branch with too few trips shows no number and no figure from the trunk', () => {
    const r = readings({ t: 'limited' });
    const m = card([withReadings(r, 'main'), withReadings(r, 'tail')], 'midday', true);
    expect(lines(m)).toEqual(['to Lawrence West Station: every 5 min', 'to Pearson Airport: Runs irregularly in this period']);
    const branch = m.groups[0].rows.find(r => r.feature.stretchRole === 'tail')!.display(null).value;
    expect(branch.headway).toBeUndefined();
    expect(branch.isLimited).toBe(true);
  });
  it('a branch past the last tier reads as every other row past it does (the number, coloured Infrequent), never its own words', () => {
    const r = readings({ t: 'reading', v: 120 });
    const m = card([withReadings(r, 'main'), withReadings(r, 'tail')], 'midday', true);
    const row = m.groups[0].rows.find(x => x.feature.stretchRole === 'tail')!;
    // The row keeps the wording and value rule the card's rows always had; a piece's reading never replaces them.
    expect(reportRowValueText(row)).toBe('every 20 min');
  });
  it('a tail whose full-window wait is over 60 prints its own spacing and colours Infrequent at the wait', () => {
    const r = readings({ t: 'tail', v: 164, every: 30, until: 736 });
    const m = card([withReadings(r, 'main'), withReadings(r, 'tail')], 'midday', true);
    const row = m.groups[0].rows.find(x => x.feature.stretchRole === 'tail')!;
    expect(reportRowValueText(row)).toBe('every 30 min until 12:16 PM');
    expect(HEADWAY_TIERS.find(t => (row.display(null).value.colorHeadway ?? 0) <= t.max)?.label).toBe('Infrequent');
  });
  it('a part-period tail reads every N until HH:MM on its own line, coloured at its full-window wait', () => {
    const r = readings({ t: 'tail', v: 164, every: 30, until: 736 });
    const m = card([withReadings(r, 'main'), withReadings(r, 'tail')], 'midday', true);
    expect(lines(m)).toEqual(['to Lawrence West Station: every 5 min', 'to Pearson Airport: every 30 min until 12:16 PM']);
    const v = m.groups[0].rows.find(r => r.feature.stretchRole === 'tail')!.display(null).value;
    expect(v.headway).toBe(164);
    expect(v.colorHeadway).toBe(164);
  });
  it('a trunk reading that differs from the main row\'s number gets its own Shared stretch line, always (no ratio rule)', () => {
    const r: PieceReadings = { pieces: [piece('trunk', 0, { midday: { t: 'reading', v: 4 } }), piece('branch', 0, { midday: { t: 'reading', v: 20 } })] };
    expect(lines(card([withReadings(r, 'main'), withReadings(r, 'tail')], 'midday', true))).toEqual(['Shared stretch every 4 min', 'to Lawrence West Station: every 5 min', 'to Pearson Airport: every 20 min']);
  });
  it('a destination that shares the stretch with another keeps its own wait, never the pooled one', () => {
    const r = readings({ t: 'reading', v: 10 });
    const shared = { ...withReadings(r, 'tail'), stretchRowPeriods: [] } as unknown as ShapeProperties;
    expect(lines(card([withReadings(r, 'main'), shared], 'midday', true))).toEqual(['to Lawrence West Station: every 5 min', 'to Pearson Airport: every 20 min']);
  });
  it('B35-like (CIV-1241, CIV-1411): a branch row that starts at 7:17 on a stretch that runs all period reads "from 7:17", not its 77-minute wait', () => {
    // The row's own trips are not all of the stretch's (stretchRowPeriods leaves the period out), so the card keeps the row's own reading.
    const r = readings({ t: 'reading', v: 12 });
    const late = {
      ...withReadings(r, 'tail'), stretchRowPeriods: [], headwayByPeriod: { midday: 8 }, headwayByPeriodSustained: { midday: false },
      periodCoverageHeadway: { midday: 77 }, maxGapByPeriod: { midday: 13 }, rowPeriodEdge: { midday: { from: 617, every: 8 } },
    } as unknown as ShapeProperties;
    const text = lines(card([withReadings(r, 'main'), late], 'midday', true));
    expect(text).toEqual(['to Lawrence West Station: every 5 min', 'to Pearson Airport: every 8 min from 10:17 AM']);
    const v = card([withReadings(r, 'main'), late], 'midday', true).groups[0].rows.find(x => x.feature.stretchRole === 'tail')!.display(null).value;
    expect(v.headway).toBe(77);
    // The card switch off: today's words, whatever the data carries.
    expect(lines(card([withReadings(r, 'main'), late], 'midday', false)).join()).not.toMatch(/from 10:17/);
  });
  it('SEPTA 37-like: a row that stops early keeps "until HH:MM" over a plain piece reading its stretch\'s other buses make slower', () => {
    const r = readings({ t: 'reading', v: 55 });
    const early = {
      ...withReadings(r, 'tail'), headwayByPeriod: { midday: 27 }, headwayByPeriodSustained: { midday: false },
      periodCoverageHeadway: { midday: 178 }, maxGapByPeriod: { midday: 28 }, rowPeriodEdge: { midday: { until: 722, every: 27 } },
    } as unknown as ShapeProperties;
    expect(lines(card([withReadings(r, 'main'), early], 'midday', true))).toEqual(['to Lawrence West Station: every 5 min', 'to Pearson Airport: every 27 min until 12:02 PM']);
    // With no words of its own the row keeps its usual wording; the piece's slower reading (its stretch's longest wait) never replaces it.
    const plain = { ...early, rowPeriodEdge: undefined, headwayByPeriodSustained: { midday: true } } as unknown as ShapeProperties;
    expect(lines(card([withReadings(r, 'main'), plain], 'midday', true))[1]).toBe('to Pearson Airport: every 27 min');
  });
  it('the switch off, or data without the field, leaves the card exactly as it was', () => {
    const r = readings({ t: 'limited' });
    const plain = [withReadings(undefined, 'main'), withReadings(undefined, 'tail')];
    const withField = [withReadings(r, 'main'), withReadings(r, 'tail')];
    expect(lines(card(withField, 'midday', false))).toEqual(lines(card(plain, 'midday', false)));
    expect(lines(card(plain, 'midday', true))).toEqual(lines(card(plain, 'midday', false)));
  });
  it('a period with no trunk reading keeps today\'s card', () => {
    const r: PieceReadings = { pieces: [piece('trunk', 0, { midday: { t: 'limited' } }), piece('branch', 0, { midday: { t: 'limited' } })] };
    const withField = [withReadings(r, 'main'), withReadings(r, 'tail')];
    expect(directionPieceTreatments(withField, 'midday')).toBeNull();
    expect(lines(card(withField, 'midday', true))).toEqual(lines(card([withReadings(undefined, 'main'), withReadings(undefined, 'tail')], 'midday', false)));
  });
  it('with no branch that has a feature of its own (nothing to name it) the card keeps today\'s rows', () => {
    const r = readings({ t: 'limited' });
    expect(lines(card([withReadings(r, 'main')], 'midday', true))).toEqual(lines(card([withReadings(undefined, 'main')], 'midday', false)));
  });
  it('#1636: a branch with no feature of its own is a line named from its terminus (the pipeline\'s `to`), in the words every branch row has', () => {
    const named = (t: NonNullable<PieceReadings['pieces'][number]['periods'][keyof PieceReadings['pieces'][number]['periods']]>) =>
      ({ pieces: [piece('trunk', 0, { midday: { t: 'reading', v: 5 } }), { ...piece('branch', 0, { midday: t }), to: 'Tower Rd' }] }) as PieceReadings;
    expect(lines(card([withReadings(named({ t: 'reading', v: 30 }), 'main')], 'midday', true))).toEqual(['to Lawrence West Station: every 5 min', 'to Tower Rd: every 30 min']);
    expect(lines(card([withReadings(named({ t: 'tail', v: 164, every: 30, until: 736 }), 'main')], 'midday', true)).at(-1)).toBe('to Tower Rd: every 30 min until 12:16 PM');
    expect(lines(card([withReadings(named({ t: 'limited' }), 'main')], 'midday', true)).at(-1)).toBe('to Tower Rd: Runs irregularly in this period');
    // An origin leg is named from where it starts, in the existing "from A to B" form, and left out when the direction has a named branch row (its row speaks for the starting legs).
    const leg = (t: NonNullable<PieceReadings['pieces'][number]['periods'][keyof PieceReadings['pieces'][number]['periods']]>) =>
      ({ pieces: [piece('trunk', 0, { midday: { t: 'reading', v: 5 } }), { ...piece('branch', 0, { midday: t }), from: 'Colfax Ave & Tower Rd' }] }) as PieceReadings;
    expect(lines(card([withReadings(leg({ t: 'tail', v: 164, every: 30, until: 736 }), 'main')], 'midday', true)).at(-1)).toBe('from Colfax Ave & Tower Rd to Lawrence West Station: every 30 min until 12:16 PM');
    const twoLegs: PieceReadings = { pieces: [piece('trunk', 0, { midday: { t: 'reading', v: 5 } }), piece('branch', 0, { midday: { t: 'reading', v: 24 } }), { ...piece('branch', 1, { midday: { t: 'reading', v: 24 } }), from: 'Pickering Parkway' }] };
    expect(lines(card([withReadings(twoLegs, 'main'), { ...withReadings(twoLegs, 'tail'), stretchIndex: 0 }], 'midday', true)).some(l => l.includes('Pickering'))).toBe(false);
    // Switch off, or no `to` (an origin leg the pipeline left unnamed): no new line.
    expect(lines(card([withReadings(named({ t: 'reading', v: 30 }), 'main')], 'midday', false))).toEqual(['to Lawrence West Station: every 5 min']);
  });
  void trunkStops; void branchStops;
});

describe('stop card branch words (CIV-1959 B3)', () => {
  const readingsWithStops = (t: PieceReadings['pieces'][number]['periods'][keyof PieceReadings['pieces'][number]['periods']]): ShapeProperties[] => {
    const r: PieceReadings = { pieces: [piece('trunk', 0, { midday: { t: 'reading', v: 5 } }, stops('t', 20)), piece('branch', 0, { midday: t }, stops('x', 8))] };
    return [withReadings(r, 'main'), withReadings(r, 'tail')];
  };
  it('a stop on a limited branch shows the no-number words, never the trunk figure; a trunk stop is untouched', () => {
    expect(stopBranchReading(readingsWithStops({ t: 'limited' }), 'x3', 'midday')).toEqual({ periodText: 'Runs irregularly in this period' });
    expect(stopBranchReading(readingsWithStops({ t: 'limited' }), 't3', 'midday')).toBeNull();
  });
  it('a stop on a tail shows its spacing with when it stops; on a reading branch, the branch number', () => {
    expect(stopBranchReading(readingsWithStops({ t: 'tail', v: 164, every: 30, until: 736 }), 'x1', 'midday')).toEqual({ periodText: 'every 30 min until 12:16 PM' });
    expect(stopBranchReading(readingsWithStops({ t: 'reading', v: 20 }), 'x1', 'midday')).toEqual({ rowHeadway: 20 });
  });
  it('overnight, all day, a stop on no piece and data without the field give nothing', () => {
    const f = readingsWithStops({ t: 'limited' });
    expect(stopBranchReading(f, 'x3', 'overnight')).toBeNull();
    expect(stopBranchReading(f, 'x3', 'all')).toBeNull();
    expect(stopBranchReading(f, 'elsewhere', 'midday')).toBeNull();
    expect(stopBranchReading([withReadings(undefined, 'tail')], 'x3', 'midday')).toBeNull();
  });
  it('buildStopRoutes with the switch off is unchanged by the field', () => {
    const f = readingsWithStops({ t: 'limited' });
    const layers = (dirs: ShapeProperties[]) => ({ ttc: { type: 'FeatureCollection', features: dirs.map(d => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] }, properties: { ...d, stopHeadways: { x3: 20 }, stopPeriodHeadways: { x3: { midday: 20 } } } })) } as unknown as GeoJSON.FeatureCollection });
    const args = (dirs: ShapeProperties[], branchReadings: boolean) => ({ siblingIdsByAgency: { ttc: new Set(['x3']) }, routesByAgency: { ttc: new Set(['52']) }, layers: layers(dirs), day: 'Weekday', period: 'midday' as const, branchReadings });
    const off = JSON.stringify(buildStopRoutes(args(f, false)));
    const plain = JSON.stringify(buildStopRoutes(args([withReadings(undefined, 'main'), withReadings(undefined, 'tail')], false)));
    expect(off).toBe(plain);
    // On: the branch's row for the stop says the no-number words, with no number.
    const on = buildStopRoutes(args(f, true)).flatMap(r => r.branches).find(b => b.headsign === 'Pearson Airport');
    expect(on?.periodText).toBe('Runs irregularly in this period');
    expect(on?.rowHeadway).toBeNull();
  });
});
