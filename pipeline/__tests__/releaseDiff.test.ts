import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applyOverrides,
  blockReason,
  buildGateReport,
  evaluateAgency,
  evaluateRun,
  overrideArgs,
  parseGateOverrides,
  summarizeArtifact,
  unknownOverrideSlugs,
  writeGateReport,
  type ArtifactSummary,
  type GateFlag,
} from '../releaseDiff.js';

// Fixtures are trimmed to route-line endpoints and the properties the gate reads.
// Real (2026-10-10 public release and eac22dac reprocess dry run): slorta,
// barrie, rtl, mountainline, the njt-rail light rail lines, TTC live lines.
// Reconstructed: ttc-holiday.json (real TTC lines with weekday headways halved
// by script, the Oct 12 double-counted holiday service) and the 14 commuter
// rail lines in njt-rail-live.json (real line names, approximate endpoints;
// the pre-Oct 8 artifact is no longer published).
// Real, weekday lines only (release-mv0iozy4 vs the 2026-10-11 final reprocess
// dry run): waco, clemson-cat, uga (#707).
const fixture = (name: string) => readFileSync(resolve('pipeline/__tests__/fixtures/release-diff', name), 'utf8');
const TODAY = '20261010';

/** A summary carrying only counts, for the drop cases where only counts matter. */
function countsOnly(stops: number, stopPoints: number, routes: number): ArtifactSummary {
  return { counts: { stops, stopPoints, routes }, modes: ['Bus'], contentHash: `counts-${stops}-${stopPoints}-${routes}`, routeSignatures: [], weekdayHeadways: {}, weekdayTiers: {}, weekdayDirectionHeadway: {}, centroid: null };
}

const names = (flags: GateFlag[]) => flags.map(f => `${f.slug}:${f.flag}:${f.level}`).sort();

