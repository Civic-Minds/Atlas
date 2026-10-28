import { describe, expect, it } from 'vitest';
import { dedupeMapContextByDisplay, getMapContextAgencies, getMapContextAgenciesFromFeatures, isMapContextOutsideClick } from '../mapContext';
import { routeLabels } from '../format';

const agencies = [
  { slug: 'near', name: 'Near Transit', center: [43, -79] as [number, number], url: '' },
  { slug: 'far', name: 'Far Transit', center: [43, -80] as [number, number], url: '' },
];

describe('mapContext', () => {
  it('keeps the panel open for clicks inside it and closes for outside clicks', () => {
    const panel = document.createElement('div');
    const child = document.createElement('button');
    panel.appendChild(child);

    expect(isMapContextOutsideClick(panel, child)).toBe(false);
    expect(isMapContextOutsideClick(panel, document.body)).toBe(true);
  });

  it('counts unique routes whose shapes intersect the viewport', () => {
    const result = getMapContextAgencies(agencies, {
      near: {
        type: 'FeatureCollection',
        features: [
          { type: 'Feature', geometry: { type: 'LineString', coordinates: [[-79.5, 43], [-79.4, 43.1]] }, properties: { routeId: '1', day: 'Weekday' } },
          { type: 'Feature', geometry: { type: 'LineString', coordinates: [[-79.5, 43], [-79.4, 43.1]] }, properties: { routeId: '1', day: 'Weekday' } },
          { type: 'Feature', geometry: { type: 'LineString', coordinates: [[-79.5, 43], [-79.4, 43.1]] }, properties: { routeId: '2', day: 'Weekday' } },
          { type: 'Feature', geometry: { type: 'LineString', coordinates: [[-79.5, 43], [-79.4, 43.1]] }, properties: { routeId: '3', day: 'Saturday' } },
        ],
      },
      far: {
        type: 'FeatureCollection',
        features: [
          { type: 'Feature', geometry: { type: 'LineString', coordinates: [[-80.5, 43], [-80.4, 43.1]] }, properties: { routeId: '9', day: 'Weekday' } },
        ],
      },
    } as any, { s: 42.9, w: -79.6, n: 43.2, e: -79.3 }, 'Weekday');

    expect(result).toEqual([{
      slug: 'near',
      name: 'Near Transit',
      display: { primary: 'Near Transit' },
      routeCount: 2,
      routes: [
        { key: 'near::1', agencySlug: 'near', agencyName: 'Near Transit', shortName: '1', longName: null, label: { primary: '1', secondary: undefined, text: '1' }, routeType: undefined },
        { key: 'near::2', agencySlug: 'near', agencyName: 'Near Transit', shortName: '2', longName: null, label: { primary: '2', secondary: undefined, text: '2' }, routeType: undefined },
      ],
    }]);
  });

  it('collapses route IDs with the same rider-visible label in the count and list', () => {
    const route = (id: string, shortName: string) => ({ key: `a::${id}`, agencySlug: 'a', agencyName: 'A', shortName, longName: null, label: routeLabels({ shortName, longName: null }) });
    const [agency] = dedupeMapContextByDisplay([{ slug: 'a', name: 'A', routeCount: 3, routes: [route('1', '301'), route('2', '301'), route('3', '302')] }]);
    expect(agency.routeCount).toBe(2);
    expect(agency.routes.map(r => r.key)).toEqual(['a::1', 'a::3']);
  });
});

describe('routes drawn by segment layers (#1090)', () => {
  const line = (props: Record<string, unknown>): GeoJSON.Feature => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] }, properties: { agencySlug: 'yrt', ...props } });
  const agencies = [{ slug: 'yrt', name: 'York Region Transit' }] as any;

  it('names a route drawn only by its qualifying segments from the names the piece carries', () => {
    const [agency] = getMapContextAgenciesFromFeatures(agencies, [line({ routeId: 'r-purple', routeBranch: null, routeShortName: 'Purple', routeLongName: 'Viva Purple', routeType: 3 })]);
    expect(agency.routes.map(r => r.label.text)).toEqual([expect.stringContaining('Purple')]);
  });
  it('a full line names the row even when a segment piece comes first, and a piece without a branch is not a second route', () => {
    const [agency] = getMapContextAgenciesFromFeatures(agencies, [
      line({ routeId: '1', routeShortName: '1', routeLongName: 'Yonge', routeType: 3 }), // a section piece: no routeBranch
      line({ routeId: '1', routeBranch: 'A', routeShortName: '1', routeLongName: 'Yonge', routeType: 3 }),
    ].reverse());
    expect(agency.routes).toHaveLength(1);
    expect(agency.routeCount).toBe(1);
  });
});

