import { describe, expect, it } from 'vitest';
import * as schema from '../urlSchema';
import { MAP_URL, URL_PARAM_ORDER, orderUrlParams, readLink } from '../urlSchema';
import { AREA_PARAM } from '../../../shared/areaIndex';
import { AGENCY_CARD_PARAM } from '../../../shared/pagePaths';
import { mergeUrlSearchParams } from '../syncUrlParams';

// CIV-2179: links are written in one order (place, route, day and time, filters); reading is order-free.
describe('one written order for link parameters (CIV-2179)', () => {
  it('writes place, then route, then day and time, then filters, whatever order the views set them in', () => {
    let qs = '';
    for (const update of [{ h: '15' }, { p: 'midday' }, { route: 'ttc::504' }, { day: 'Weekday' }, { span: '1' }, { lat: '43.65', lon: '-79.38', z: '12.00' }, { operator: 'ttc' }]) {
      qs = mergeUrlSearchParams(qs, update);
    }
    expect(qs).toBe('operator=ttc&lat=43.65&lon=-79.38&z=12.00&route=ttc%3A%3A504&day=Weekday&p=midday&h=15&span=1');
  });

  it('keeps a key it does not list after the listed ones, in the order it came', () => {
    expect(orderUrlParams(new URLSearchParams('zz=1&h=15&aa=2&operator=ttc')).toString()).toBe('operator=ttc&h=15&zz=1&aa=2');
  });

  it('opens an old link, written in any order, on the same view', () => {
    const old = '?h=15&span=1&p=midday&route=ttc::504&day=Weekday&lat=43.65&lon=-79.38&z=12';
    const reordered = `?${orderUrlParams(new URLSearchParams(old)).toString()}`;
    expect(readLink(reordered, MAP_URL)).toEqual(readLink(old, MAP_URL));
  });

  // A new link table key or codec parameter that isn't placed in the order would quietly land after every listed one.
  it('places every key the link tables and codecs write', () => {
    const tableKeys = Object.entries(schema)
      .filter(([name, v]) => name.endsWith('_URL') && v && typeof v === 'object')
      .flatMap(([, table]) => Object.values(table as Record<string, { key?: unknown }>).map(p => p?.key))
      .filter((k): k is string => typeof k === 'string');
    const codecKeys = Object.entries(schema).filter(([name, v]) => name.endsWith('_PARAM') && typeof v === 'string').map(([, v]) => v as string);
    const written = [...new Set([...tableKeys, ...codecKeys, AREA_PARAM, AGENCY_CARD_PARAM])];
    expect(written.length).toBeGreaterThan(30);
    expect(written.filter(k => !URL_PARAM_ORDER.includes(k))).toEqual([]);
  });

  it('lists every key once', () => {
    expect(new Set(URL_PARAM_ORDER).size).toBe(URL_PARAM_ORDER.length);
  });
});