describe('release diff gate: red flags', () => {
  it('flags sun-tran publishing a byte-identical copy of slorta (#615)', () => {
    const slorta = summarizeArtifact(fixture('slorta.json'), null);
    const sunTran = summarizeArtifact(fixture('slorta.json'), null);
    const flags = evaluateAgency(
      { slug: 'sun-tran', live: null, next: sunTran, allowMissingLive: true },
      [{ slug: 'slorta', summary: slorta }],
      TODAY,
    );
    expect(names(flags)).toEqual(['sun-tran:added:yellow', 'sun-tran:duplicate:red']);
    expect(flags.find(f => f.flag === 'duplicate')!.message).toMatch(/identical to slorta/);
  });

  it('flags near-identical output: same routes and shapes, different properties', () => {
    const slorta = summarizeArtifact(fixture('slorta.json'), null);
    const tweaked = JSON.parse(fixture('slorta.json')) as { features: Array<{ properties: Record<string, unknown> }> };
    for (const feature of tweaked.features) feature.properties.headway = 99;
    const flags = evaluateAgency(
      { slug: 'sun-tran', live: null, next: summarizeArtifact(JSON.stringify(tweaked), null), allowMissingLive: true },
      [{ slug: 'slorta', summary: slorta }],
      TODAY,
    );
    expect(names(flags)).toEqual(['sun-tran:added:yellow', 'sun-tran:duplicate:red']);
    expect(flags.find(f => f.flag === 'duplicate')!.message).toMatch(/100% the same as slorta/);
  });

  it('flags njt-rail losing commuter rail while light rail survives (#616)', () => {
    const live = summarizeArtifact(fixture('njt-rail-live.json'), null);
    const next = summarizeArtifact(fixture('njt-rail-new.json'), null);
    expect(live.modes).toEqual(['Commuter Rail', 'Tram/Light Rail']);
    const flags = evaluateAgency({ slug: 'njt-rail', live, next, allowMissingLive: true }, [], TODAY);
    expect(names(flags)).toContain('njt-rail:mode-lost:red');
    expect(flags.find(f => f.flag === 'mode-lost')!.message).toMatch(/loses Commuter Rail/);
  });

  it('flags sct 25 -> 10 routes and amarillo 344 -> 41 stops with the shared drop guard (#655)', () => {
    const sct = evaluateAgency({ slug: 'sct', live: countsOnly(2283, 2283, 25), next: countsOnly(1010, 1010, 10), allowMissingLive: true }, [], TODAY);
    expect(names(sct)).toEqual(['sct:drop:red']);
    expect(sct[0].message).toMatch(/routes 25 -> 10/);
    const amarillo = evaluateAgency({ slug: 'amarillo', live: countsOnly(344, 344, 12), next: countsOnly(41, 41, 12), allowMissingLive: true }, [], TODAY);
    expect(names(amarillo)).toEqual(['amarillo:drop:red']);
    expect(amarillo[0].message).toMatch(/stops 344 -> 41/);
  });

  it('flags an agency that becomes empty', () => {
    const flags = evaluateAgency({ slug: 'sct', live: countsOnly(2283, 2283, 25), next: countsOnly(0, 0, 0), allowMissingLive: true }, [], TODAY);
    expect(names(flags)).toEqual(['sct:drop:red', 'sct:empty:red']);
  });

  it('reprocess still refuses when live data cannot be read; refresh and publish allow it', () => {
    const next = countsOnly(10, 10, 2);
    expect(names(evaluateAgency({ slug: 'x', live: null, next, allowMissingLive: false }, [], TODAY))).toEqual(['x:drop:red']);
    expect(names(evaluateAgency({ slug: 'x', live: null, next, allowMissingLive: true }, [], TODAY))).toEqual(['x:added:yellow']);
  });

  it('flags the real Oct 12 holiday shift in RTL (reprocess dry run vs public release)', () => {
    const live = summarizeArtifact(fixture('rtl-live.json'), null);
    const next = summarizeArtifact(fixture('rtl-new.json'), null);
    const flags = evaluateAgency({ slug: 'rtl', live, next, allowMissingLive: true }, [], TODAY);
    expect(names(flags)).toEqual(['rtl:headway-shift:red']);
    expect(flags[0].message).toMatch(/7 of 12 routes/);
  });

  it('flags the TTC Oct 12 holiday case: weekday headways halve on most routes, 506 included (#658)', () => {
    const live = summarizeArtifact(fixture('ttc-live.json'), null);
    const next = summarizeArtifact(fixture('ttc-holiday.json'), null);
    const flags = evaluateAgency({ slug: 'ttc', live, next, allowMissingLive: true }, [], TODAY);
    expect(names(flags)).toEqual(['ttc:headway-shift:red']);
    expect(flags[0].message).toMatch(/9 of 12 routes/);
    const route506 = Object.keys(live.weekdayHeadways).find(id => live.weekdayHeadways[id] === 10 && next.weekdayHeadways[id] === 5);
    expect(route506).toBeDefined();
  });

  it('only warns when a small share of routes shift', () => {
    const live = summarizeArtifact(fixture('ttc-live.json'), null);
    const holiday = JSON.parse(fixture('ttc-holiday.json')) as { features: Array<{ properties: Record<string, unknown> }> };
    const original = JSON.parse(fixture('ttc-live.json')) as { features: Array<{ properties: Record<string, unknown> }> };
    // Keep the halving on 3 of 12 routes (25%): yellow, not red.
    const keep = new Set(['506', '501', '504']);
    holiday.features.forEach((feature, i) => {
      if (!keep.has(String(feature.properties.routeShortName))) feature.properties.headway = original.features[i].properties.headway;
    });
    const flags = evaluateAgency({ slug: 'ttc', live, next: summarizeArtifact(JSON.stringify(holiday), null), allowMissingLive: true }, [], TODAY);
    expect(names(flags)).toEqual(['ttc:headway-shift:yellow']);
  });

  it('flags one shifted route at an agency too small for headway-shift: waco TL-32 60 -> 25 (#707)', () => {
    const live = summarizeArtifact(fixture('waco-live.json'), null);
    const next = summarizeArtifact(fixture('waco-new.json'), null);
    const flags = evaluateAgency({ slug: 'waco', live, next, allowMissingLive: true }, [], TODAY);
    expect(names(flags)).toEqual(['waco:route-shift:yellow']);
    expect(flags[0].message).toMatch(/^1 route .*\(TL-32 60->25 min\)$/);
  });

  it('flags tier jumps of 2+ steps: clemson-cat TL-24 and TL-69 from infrequent (#707)', () => {
    const live = summarizeArtifact(fixture('clemson-cat-live.json'), null);
    const next = summarizeArtifact(fixture('clemson-cat-new.json'), null);
    expect(live.weekdayTiers).toMatchObject({ 'TL-24': 'infrequent', 'TL-69': 'infrequent' });
    const flags = evaluateAgency({ slug: 'clemson-cat', live, next, allowMissingLive: true }, [], TODAY);
    expect(names(flags)).toEqual(['clemson-cat:route-shift:yellow']);
    expect(flags[0].message).toContain('TL-24 tier infrequent->30, 131->27 min');
    expect(flags[0].message).toContain('TL-69 tier infrequent->20, 203->5 min');
  });

  it('flags uga M Milledge 15 -> 4 with its tier unchanged (#707)', () => {
    const live = summarizeArtifact(fixture('uga-live.json'), null);
    const next = summarizeArtifact(fixture('uga-new.json'), null);
    expect([live.weekdayTiers['5738'], next.weekdayTiers['5738']]).toEqual(['20', '20']);
    const flags = evaluateAgency({ slug: 'uga', live, next, allowMissingLive: true }, [], TODAY);
    expect(names(flags)).toEqual(['uga:route-shift:yellow']);
    expect(flags[0].message).toContain('5738 15->4 min');
  });

  it('takes the most frequent tier across a route\'s directions and ignores tiers off the scale', () => {
    const line = (routeId: string, tier: string, headway: number | null) => ({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
      properties: { routeId, day: 'Weekday', tier, headway },
    });
    const artifact = (features: unknown[]) => JSON.stringify({ type: 'FeatureCollection', features });
    const live = summarizeArtifact(artifact([line('A', '60', 30), line('A', '15', 12), line('A', 'span', null), line('SKYT', '5', 5)]), null);
    expect(live.weekdayTiers).toEqual({ A: '15' });
    // A one-step tier move and a headway change under 2x stay quiet; the legacy
    // rail tier '5' -> '10' (valleymetro SKYT, a correct change) is not a tier change.
    const next = summarizeArtifact(artifact([line('A', '30', 20), line('A', '20', 18), line('SKYT', '10', 5)]), null);
    expect(evaluateAgency({ slug: 'x', live, next, allowMissingLive: true }, [], TODAY)).toEqual([]);
  });

  it('flags already-expired service as red when the output changes, yellow when unchanged', () => {
    const live = countsOnly(193, 193, 6);
    const changed = { ...countsOnly(193, 193, 6), contentHash: 'other' };
    expect(names(evaluateAgency({ slug: 'moose-jaw', live, next: changed, service: { end: '20240331' }, allowMissingLive: true }, [], TODAY)))
      .toEqual(['moose-jaw:expired:red']);
    expect(names(evaluateAgency({ slug: 'moose-jaw', live, next: live, service: { end: '20240331' }, allowMissingLive: true }, [], TODAY)))
      .toEqual(['moose-jaw:expired:yellow']);
  });

  it('keeps expired agencies that are already live yellow, and still blocks a new-to-release expired one until allowed', () => {
    const live = countsOnly(193, 193, 6);
    // Stale agency: refresh kept its live data, so the release copy is unchanged.
    expect(names(evaluateAgency({ slug: 'ecat', live, next: live, service: { end: '20221101' }, allowMissingLive: true }, [], TODAY)))
      .toEqual(['ecat:expired:yellow']);
    // Expired and not in the live release yet: red, accepted only by an explicit allow.
    const flags = evaluateAgency({ slug: 'xpress-ga', live: null, next: live, service: { end: '20250705' }, allowMissingLive: true }, [], TODAY);
    expect(names(flags)).toEqual(expect.arrayContaining(['xpress-ga:expired:red']));
    expect(applyOverrides(flags, { allow: [], allowDrop: false }).blocked).toEqual(['xpress-ga']);
    expect(applyOverrides(flags, { allow: ['xpress-ga:expired'], allowDrop: false }).blocked).toEqual([]);
  });
});

