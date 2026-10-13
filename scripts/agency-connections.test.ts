import { describe, expect, it } from 'vitest';
import { computeConnections, connectionLabel, extractStops } from './agency-connections';

const line = (routeId: string, short: string, long: string) => ({ geometry: { type: 'LineString' }, properties: { routeId, routeShortName: short, routeLongName: long } });
const stop = (stopName: string, lon: number, lat: number, routeIds: string[]) => ({ geometry: { type: 'Point', coordinates: [lon, lat] }, properties: { stopId: stopName + lon, stopName, routeIds } });

describe('connectionLabel', () => {
  it('numbers with names, codes by long name', () => {
    expect(connectionLabel('19', 'Hamilton/Toronto')).toBe('19 Hamilton/Toronto');
    expect(connectionLabel('01', 'King')).toBe('1 King');
    expect(connectionLabel('LW', 'Lakeshore West')).toBe('Lakeshore West');
    expect(connectionLabel('Line 1', null)).toBe('Line 1');
    expect(connectionLabel('5', '5 Dixie')).toBe('5 Dixie');
  });
});

describe('extractStops', () => {
  it('counts same-name stops within 150 m once (platforms), and keeps far ones apart', () => {
    const f = [line('a', '1', 'Main'), stop('Union', -79.38, 43.64, ['a']), stop('Union', -79.3805, 43.6402, ['a']), stop('Union', -79.30, 43.64, ['a']), stop('Other', -79.38, 43.64, ['a'])];
    expect(extractStops(f).stopCount).toBe(3);
  });
});

describe('computeConnections', () => {
  const A = extractStops([line('a', '1', 'Main'), stop('S', -79.38, 43.64, ['a']), stop('T', -79.20, 43.70, ['a'])]).stops;
  const B = extractStops([line('b', 'LW', 'Lakeshore West'), line('c', '9', 'Nine'), stop('S2', -79.3805, 43.6401, ['b', 'c']), stop('far', -79.0, 43.9, ['c'])]).stops;
  const C = extractStops([line('d', '2', 'Two'), stop('X', -79.40, 43.70, ['d'])]).stops;

  it('finds other agencies within 150 m and the routes serving those stops, both ways', () => {
    const out = computeConnections(new Map([['a', A], ['b', B], ['c', C]]), ['a', 'b', 'c'], s => s.toUpperCase());
    expect(out.get('a')).toEqual([{ slug: 'b', name: 'B', routes: ['9 Nine', 'Lakeshore West'] }]);
    expect(out.get('b')?.map(c => c.slug)).toEqual(['a']);
    expect(out.get('c')).toEqual([]);
  });
});
