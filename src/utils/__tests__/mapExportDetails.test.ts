import { describe, expect, it } from 'vitest';
import type { Agency } from '../../App';
import { COLOR_VISION_HEADWAY_TIERS, HEADWAY_TIERS, getNightServiceColor } from '../colors';
import {
  buildExportKey,
  describeDayAndPeriod,
  describeHeadwayFilter,
  describeMapExport,
  keyCandidates,
  pickExportPlace,
  slugifyForFilename,
  type MapExportState,
  type RenderedRouteSample,
} from '../mapExportDetails';

const agency = (slug: string, name: string, extra: Partial<Agency> = {}): Agency => ({ slug, name, center: [0, 0], url: '', ...extra });

const AGENCIES: Agency[] = [
  agency('ttc', 'Toronto Transit Commission', { region: 'Ontario', cities: ['Toronto, Ontario'] }),
  agency('miway', 'MiWay (Mississauga)', { region: 'Ontario', cities: ['Mississauga, Ontario'] }),
  agency('brampton', 'Brampton Transit', { region: 'Ontario', cities: ['Brampton, Ontario'] }),
  agency('stm', 'STM (Montréal)', { region: 'Quebec', cities: ['Saint-Laurent, Quebec'] }),
  agency('mbta', 'Massachusetts Bay Transportation Authority', { region: 'Massachusetts', cities: ['Dorchester, Massachusetts'] }),
  agency('go', 'GO Transit', { region: 'Ontario', displayArea: 'Greater Toronto & Hamilton Area', cities: ['Mississauga, Ontario'] }),
];

function samples(counts: Record<string, number>, color = '#22863a'): RenderedRouteSample[] {
  return Object.entries(counts).flatMap(([slug, n]) => Array.from({ length: n }, (_, i) => ({ agencySlug: slug, routeKey: `${slug}::${i}`, color })));
}

const BASE: MapExportState = {
  view: 'frequency',
  viewTitle: 'Transit Frequency',
  colorMode: 'default',
  maxHeadway: 20,
  day: 'Saturday',
  period: 'midday',
  zoom: 12,
};

describe('filter wording', () => {
  it('matches the app filter labels', () => {
    expect(describeHeadwayFilter(20)).toBe('Every 20 min or better');
    expect(describeHeadwayFilter(Infinity)).toBe('All routes');
    expect(describeDayAndPeriod('Saturday', 'midday')).toBe('Saturday midday');
    expect(describeDayAndPeriod('Weekday', 'amPeak')).toBe('Weekday AM peak');
    expect(describeDayAndPeriod('Sunday', 'all')).toBe('Sunday, all day');
  });
});

describe('pickExportPlace', () => {
  it('names the city that draws most routes', () => {
    expect(pickExportPlace(samples({ ttc: 40, miway: 3 }), AGENCIES)).toBe('Toronto');
  });

  it('prefers a place written in the agency name over a neighbourhood', () => {
    expect(pickExportPlace(samples({ stm: 20 }), AGENCIES)).toBe('Montréal');
  });

  it('counts routes, not drawn pieces of a route', () => {
    const many = Array.from({ length: 50 }, () => ({ agencySlug: 'miway', routeKey: 'miway::1', color: null }));
    expect(pickExportPlace([...many, ...samples({ ttc: 5 })], AGENCIES)).toBe('Toronto');
  });

  it('leaves the name out unless one place clearly fills the view', () => {
    expect(pickExportPlace(samples({ ttc: 8, miway: 7, brampton: 2 }), AGENCIES)).toBeNull();
    expect(pickExportPlace(samples({ ttc: 10, miway: 8, brampton: 7 }), AGENCIES)).toBeNull();
    expect(pickExportPlace(samples({ ttc: 10, stm: 8, mbta: 7 }), AGENCIES)).toBeNull();
    // A border view: the city that clearly dominates is still named.
    expect(pickExportPlace(samples({ ttc: 30, miway: 6 }), AGENCIES)).toBe('Toronto');
    expect(pickExportPlace(samples({ ttc: 20, miway: 10 }), AGENCIES)).toBeNull();
  });

  it('never names a view after an agency it cannot place', () => {
    expect(pickExportPlace(samples({ unknown: 30 }), AGENCIES)).toBeNull();
    expect(pickExportPlace(samples({ unknown: 10, ttc: 10 }), AGENCIES)).toBeNull();
  });

  it('shows no name when nothing is drawn', () => {
    expect(pickExportPlace([], AGENCIES)).toBeNull();
  });
});