describe('release diff gate: yellow and clean cases', () => {
  it('warns, without blocking, when service starts in the future (Breeze/scat starts Oct 19)', () => {
    const flags = evaluateAgency(
      { slug: 'scat', live: null, next: countsOnly(1239, 1239, 15), service: { start: '20261019', end: '20261204' }, allowMissingLive: true },
      [],
      TODAY,
    );
    expect(names(flags)).toEqual(['scat:added:yellow', 'scat:future-start:yellow']);
    expect(applyOverrides(flags, { allowDrop: false, allow: [] }).blocked).toEqual([]);
  });

  it('warns, without blocking, about a placeholder far-future calendar end (bc-ferries 20500101)', () => {
    const live = countsOnly(50, 50, 20);
    const flags = evaluateAgency(
      { slug: 'bc-ferries', live, next: live, service: { end: '20270331', calendarEnd: '20500101' }, allowMissingLive: true },
      [],
      TODAY,
    );
    expect(names(flags)).toEqual(['bc-ferries:placeholder-expiry:yellow']);
    expect(applyOverrides(flags, { allowDrop: false, allow: [] }).blocked).toEqual([]);
    // Without a separate calendar end, the service end itself is checked.
    expect(names(evaluateAgency({ slug: 'bc-ferries', live, next: live, service: { end: '20500101' }, allowMissingLive: true }, [], TODAY)))
      .toEqual(['bc-ferries:placeholder-expiry:yellow']);
  });

  it('does not flag a calendar end within 2 years (coast-transit-ms 20261231)', () => {
    const live = countsOnly(300, 300, 12);
    expect(evaluateAgency({ slug: 'coast-transit-ms', live, next: live, service: { end: '20260930', calendarEnd: '20261231' }, allowMissingLive: true }, [], '20260901'))
      .toEqual([]);
  });

  it('passes a clean agency (barrie) against its live data and a different agency nearby', async () => {
    const live = summarizeArtifact(fixture('barrie-live.json'), fixture('barrie-live-stops.json'));
    const next = summarizeArtifact(fixture('barrie-new.json'), fixture('barrie-new-stops.json'));
    expect(next.counts).toEqual({ stops: 555, stopPoints: 557, routes: 15 });
    const slorta = summarizeArtifact(fixture('slorta.json'), null);
    const flags = await evaluateRun({
      candidates: [{ slug: 'barrie', next, service: { start: '20260920', end: '20261226' } }],
      getLive: async slug => (slug === 'barrie' ? live : slug === 'slorta' ? slorta : null),
      registry: [{ slug: 'barrie', center: [44.3894, -79.6903] }, { slug: 'slorta', center: [35.28, -120.66] }],
      todayYmd: TODAY,
      allowMissingLive: false,
    });
    expect(flags).toEqual([]);
  });

  it('compares a run against nearby live agencies that are not in it', async () => {
    const slorta = summarizeArtifact(fixture('slorta.json'), null);
    const asked: string[] = [];
    const flags = await evaluateRun({
      candidates: [{ slug: 'sun-tran', next: summarizeArtifact(fixture('slorta.json'), null) }],
      getLive: async slug => { asked.push(slug); return slug === 'slorta' ? slorta : null; },
      registry: [{ slug: 'sun-tran', center: [32.22, -110.97] }, { slug: 'slorta', center: [35.28, -120.66] }, { slug: 'barrie', center: [44.39, -79.69] }],
      todayYmd: TODAY,
      allowMissingLive: true,
    });
    expect(names(flags)).toEqual(['sun-tran:added:yellow', 'sun-tran:duplicate:red']);
    expect(asked.sort()).toEqual(['slorta', 'sun-tran']);
  });
});

