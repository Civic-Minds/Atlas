import { describe, expect, it } from 'vitest';
import { MAP_URL, readUrlParam, urlParamPresent, urlParamUpdate } from '../mapUrlState';
import { mergeUrlSearchParams } from '../syncUrlParams';

// CIV-1011 #11: the map view's link parameters read and write through one schema. Old links must
// open the same view, so every form below is one a link may already carry.
describe('map view link parameters', () => {
  it('frequency: h, then the older headway and max; all/inf/Infinity mean All', () => {
    expect(readUrlParam('?h=15', MAP_URL.headway)).toBe(15);
    expect(readUrlParam('?headway=20', MAP_URL.headway)).toBe(20);
    expect(readUrlParam('?max=30', MAP_URL.headway)).toBe(30);
    expect(readUrlParam('?h=10&max=30', MAP_URL.headway)).toBe(10);
    for (const all of ['all', 'inf', 'Infinity']) expect(readUrlParam(`?h=${all}`, MAP_URL.headway)).toBe(Infinity);
    expect(readUrlParam('?h=7.5', MAP_URL.headway)).toBe(7.5);
    // Unusable or empty values fall back to the saved preference, as before.
    for (const bad of ['?h=0', '?h=-5', '?h=abc', '?h=', '?']) expect(readUrlParam(bad, MAP_URL.headway)).toBeUndefined();
    // An empty h does not hide an older key behind it.
    expect(readUrlParam('?h=&max=30', MAP_URL.headway)).toBe(30);
  });

  it('frequency is written as h, 60 included, and All as "all" (#1141)', () => {
    expect(urlParamUpdate(MAP_URL.headway, 15)).toEqual({ h: '15' });
    expect(urlParamUpdate(MAP_URL.headway, 60)).toEqual({ h: '60' });
    expect(urlParamUpdate(MAP_URL.headway, Infinity)).toEqual({ h: 'all' });
  });

  it('period: p, then the older period; all is written too (#1141)', () => {
    expect(readUrlParam('?p=amPeak', MAP_URL.period)).toBe('amPeak');
    expect(readUrlParam('?period=late', MAP_URL.period)).toBe('late');
    expect(readUrlParam('?p=all', MAP_URL.period)).toBe('all');
    expect(readUrlParam('?p=brunch', MAP_URL.period)).toBeUndefined();
    expect(urlParamUpdate(MAP_URL.period, 'midday')).toEqual({ p: 'midday' });
    expect(urlParamUpdate(MAP_URL.period, 'all')).toEqual({ p: 'all' });
  });

  it('day: day, then the older d; always written', () => {
    expect(readUrlParam('?day=Sunday', MAP_URL.day)).toBe('Sunday');
    expect(readUrlParam('?d=Saturday', MAP_URL.day)).toBe('Saturday');
    expect(readUrlParam('?day=sunday', MAP_URL.day)).toBeUndefined();
    expect(urlParamUpdate(MAP_URL.day, 'Weekday')).toEqual({ day: 'Weekday' });
  });

  it('span and limited: the key alone counts, and only 0 shows that service', () => {
    expect(readUrlParam('?span=0', MAP_URL.hideSpan)).toBe(false);
    expect(readUrlParam('?span=1', MAP_URL.hideSpan)).toBe(true);
    expect(readUrlParam('?span=', MAP_URL.hideSpan)).toBe(true);
    expect(readUrlParam('?', MAP_URL.hideSpan)).toBeUndefined();
    expect(readUrlParam('?limited=0', MAP_URL.hideLimited)).toBe(false);
    expect(urlParamUpdate(MAP_URL.hideSpan, true)).toEqual({ span: '1' });
    expect(urlParamUpdate(MAP_URL.hideLimited, true)).toEqual({ limited: '1' });
    expect(urlParamUpdate(MAP_URL.hideLimited, false)).toEqual({ limited: '0' });
  });

  it('cards: route, stop and ondemand are read as given and cleared when closed', () => {
    expect(readUrlParam('?route=ttc::504', MAP_URL.route)).toBe('ttc::504');
    expect(readUrlParam('?route=ttc::51::branch:A', MAP_URL.route)).toBe('ttc::51::branch:A');
    expect(readUrlParam('?stop=ttc::1234', MAP_URL.stop)).toBe('ttc::1234');
    expect(readUrlParam('?ondemand=rfta::zone-1', MAP_URL.onDemand)).toBe('rfta::zone-1');
    expect(urlParamUpdate(MAP_URL.route, null)).toEqual({ route: null });
    expect(urlParamUpdate(MAP_URL.route, '')).toEqual({ route: null });
    expect(urlParamUpdate(MAP_URL.stop, 'ttc::1')).toEqual({ stop: 'ttc::1' });
  });

  it('highlight is a comma list, read only', () => {
    expect(readUrlParam('?highlight=ttc::504, ttc::501,', MAP_URL.highlight)).toEqual(['ttc::504', 'ttc::501']);
    expect(readUrlParam('?', MAP_URL.highlight)).toBeUndefined();
  });

  it('a link "names" a filter even when its value is unusable, so it does not overwrite the saved one (#891)', () => {
    expect(urlParamPresent('?max=abc', MAP_URL.headway)).toBe(true);
    expect(urlParamPresent('?h=', MAP_URL.headway)).toBe(false);
    expect(urlParamPresent('?d=Funday', MAP_URL.day)).toBe(true);
    expect(urlParamPresent('?span=', MAP_URL.hideSpan)).toBe(true);
  });

  it('a whole existing link reads back to the same view and writes back unchanged', () => {
    const link = 'route=ttc::504&day=Sunday&p=late&h=15&span=0&limited=0&lat=43.65&lon=-79.38&z=13';
    expect([MAP_URL.route, MAP_URL.day, MAP_URL.period, MAP_URL.headway, MAP_URL.hideSpan, MAP_URL.hideLimited].map(p => readUrlParam(link, p as never)))
      .toEqual(['ttc::504', 'Sunday', 'late', 15, false, false]);
    const rewritten = mergeUrlSearchParams(link, {
      ...urlParamUpdate(MAP_URL.route, 'ttc::504'), ...urlParamUpdate(MAP_URL.day, 'Sunday'), ...urlParamUpdate(MAP_URL.period, 'late'),
      ...urlParamUpdate(MAP_URL.headway, 15), ...urlParamUpdate(MAP_URL.hideSpan, false), ...urlParamUpdate(MAP_URL.hideLimited, false),
    });
    // Same parameters in the same order (URLSearchParams writes "::" as %3A%3A, as it always has).
    expect([...new URLSearchParams(rewritten)]).toEqual([...new URLSearchParams(link)]);
  });

  it('a copied address reopens the same period and frequency, "All day" and 60 min included (#1141)', () => {
    for (const [period, headway] of [['all', 60], ['all', Infinity], ['midday', 60], ['amPeak', 15]] as const) {
      const address = mergeUrlSearchParams('route=ttc::504', { ...urlParamUpdate(MAP_URL.period, period), ...urlParamUpdate(MAP_URL.headway, headway) });
      expect([readUrlParam(address, MAP_URL.period), readUrlParam(address, MAP_URL.headway)]).toEqual([period, headway]);
    }
  });

  it('a copied address reopens the same irregular and part-time choices, the default included (#1141)', () => {
    for (const hideSpan of [true, false]) {
      for (const hideLimited of [true, false]) {
        const address = mergeUrlSearchParams('route=ttc::504', { ...urlParamUpdate(MAP_URL.hideSpan, hideSpan), ...urlParamUpdate(MAP_URL.hideLimited, hideLimited) });
        expect([readUrlParam(address, MAP_URL.hideSpan), readUrlParam(address, MAP_URL.hideLimited)]).toEqual([hideSpan, hideLimited]);
      }
    }
  });
});
