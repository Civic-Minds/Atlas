import { describe, expect, it } from 'vitest';
import { evaluateOnDemandRelease, heldBack, type OnDemandSnapshot } from '../onDemandGate';
import type { OnDemandGeometry, OnDemandIndexEntry } from '../../shared/onDemandData';
import { buildOnDemandRelease } from '../../src/data/onDemandExport';

const NOW = new Date('2026-10-11T00:00:00Z');
const square = (id: string, size = 0.1): GeoJSON.Feature<GeoJSON.Polygon> => ({
  type: 'Feature', id, properties: {},
  geometry: { type: 'Polygon', coordinates: [[[-79, 43], [-79 + size, 43], [-79 + size, 43 + size], [-79, 43 + size], [-79, 43]]] },
});

function snapshot(entries: Partial<OnDemandIndexEntry>[], geometries: OnDemandGeometry[]): OnDemandSnapshot {
  const services = entries.map(e => ({
    slug: 'test', public: false, bbox: [43, -79, 43.1, -78.9], geometryKey: `agencies/${e.slug ?? 'test'}.json`,
    ...e,
    area: { sourceUrl: 'https://x', sourceLabel: 'Test', sourceRetrievedAt: '2026-10-01', serviceName: 'Test On-Demand', availability: { Weekday: [] }, ...(e.area ?? {}) },
  })) as OnDemandIndexEntry[];
  return { index: { schemaVersion: 1, version: 'v', generatedAt: '', services }, geometries: new Map(geometries.map(g => [g.slug, g])) };
}

const flags = (s: OnDemandSnapshot, live: OnDemandSnapshot | null = null, audience: 'beta' | 'public' = 'beta') =>
  evaluateOnDemandRelease(s, live, { audience, now: NOW }).map(f => `${f.severity}:${f.flag}`);

describe('on-demand zone gate (CIV-50)', () => {
  it('passes every service Atlas ships today with no red flag', () => {
    const release = buildOnDemandRelease('beta');
    const findings = evaluateOnDemandRelease(
      { index: release.index, geometries: new Map(release.geometries.map(g => [g.slug, g])) }, null, { audience: 'beta', now: NOW });
    expect(findings.filter(f => f.severity === 'red')).toEqual([]);
  });

  it('blocks an open ring', () => {
    const open = square('z');
    (open.geometry.coordinates[0] as number[][]).pop();
    expect(flags(snapshot([{}], [{ slug: 'test', features: [open] }]))).toContain('red:invalid');
  });

  it('blocks a service that reads as eligibility-only', () => {
    expect(flags(snapshot([{ area: { sourceUrl: 'x', sourceLabel: 'x', serviceName: 'ADA Paratransit' } }], [{ slug: 'test', features: [square('z')] }])))
      .toContain('red:paratransit');
  });

  it('blocks a beta-only service in the public release', () => {
    expect(flags(snapshot([{}], [{ slug: 'test', features: [square('z')] }]), null, 'public')).toContain('red:leak');
  });

  it('blocks dropped zones, a shrunken area, lost hours and a removed service', () => {
    const live = snapshot([{}, { slug: 'gone' }], [
      { slug: 'test', features: [square('a'), square('b')] },
      { slug: 'gone', features: [square('c')] },
    ]);
    expect(flags(snapshot([{}], [{ slug: 'test', features: [square('a')] }]), live)).toEqual(expect.arrayContaining(['red:zone-drop']));
    const shrunk = snapshot([{}], [{ slug: 'test', features: [square('a', 0.05), square('b', 0.05)] }]);
    expect(flags(shrunk, live)).toContain('red:zone-drop');
    const noHours = snapshot([{ area: { sourceUrl: 'x', sourceLabel: 'x', sourceRetrievedAt: '2026-10-01', availability: undefined } }], [{ slug: 'test', features: [square('a'), square('b')] }]);
    expect(flags(noHours, snapshot([{}], [{ slug: 'test', features: [square('a'), square('b')] }]))).toContain('red:hours-lost');
    expect(evaluateOnDemandRelease(snapshot([{}], [{ slug: 'test', features: [square('a'), square('b')] }]), live, { audience: 'beta', now: NOW })
      .some(f => f.slug === 'gone' && f.flag === 'zone-drop')).toBe(true);
  });

  it('warns on a source checked over 180 days ago and blocks over a year', () => {
    const at = (date: string) => flags(snapshot([{ area: { sourceUrl: 'x', sourceLabel: 'x', sourceRetrievedAt: date, availability: {} } }], [{ slug: 'test', features: [square('z')] }]));
    expect(at('2026-03-01')).toContain('yellow:stale-source');
    expect(at('2025-09-01')).toContain('red:stale-source');
  });

  it('lets a reviewed flag through only for the named service and flag', () => {
    const findings = evaluateOnDemandRelease(snapshot([{}], [{ slug: 'test', features: [square('z')] }]), null, { audience: 'public', now: NOW });
    expect(heldBack(findings)).toEqual(new Set(['test']));
    expect(heldBack(findings, new Set(['test:leak']))).toEqual(new Set());
    expect(heldBack(findings, new Set(['other:leak']))).toEqual(new Set(['test']));
  });
});