describe('release diff gate: agencies new to the release', () => {
  // The staged agencies joining in #673 (ottumwa and others) have 2026-09-10
  // artifacts without atlasSchemaVersion and are not in the current release.
  it('reports a pre-v2 live artifact as added, not as a drop or an emptied agency', () => {
    const legacy = JSON.parse(fixture('barrie-live.json')) as Record<string, unknown> & { features: unknown[] };
    delete legacy.atlasSchemaVersion;
    legacy.features = [];
    const flags = evaluateAgency(
      { slug: 'ottumwa', live: summarizeArtifact(JSON.stringify(legacy), null), next: summarizeArtifact(fixture('barrie-new.json'), fixture('barrie-new-stops.json')), allowMissingLive: false },
      [],
      TODAY,
    );
    expect(names(flags)).toEqual(['ottumwa:added:yellow']);
    expect(flags[0].message).toMatch(/predates route schema v2/);
  });

  it('reports an agency missing from the current release as added, without blocking', () => {
    const flags = evaluateAgency({ slug: 'ottumwa', live: null, next: summarizeArtifact(fixture('barrie-new.json'), null), allowMissingLive: true }, [], TODAY);
    expect(names(flags)).toEqual(['ottumwa:added:yellow']);
    expect(applyOverrides(flags, { allowDrop: false, allow: [] }).blocked).toEqual([]);
  });
});

