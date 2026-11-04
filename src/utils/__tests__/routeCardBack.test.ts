import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveRouteCardBack } from '../routeCardBack';

// #1326: back from a route opened from the Night Service list went to the agency card, not the list.
const camera = { center: { lng: -79.43, lat: 43.67 }, zoom: 11.62, bearing: 0, pitch: 0 };
const base = {
  selectedRoute: 'ttc::301' as string | null,
  nightServiceView: true,
  nightListRoute: { routeKey: 'ttc::301', camera },
  nearYouRoute: null as string | null,
  hasUserLocation: false,
};

describe('resolveRouteCardBack', () => {
  it('a route opened from the Night Service list goes back to the list, at the map position it was opened from', () => {
    expect(resolveRouteCardBack(base)).toEqual({ kind: 'nightList', camera });
  });

  it('a different route opened afterwards keeps the default back (its agency card)', () => {
    expect(resolveRouteCardBack({ ...base, selectedRoute: 'ttc::304' })).toBeNull();
  });

  it('outside the Night Service view the default back is unchanged', () => {
    expect(resolveRouteCardBack({ ...base, nightServiceView: false })).toBeNull();
    expect(resolveRouteCardBack({ ...base, nightListRoute: null })).toBeNull();
  });

  it('a route opened from Near You still goes back to Near You', () => {
    expect(resolveRouteCardBack({ ...base, nightServiceView: false, nearYouRoute: 'ttc::301', hasUserLocation: true })).toEqual({ kind: 'nearYou' });
    expect(resolveRouteCardBack({ ...base, nightServiceView: false, nearYouRoute: 'ttc::301', hasUserLocation: false })).toBeNull();
  });

  it('no route open, no back target', () => {
    expect(resolveRouteCardBack({ ...base, selectedRoute: null })).toBeNull();
  });

  it('a route opened from the Bustang connections list goes back to that list (CIV-101)', () => {
    const bustang = { ...base, selectedRoute: 'bustang::WEST', nightServiceView: false, bustangView: true, nightListRoute: { routeKey: 'bustang::WEST', camera } };
    expect(resolveRouteCardBack(bustang)).toEqual({ kind: 'bustangList', camera });
    // The same route on the regular map, or another route, keeps its agency card.
    expect(resolveRouteCardBack({ ...bustang, bustangView: false })).toBeNull();
    expect(resolveRouteCardBack({ ...bustang, selectedRoute: 'bustang::NRTH' })).toBeNull();
  });

  it('the map records the Bustang list as the opener of the route it hands over', () => {
    const source = readFileSync(join(__dirname, '../../apps/Interval.tsx'), 'utf8');
    const start = source.indexOf('const prevPendingBustangRoute');
    expect(source.slice(start, source.indexOf('onPendingBustangRouteHandled?.();', start))).toContain('setNightListRoute(');
  });

  it('the map records the Night Service list as the opener of the route it hands over', () => {
    // vitest related misses this wiring; the source check keeps the handoff from dropping the list target.
    const source = readFileSync(join(__dirname, '../../apps/Interval.tsx'), 'utf8');
    const handoff = source.slice(source.indexOf('const prevPendingNightRoute'), source.indexOf('onPendingNightRouteHandled?.();', source.indexOf('const prevPendingNightRoute')));
    expect(handoff).toContain('setNightListRoute(');
    expect(source).toContain('resolveRouteCardBack(');
  });
});
