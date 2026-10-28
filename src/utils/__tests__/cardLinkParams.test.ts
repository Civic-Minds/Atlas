import { describe, expect, it } from 'vitest';
import {
  AGENCY_CARD_PARAM,
  encodeRouteChooserParam,
  HISTORY_AGENCY_PARAM,
  parseAgencyCardParam,
  parseHistoryUrlState,
  parseRouteChooserParam,
  ROUTE_CHOOSER_PARAM,
} from '../shareUrlState';
import { encodeStopBackTarget, parseStopBackTarget, STOP_BACK_PARAM, type StopBackTarget } from '../stopBack';
import { buildRouteKey } from '../routeKey';
import { mergeUrlSearchParams } from '../syncUrlParams';

// CIV-919: the agency card, the route chooser and the stop card's back target open from a link.

describe('card link param names', () => {
  it('never reuse a name another link already owns', () => {
    const taken = [HISTORY_AGENCY_PARAM, 'agencies', 'hide', 'area', 'route', 'stop', 'ondemand', 'hroute', 'highlight', 'cday', 'cp', 'ch', 'h', 'p', 'day', 'm'];
    for (const name of [AGENCY_CARD_PARAM, ROUTE_CHOOSER_PARAM, STOP_BACK_PARAM]) expect(taken).not.toContain(name);
    expect(new Set([AGENCY_CARD_PARAM, ROUTE_CHOOSER_PARAM, STOP_BACK_PARAM]).size).toBe(3);
  });

  it('leaves History reading its own agency, not the agency card', () => {
    expect(parseHistoryUrlState('?operator=ttc').agency).toBeNull();
    expect(parseAgencyCardParam('?agency=ttc')).toBeNull();
  });
});

describe('agency card param', () => {
  it('reads a slug', () => {
    expect(parseAgencyCardParam('?operator=ttc')).toBe('ttc');
    expect(parseAgencyCardParam(new URLSearchParams('operator=go-transit&route=ttc::504'))).toBe('go-transit');
  });

  it('ignores a missing or malformed value', () => {
    expect(parseAgencyCardParam('')).toBeNull();
    expect(parseAgencyCardParam('?operator=')).toBeNull();
    expect(parseAgencyCardParam('?operator=ttc::504')).toBeNull();
  });
});

describe('route chooser param', () => {
  it('round-trips plain, branch and comma-holding route keys', () => {
    const keys = ['ttc::504', buildRouteKey('ttc', '505', 'A'), 'miway::1,2', 'go-transit::LW'];
    const qs = mergeUrlSearchParams('', { [ROUTE_CHOOSER_PARAM]: encodeRouteChooserParam(keys) });
    expect(parseRouteChooserParam(qs)).toEqual(keys);
  });

  it('keeps a route ID with :: whole', () => {
    expect(parseRouteChooserParam('?routes=ttc::a::b,ttc::c')).toEqual(['ttc::a::b', 'ttc::c']);
  });

  it('writes nothing for fewer than two routes', () => {
    expect(encodeRouteChooserParam(null)).toBeNull();
    expect(encodeRouteChooserParam([])).toBeNull();
    expect(encodeRouteChooserParam(['ttc::504'])).toBeNull();
  });

  it('opens nothing for fewer than two usable keys', () => {
    expect(parseRouteChooserParam('')).toBeNull();
    expect(parseRouteChooserParam('?routes=ttc::504')).toBeNull();
    expect(parseRouteChooserParam('?routes=ttc::504,ttc::504')).toBeNull();
    expect(parseRouteChooserParam('?routes=ttc::504,junk')).toBeNull();
  });
});

describe('stop back param', () => {
  const targets: StopBackTarget[] = [
    { kind: 'route', route: 'ttc::504' },
    { kind: 'route', route: buildRouteKey('ttc', '505', 'A') },
    { kind: 'agency', agencySlug: 'ttc' },
    { kind: 'onDemand', selection: 'hsr' },
    { kind: 'onDemand', selection: 'hsr::Waterdown Area' },
  ];

  it.each(targets)('round-trips %o through the URL', target => {
    const qs = mergeUrlSearchParams('', { [STOP_BACK_PARAM]: encodeStopBackTarget(target) });
    expect(parseStopBackTarget(new URLSearchParams(qs).get(STOP_BACK_PARAM))).toEqual(target);
  });

  it('writes nothing for the map', () => {
    expect(encodeStopBackTarget(null)).toBeNull();
    expect(encodeStopBackTarget({ kind: 'map' })).toBeNull();
  });

  it('ignores a malformed value', () => {
    for (const raw of [null, '', 'route', 'route:', 'route:504', 'agency:TTC X', 'map:x', 'stop:ttc::1']) {
      expect(parseStopBackTarget(raw)).toBeNull();
    }
  });
});

describe('route chooser param from a map click', () => {
  it('writes a repeated key once', () => {
    expect(encodeRouteChooserParam(['ttc::504', 'ttc::503', 'ttc::504', 'ttc::510'])).toBe('ttc::504,ttc::503,ttc::510');
    expect(encodeRouteChooserParam(['ttc::504', 'ttc::504'])).toBeNull();
  });
});