describe('release diff gate: hidden agencies', () => {
  const slorta = summarizeArtifact(fixture('slorta.json'), null);
  const copy = summarizeArtifact(fixture('slorta.json'), null);

  it('mountainline matching a hidden ycat (#674) is yellow in the report and does not block', async () => {
    const mountainline = summarizeArtifact(fixture('mountainline.json'), null);
    const ycatCopy = summarizeArtifact(fixture('mountainline.json'), null);
    const flags = await evaluateRun({
      candidates: [{ slug: 'mountainline', next: mountainline }],
      getLive: async slug => (slug === 'mountainline' ? mountainline : null),
      getHiddenLive: async slug => (slug === 'ycat' ? ycatCopy : null),
      // Registry centers are 350 km apart: hidden peers are checked regardless of distance.
      registry: [{ slug: 'mountainline', center: [35.2, -111.65] }, { slug: 'ycat', center: [32.73, -114.63], hiddenInProduction: true }],
      todayYmd: TODAY,
      allowMissingLive: true,
    });
    expect(names(flags)).toEqual(['mountainline:duplicate:yellow']);
    expect(flags[0].message).toMatch(/identical to ycat \(ycat is hidden, so this does not block\)/);
    expect(applyOverrides(flags, { allowDrop: false, allow: [] }).blocked).toEqual([]);
    // Before hiding, both visible: red on both sides.
    const visible = evaluateAgency({ slug: 'mountainline', live: mountainline, next: mountainline, allowMissingLive: true }, [{ slug: 'ycat', summary: ycatCopy }], TODAY);
    expect(names(visible)).toEqual(['mountainline:duplicate:red']);
  });

  it('only warns about a hidden or staged copy (#621), but a hidden candidate is still red against a visible one (#615)', async () => {
    const registry = [
      { slug: 'slorta', center: [35.28, -120.66] },
      { slug: 'slorta-hidden-copy', center: [35.28, -120.66], hiddenInProduction: true },
      { slug: 'sun-tran', center: [32.22, -110.97], hiddenInProduction: true },
    ];
    const visible = await evaluateRun({
      candidates: [{ slug: 'slorta', next: slorta }],
      getLive: async slug => (slug === 'slorta-hidden-copy' ? copy : null),
      registry,
      todayYmd: TODAY,
      allowMissingLive: true,
    });
    expect(names(visible)).toEqual(['slorta:added:yellow', 'slorta:duplicate:yellow']);
    const hidden = await evaluateRun({
      candidates: [{ slug: 'sun-tran', next: copy }],
      getLive: async slug => (slug === 'slorta' ? slorta : null),
      registry,
      todayYmd: TODAY,
      allowMissingLive: true,
    });
    expect(names(hidden)).toEqual(['sun-tran:added:yellow', 'sun-tran:duplicate:red']);
  });
});

