import { describe, expect, it } from 'vitest';
import { flagsFor, matchedRoutes, planSidecarNoTrip, routeKeyMismatch } from '../historyV2NoTrip.js';
import { assertReplacementApproved, checkNoTripAddition, checkReplacement } from '../historyV2Replace.js';
import { buildRouteSnapshots, newBuildReport } from '../historyV2Build.js';
import { parseHistoryV2Sidecar } from '../../shared/historyV2Reader.js';

// CIV-1850: a published sidecar (compact JSON, as the backfill and refresh write it).
const pub = JSON.stringify({ version: 2, slug: 'ttc', periodKey: '20191123', refDate: '20191120', routes: {
  81: { name: 'Thorncliffe Park', rep: { h: 20, p: { amPeak: 15, midday: null, pmPeak: 15 } } },
  501: { name: 'Queen', rep: { h: 8, p: { amPeak: 8, midday: 8 }, tp: { midday: 6 } }, sat: { h: 10 } },
  9: { rep: { lim: true } },
}, refDateQuality: { holiday: false, reason: 'r' } });

describe('planSidecarNoTrip (add-only, truth guard)', () => {
  it('adds the list only to flagged routes; removing it gives the published bytes back', () => {
    const plan = planSidecarNoTrip(pub, { 81: ['midday', 'late'], 501: [], 9: ['midday'] });
    expect(plan).toMatchObject({ kind: 'add', routes: 2, byPeriod: { midday: 2, late: 1 } });
    if (plan.kind !== 'add') throw new Error('expected add');
    const out = JSON.parse(plan.body);
    expect(out.routes['81'].noTripPeriods).toEqual(['midday', 'late']);
    expect(out.routes['501'].noTripPeriods).toBeUndefined();
    expect(checkNoTripAddition(pub, plan.body)).toMatchObject({ ok: true });
    expect(parseHistoryV2Sidecar(out).ok).toBe(true);
  });

  it('skips the whole period when a flag lands on a period the route shows a number for', () => {
    expect(planSidecarNoTrip(pub, { 81: ['midday'], 501: ['midday'] })).toEqual({ kind: 'disagree', routes: [{ route: '501', periods: ['midday'] }] });
    expect(planSidecarNoTrip(pub, { 81: ['amPeak'] })).toMatchObject({ kind: 'disagree' });
  });

  it('leaves a sidecar with nothing flagged, one already recorded, or one not in compact form', () => {
    expect(planSidecarNoTrip(pub, {})).toEqual({ kind: 'skip', reason: 'no route flagged' });
    const recorded = JSON.stringify({ ...JSON.parse(pub), routes: { 81: { rep: { h: 20 }, noTripPeriods: ['late'] } } });
    expect(planSidecarNoTrip(recorded, { 81: ['late'] })).toMatchObject({ kind: 'skip' });
    expect(planSidecarNoTrip(JSON.stringify(JSON.parse(pub), null, 1), { 81: ['late'] })).toMatchObject({ kind: 'skip' });
  });
});

describe('checkNoTripAddition (mode add-noTripPeriods)', () => {
  const add = (mut: (o: any) => void) => { const o = JSON.parse(pub); mut(o); return JSON.stringify(o); };

  it('refuses any other change, an empty or unknown list, or a flag on a shown number', () => {
    expect(checkNoTripAddition(pub, add(o => { o.routes['81'].noTripPeriods = ['late']; o.routes['81'].rep.h = 19; })).ok).toBe(false);
    expect(checkNoTripAddition(pub, add(o => { o.routes['81'].noTripPeriods = []; })).ok).toBe(false);
    expect(checkNoTripAddition(pub, add(o => { o.routes['81'].noTripPeriods = ['brunch']; })).ok).toBe(false);
    expect(checkNoTripAddition(pub, add(o => { o.routes['501'].noTripPeriods = ['midday']; })).ok).toBe(false);
    expect(checkNoTripAddition(pub, add(o => { o.refDate = '20191121'; })).ok).toBe(false);
    expect(checkReplacement('add-noTripPeriods', pub, add(o => { o.routes['81'].noTripPeriods = ['late']; })).ok).toBe(true);
  });

  it('CIV-1850 approves the add-only mode for the sidecar agencies only; CIV-1430 is unchanged', () => {
    expect(assertReplacementApproved('CIV-1850', 'ttc')).toBe('add-noTripPeriods');
    expect(() => assertReplacementApproved('CIV-1850', 'stm')).toThrow(/does not cover/);
    expect(assertReplacementApproved('CIV-1430', 'mbta')).toBe('full');
    expect(assertReplacementApproved('CIV-1862', 'mbta')).toBe('add-noTripPeriods');
  });
});