describe('colour key', () => {
  it('lists only tiers whose colour is drawn, in the app order', () => {
    const key = buildExportKey(keyCandidates(BASE), ['#F59E0B', '#22863a', '#123456']);
    expect(key.map(item => item.label)).toEqual(['≤10m', '≤20m']);
  });

  it('uses the colour-vision palette when that mode is on', () => {
    const state = { ...BASE, colorMode: 'friendly' as const };
    const key = buildExportKey(keyCandidates(state), [COLOR_VISION_HEADWAY_TIERS[0].color]);
    expect(key).toEqual([{ color: COLOR_VISION_HEADWAY_TIERS[0].color, label: '≤10m' }]);
    expect(buildExportKey(keyCandidates(state), [HEADWAY_TIERS[0].color])).toEqual([]);
  });

  it('never shows headway tiers for night service', () => {
    const key = buildExportKey(keyCandidates({ ...BASE, view: 'night' }), [getNightServiceColor('default'), HEADWAY_TIERS[0].color]);
    expect(key).toEqual([{ color: getNightServiceColor('default'), label: 'Night service' }]);
  });
});

describe('describeMapExport', () => {
  it('describes a filtered view with a readable file name', () => {
    const details = describeMapExport(BASE, samples({ ttc: 30 }), AGENCIES);
    expect(details.place).toBe('Toronto');
    expect(details.title).toBe('Toronto');
    expect(details.eyebrow).toBe('Transit frequency');
    expect(details.lines).toEqual(['Every 20 min or better · Saturday midday']);
    expect(details.route).toBeNull();
    expect(details.keyTitle).toBeUndefined();
    expect(details.filename).toBe('atlas-toronto-20min-saturday-midday.png');
  });

  it('includes the selected route and modes', () => {
    const details = describeMapExport({ ...BASE, routeLabel: '505 — Dundas', routeShortName: '505', routeColor: '#15803d', selectedModes: [3, 1] }, samples({ ttc: 30 }), AGENCIES);
    expect(details.route).toEqual({ label: 'Route 505 — Dundas', color: '#15803d' });
    expect(details.lines).toEqual(['Every 20 min or better · Saturday midday · Subway and Bus']);
    expect(details.filename).toBe('atlas-toronto-route-505-20min-saturday-midday.png');
  });

  it('says when zooming out hides routes the filter would allow', () => {
    const details = describeMapExport({ ...BASE, maxHeadway: Infinity, period: 'all', day: 'Weekday', zoom: 6 }, samples({ ttc: 3 }), AGENCIES);
    expect(details.lines).toContain('Zoomed out, so some less frequent routes are hidden');
    expect(details.filename).toBe('atlas-toronto-all-routes-weekday-all-day.png');
  });

  it('uses the view name as the heading and leaves the place out of a multi-city view', () => {
    const details = describeMapExport(BASE, samples({ ttc: 10, stm: 8, mbta: 7 }), AGENCIES);
    expect(details.place).toBeNull();
    expect(details.title).toBe('Transit frequency');
    expect(details.eyebrow).toBeNull();
    expect(details.lines).toEqual(['Every 20 min or better · Saturday midday']);
    expect(details.filename).toBe('atlas-20min-saturday-midday.png');
  });

  it('keeps file names to lowercase letters, numbers and dashes', () => {
    expect(slugifyForFilename('Montréal ≤20m · Saturday')).toBe('montreal-20m-saturday');
    const details = describeMapExport(BASE, samples({ stm: 5 }), AGENCIES);
    expect(details.filename).toMatch(/^[a-z0-9-]+\.png$/);
  });
});