describe('release diff gate: weekday headway lost (#710)', () => {
  // Shapes of the 2026-10-11 dry run on 65ab63cb: limited lines keep tier
  // 'infrequent' and drop their headway.
  const line = (routeId: string, directionId: number, headway: number | null) => ({
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[routeId.length, directionId], [1, 1]] },
    properties: { routeId, directionId, day: 'Weekday', tier: headway == null ? 'infrequent' : headway <= 30 ? '30' : '60', headway },
  });
  const artifact = (features: unknown[]) => JSON.stringify({ type: 'FeatureCollection', features });
  const network = (headwayFor: (routeId: string, directionId: number) => number | null) =>
    artifact(['1', '2', '3', '4', '5'].flatMap(id => [0, 1].map(dir => line(id, dir, headwayFor(id, dir)))));
  const live = summarizeArtifact(network(() => 30), null);

  it('is red when most of an agency loses its weekday headways (lanta: every route shown as limited)', () => {
    const next = summarizeArtifact(network(id => (id === '5' ? 30 : null)), null);
    const flags = evaluateAgency({ slug: 'lanta', live, next, allowMissingLive: true }, [], TODAY);
    // 30 -> infrequent is also a 2-step tier move, which route-shift lists.
    expect(names(flags)).toEqual(['lanta:headway-lost:red', 'lanta:route-shift:yellow']);
    expect(flags.find(f => f.flag === 'headway-lost')!.message).toMatch(/^8 of 10 weekday route\/directions .* \(80%; 1 d0, 1 d1, 2 d0/);
    expect(applyOverrides(flags, { allowDrop: false, allow: [] }).blocked).toEqual(['lanta']);
    expect(applyOverrides(flags, parseGateOverrides(['--allow', 'lanta:headway-lost'])).blocked).toEqual([]);
  });

  it('is yellow when one direction loses its headway while the other keeps it (kalamazoo 1 d1)', () => {
    const next = summarizeArtifact(network((id, dir) => (id === '1' && dir === 1 ? null : 30)), null);
    // The route-level median is still 30, so route-shift alone never sees it.
    expect(next.weekdayHeadways['1']).toBe(30);
    const flags = evaluateAgency({ slug: 'kalamazoo', live, next, allowMissingLive: true }, [], TODAY);
    expect(names(flags)).toEqual(['kalamazoo:headway-lost:yellow']);
    expect(flags[0].message).toBe('1 of 10 weekday route/directions with a headway live have none now (10%; 1 d1)');
  });

  it('stays quiet for unchanged routes and for route/directions dropped outright', () => {
    expect(evaluateAgency({ slug: 'x', live, next: live, allowMissingLive: true }, [], TODAY)).toEqual([]);
    const dropped = JSON.parse(network(() => 30)) as { features: Array<{ properties: { routeId: string; directionId: number } }> };
    dropped.features = dropped.features.filter(f => !(f.properties.routeId === '1' && f.properties.directionId === 1));
    const flags = evaluateAgency({ slug: 'x', live, next: summarizeArtifact(JSON.stringify(dropped), null), allowMissingLive: true }, [], TODAY);
    expect(flags.filter(f => f.flag === 'headway-lost')).toEqual([]);
  });
});

describe('release diff gate: day type lost or shrunk (#741)', () => {
  // Shapes of the 2026-10-12 bundle dry run: clallamtransit Saturday 26 -> 0
  // and Sunday 4 -> 0, while its weekday lines stay.
  const line = (routeId: string, directionId: number, day: string) => ({
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[Number(routeId), directionId], [1, 1]] },
    properties: { routeId, directionId, day, tier: '30', headway: 30 },
  });
  const network = (routes: Record<string, number>) => JSON.stringify({
    type: 'FeatureCollection',
    features: Object.entries(routes).flatMap(([day, n]) =>
      Array.from({ length: n }, (_, i) => line(String(Math.floor(i / 2) + 1), i % 2, day))),
  });
  const live = summarizeArtifact(network({ Weekday: 20, Saturday: 12, Sunday: 4 }), null);

  it('counts route lines per day type', () => {
    expect(live.dayFeatures).toEqual({ Weekday: 20, Saturday: 12, Sunday: 4 });
  });

  it('is red when an agency loses Saturday, and lists every lost day', () => {
    const next = summarizeArtifact(network({ Weekday: 20, Sunday: 4 }), null);
    const flags = evaluateAgency({ slug: 'clallamtransit', live, next, allowMissingLive: true }, [], TODAY);
    expect(names(flags)).toEqual(['clallamtransit:day-lost:red']);
    expect(flags[0].message).toBe('no route lines on Saturday now (Saturday 12 -> 0)');
    expect(applyOverrides(flags, { allowDrop: false, allow: [] }).blocked).toEqual(['clallamtransit']);
    const both = evaluateAgency({ slug: 'raba', live, next: summarizeArtifact(network({ Weekday: 20 }), null), allowMissingLive: true }, [], TODAY);
    expect(both.map(f => f.message)).toEqual(['no route lines on Saturday, Sunday now (Saturday 12 -> 0, Sunday 4 -> 0)']);
  });

  it('passes with --allow <slug>:day-lost, which forwards like the other flags', () => {
    const next = summarizeArtifact(network({ Weekday: 20, Sunday: 4 }), null);
    const flags = evaluateAgency({ slug: 'clallamtransit', live, next, allowMissingLive: true }, [], TODAY);
    const overrides = parseGateOverrides(['--allow', 'clallamtransit:day-lost', '--allow=raba:day-shrunk']);
    expect(overrides.errors).toEqual([]);
    expect(overrideArgs(overrides)).toEqual(['--allow', 'clallamtransit:day-lost', '--allow', 'raba:day-shrunk']);
    const result = applyOverrides(flags, overrides);
    expect(result.blocked).toEqual([]);
    expect(result.flags[0].allowed).toBe(true);
  });

  it('is yellow when a day type falls below 65% of live (cdta Saturday 92 -> 56)', () => {
    const next = summarizeArtifact(network({ Weekday: 20, Saturday: 7, Sunday: 4 }), null);
    const flags = evaluateAgency({ slug: 'cdta', live, next, allowMissingLive: true }, [], TODAY);
    expect(names(flags)).toEqual(['cdta:day-shrunk:yellow']);
    expect(flags[0].message).toBe('route lines on Saturday fall below 65% of live (Saturday 12 -> 7)');
    expect(applyOverrides(flags, { allowDrop: false, allow: [] }).blocked).toEqual([]);
  });

  it('stays quiet for normal small changes, small live counts, empty output and summaries without day counts', () => {
    // 12 -> 8 (67%) and 4 -> 2 (live under 5) are ordinary schedule changes.
    const small = summarizeArtifact(network({ Weekday: 18, Saturday: 8, Sunday: 2 }), null);
    expect(evaluateAgency({ slug: 'x', live, next: small, allowMissingLive: true }, [], TODAY).filter(f => f.flag.startsWith('day-'))).toEqual([]);
    expect(evaluateAgency({ slug: 'x', live, next: live, allowMissingLive: true }, [], TODAY)).toEqual([]);
    const empty = summarizeArtifact(JSON.stringify({ type: 'FeatureCollection', features: [] }), null);
    expect(names(evaluateAgency({ slug: 'x', live, next: empty, allowMissingLive: true }, [], TODAY)).filter(n => n.includes(':day-'))).toEqual([]);
    const { dayFeatures: _omit, ...noDays } = live;
    const noWeekend = summarizeArtifact(network({ Weekday: 20 }), null);
    expect(evaluateAgency({ slug: 'x', live: noDays, next: noWeekend, allowMissingLive: true }, [], TODAY).filter(f => f.flag.startsWith('day-'))).toEqual([]);
  });
});