describe('the sidecar parser and the History build', () => {
  it('the parser accepts a valid list and refuses a bad one', () => {
    const withList = (v: unknown) => ({ ...JSON.parse(pub), routes: { 81: { rep: { h: 20 }, noTripPeriods: v } } });
    expect(parseHistoryV2Sidecar(withList(['midday'])).ok).toBe(true);
    expect(parseHistoryV2Sidecar(withList([])).ok).toBe(false);
    expect(parseHistoryV2Sidecar(withList(['midday', 'midday'])).ok).toBe(false);
  });

  const cand = (v2: object, change?: object) => ({ periodKey: '20191123', v2: { refDate: '20191120', rep: { h: 20 }, ...v2 } as never, ...(change ? { change: change as never } : {}) });
  const snap = (c: ReturnType<typeof cand>) => buildRouteSnapshots('ttc', '81', [c], 2026, newBuildReport())[0];

  it('a snapshot without the field anywhere is unchanged (no noTripPeriods key)', () => {
    expect(snap(cand({}))).not.toHaveProperty('noTripPeriods');
    expect(snap(cand({}, { noTripPeriods: null }))).not.toHaveProperty('noTripPeriods');
  });

  it('reads the sidecar list when there is no change-file list, and the change file wins when both exist', () => {
    expect(snap(cand({ noTripPeriods: ['midday'] })).noTripPeriods).toEqual(['midday']);
    expect(snap(cand({ noTripPeriods: ['midday'] }, { noTripPeriods: ['late'] })).noTripPeriods).toEqual(['late']);
    expect(snap(cand({}, { noTripPeriods: ['late'] })).noTripPeriods).toEqual(['late']);
  });

  it('the snapshot v2 record does not carry the list (its bytes stay as before)', () => {
    expect(snap(cand({ noTripPeriods: ['midday'] })).v2).not.toHaveProperty('noTripPeriods');
  });
});

describe('routeKeyMismatch (no-hash sidecars)', () => {
  it('compares the read keys with the published ones, supplemental routes aside', () => {
    const sc = { routes: { 1: {}, 2: {}, R: {} }, supplementalRoutes: { 'https://x/rail.zip': ['R'] } };
    expect(routeKeyMismatch(sc, new Set(['1', '2']))).toEqual([]);
    expect(routeKeyMismatch(sc, new Set(['1', '3']))).toEqual(['-2', '+3']);
  });
});

describe('CIV-1862 per-route match', () => {
  const rebuilt = (mut: (o: any) => void) => { const o = JSON.parse(pub); mut(o); return JSON.stringify(o); };

  it('an identical rebuild matches every route', () => {
    expect(matchedRoutes(pub, pub)).toEqual({ matched: new Set(['9', '81', '501']), mismatched: [] });
  });

  it('a route the rebuild changed is mismatched and loses its flag; the others keep theirs', () => {
    const m = matchedRoutes(pub, rebuilt(o => { o.routes['501'].rep.p.amPeak = 10; }));
    expect(m.mismatched).toEqual(['501']);
    expect([...m.matched].sort()).toEqual(['81', '9']);
    const plan = planSidecarNoTrip(pub, flagsFor({ 81: ['late'], 501: ['late'] }, m.matched));
    expect(plan).toMatchObject({ kind: 'add', routes: 1 });
    if (plan.kind !== 'add') throw new Error('expected add');
    expect(JSON.parse(plan.body).routes['501'].noTripPeriods).toBeUndefined();
  });

  it('added weekend fields alone still match', () => {
    expect(matchedRoutes(pub, rebuilt(o => { o.routes['501'].sat.p = { midday: 30 }; })).mismatched).toEqual([]);
  });

  it('a top-level difference matches nothing', () => {
    const m = matchedRoutes(pub, rebuilt(o => { o.refDate = '20191121'; }));
    expect(m.matched.size).toBe(0);
  });
});