describe('release diff gate: overrides', () => {
  const sct = evaluateAgency({ slug: 'sct', live: countsOnly(2283, 2283, 25), next: countsOnly(1010, 1010, 10), allowMissingLive: true }, [], TODAY);
  const amarillo = evaluateAgency({ slug: 'amarillo', live: countsOnly(344, 344, 12), next: countsOnly(41, 41, 12), allowMissingLive: true }, [], TODAY);
  const njt = evaluateAgency(
    { slug: 'njt-rail', live: summarizeArtifact(fixture('njt-rail-live.json'), null), next: summarizeArtifact(fixture('njt-rail-new.json'), null), allowMissingLive: true },
    [],
    TODAY,
  );

  it('--allow <slug>:<flag> accepts exactly one flag for one agency', () => {
    const overrides = parseGateOverrides(['sct', '--allow', 'sct:drop', 'amarillo']);
    expect(overrides.rest).toEqual(['sct', 'amarillo']);
    const result = applyOverrides([...sct, ...amarillo, ...njt], overrides);
    expect(result.blocked).toEqual(['amarillo', 'njt-rail']);
    expect(result.flags.find(f => f.slug === 'sct')!.allowed).toBe(true);
    expect(blockReason('sct', result)).toBeNull();
    expect(blockReason('amarillo', result)).toMatch(/pass --allow-drop or --allow amarillo:drop after review/);
  });

  it('an override for one flag does not accept another flag on the same agency', () => {
    const result = applyOverrides(njt, parseGateOverrides(['--allow=njt-rail:drop']));
    expect(result.blocked).toEqual(['njt-rail']);
    expect(blockReason('njt-rail', result)).toMatch(/mode-lost/);
    expect(applyOverrides(njt, parseGateOverrides(['--allow', 'njt-rail:mode-lost', '--allow', 'njt-rail:drop'])).blocked).toEqual([]);
  });

  it('--allow-drop keeps its old meaning: every drop, nothing else', () => {
    const overrides = parseGateOverrides(['--allow-drop']);
    expect(applyOverrides([...sct, ...amarillo], overrides).blocked).toEqual([]);
    expect(applyOverrides(njt, overrides).blocked).toEqual(['njt-rail']);
  });

  it('rejects malformed overrides, unknown flags and unknown agencies', () => {
    expect(parseGateOverrides(['--allow', 'sct']).errors[0]).toMatch(/expects <slug>:<flag>/);
    expect(parseGateOverrides(['--allow', 'sct:everything']).errors[0]).toMatch(/unknown flag/);
    expect(unknownOverrideSlugs(parseGateOverrides(['--allow', 'nope:drop']), ['sct'])).toEqual(['--allow nope:drop: unknown agency']);
  });

  it('round-trips overrides so refresh-release can forward them to publish', () => {
    const overrides = parseGateOverrides(['--allow-drop', '--allow', 'sct:drop']);
    expect(overrideArgs(overrides)).toEqual(['--allow-drop', '--allow', 'sct:drop']);
  });

  it('writes a markdown and JSON report', () => {
    const result = applyOverrides([...sct, ...amarillo], parseGateOverrides(['--allow', 'sct:drop']));
    const report = buildGateReport('release-test', 'publish-data-release', ['sct', 'amarillo', 'barrie'], { allowDrop: false, allow: ['sct:drop'] }, result);
    const paths = writeGateReport(report, mkdtempSync(join(tmpdir(), 'release-diff-')));
    expect(readFileSync(paths.md, 'utf8')).toMatch(/\*\*Blocked \(1\):\*\* amarillo/);
    expect(readFileSync(paths.md, 'utf8')).toMatch(/\| sct \| red \(allowed\) \| drop \|/);
    expect(JSON.parse(readFileSync(paths.json, 'utf8')).blocked).toEqual(['amarillo']);
  });
});

describe('release diff gate: route gains weekday service (#714)', () => {
  const line = (routeId: string, day: string, headway: number) => ({
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[routeId.length, day.length], [1, 1]] },
    properties: { routeId, directionId: 0, day, tier: headway <= 30 ? '30' : '60', headway },
  });
  const artifact = (features: unknown[]) => summarizeArtifact(JSON.stringify({ type: 'FeatureCollection', features }), null);
  const live = artifact([line('1', 'Weekday', 30), line('2', 'Saturday', 60)]);

  it('flags a weekend-only live route that now has weekday rows', () => {
    const next = artifact([line('1', 'Weekday', 30), line('2', 'Saturday', 60), line('2', 'Weekday', 5)]);
    const flags = evaluateAgency({ slug: 'x', live, next, allowMissingLive: true }, [], TODAY);
    expect(names(flags)).toEqual(['x:route-shift:yellow']);
    expect(flags[0].message).toBe('1 route with no weekday service live now runs on weekdays (2 new weekday service, 5 min)');
  });

  it('stays quiet for brand-new routes and routes that already had weekday rows', () => {
    const next = artifact([line('1', 'Weekday', 30), line('2', 'Saturday', 60), line('3', 'Weekday', 5)]);
    expect(evaluateAgency({ slug: 'x', live, next, allowMissingLive: true }, [], TODAY)).toEqual([]);
  });
});

describe('mode-lost reads the agency mode overrides (#861)', () => {
  const tram = (routeType: number) => ({
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[-73.95, 40.76], [-73.96, 40.75]] },
    properties: { routeId: '10092', directionId: 0, day: 'Weekday', tier: '15', headway: 10, routeType, routeLongName: 'Roosevelt Island Aerial Tramway' },
  });
  const bus = {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[-73.94, 40.76], [-73.95, 40.77]] },
    properties: { routeId: '10093', directionId: 0, day: 'Weekday', tier: '15', headway: 12, routeType: 3, routeLongName: 'RIOC Red Bus' },
  };
  const json = (routeType: number) => JSON.stringify({ type: 'FeatureCollection', features: [tram(routeType), bus] });

  it('a tram the override maps back to gondola keeps its mode', () => {
    const live = summarizeArtifact(json(6), null, 'rioc-tram');
    const next = summarizeArtifact(json(0), null, 'rioc-tram');
    expect(next.modes).toEqual(live.modes);
    expect(names(evaluateAgency({ slug: 'rioc-tram', live, next, allowMissingLive: true }, [], TODAY))).not.toContain('rioc-tram:mode-lost:red');
  });

  it('still flags the change without the agency (no override applies)', () => {
    const live = summarizeArtifact(json(6), null);
    const next = summarizeArtifact(json(0), null);
    expect(names(evaluateAgency({ slug: 'rioc-tram', live, next, allowMissingLive: true }, [], TODAY))).toContain('rioc-tram:mode-lost:red');
  });
});
