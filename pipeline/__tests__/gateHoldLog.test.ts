import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { emptyHoldLog, logGateRun, recordGateRun, tallyHolds, type GateHoldLog } from '../gateHoldLog';
import type { GateFlag } from '../releaseDiff';

const red = (slug: string, flag: GateFlag['flag'], allowed = false): GateFlag => ({ slug, flag, level: 'red', message: `${flag} on ${slug}`, ...(allowed ? { allowed } : {}) });
const run = (log: GateHoldLog, day: string, checked: string[], flags: GateFlag[]) => recordGateRun(log, { checked, flags }, day);

// CIV-2312: every release gate hold is kept, with how it turned out, so a monthly tally can show which checks are right.
describe('release gate hold log (CIV-2312)', () => {
  it('opens a hold on a red flag and keeps it open while later runs hold it', () => {
    let log = run(emptyHoldLog(), '2026-11-02', ['a', 'b'], [red('a', 'headway-shift'), { slug: 'b', flag: 'route-shift', level: 'yellow', message: 'y' }]);
    log = run(log, '2026-11-09', ['a'], [red('a', 'headway-shift')]);
    expect(log.holds).toEqual([{ slug: 'a', check: 'headway-shift', firstHeld: '2026-11-02', lastHeld: '2026-11-09', runs: 2, message: 'headway-shift on a', outcome: 'held' }]);
  });

  it('marks a hold let through when a run allows it', () => {
    let log = run(emptyHoldLog(), '2026-11-09', ['tank'], [red('tank', 'headway-shift')]);
    log = run(log, '2026-11-10', ['tank'], [red('tank', 'headway-shift', true)]);
    expect(log.holds[0]).toMatchObject({ outcome: 'let-through', outcomeOn: '2026-11-10', runs: 2 });
  });

  it('counts a rerun with the same allow, within a week, as the same hold', () => {
    let log = run(emptyHoldLog(), '2026-11-06', ['c'], [red('c', 'drop')]);
    log = run(log, '2026-11-07', ['c'], [red('c', 'drop', true)]);
    log = run(log, '2026-11-08', ['c'], [red('c', 'drop', true)]);
    expect(log.holds).toEqual([expect.objectContaining({ firstHeld: '2026-11-06', lastHeld: '2026-11-08', runs: 3, outcome: 'let-through', outcomeOn: '2026-11-07' })]);
    log = run(log, '2026-11-20', ['c'], [red('c', 'drop', true)]);
    expect(log.holds.map(h => h.firstHeld)).toEqual(['2026-11-06', '2026-11-20']);
  });

  it('clears a hold only when a run gates the agency again and the check does not fire', () => {
    let log = run(emptyHoldLog(), '2026-11-02', ['w'], [red('w', 'headway-shift')]);
    log = run(log, '2026-11-05', ['other'], []);
    expect(log.holds[0].outcome).toBe('held');
    log = run(log, '2026-11-09', ['w'], [red('w', 'drop')]);
    expect(log.holds.map(h => [h.check, h.outcome, h.outcomeOn])).toEqual([['headway-shift', 'cleared', '2026-11-09'], ['drop', 'held', undefined]]);
  });

  it('opens a new hold when the same check fires again after an earlier one closed, and keeps the cause', () => {
    let log = run(emptyHoldLog(), '2026-11-02', ['r'], [red('r', 'headway-shift', true)]);
    log.holds[0].cause = 'seasonal: ski season';
    log = run(log, '2026-11-23', ['r'], [red('r', 'headway-shift')]);
    expect(log.holds.map(h => [h.firstHeld, h.outcome, h.cause])).toEqual([['2026-11-02', 'let-through', 'seasonal: ski season'], ['2026-11-23', 'held', undefined]]);
  });

  it('tallies a month by check', () => {
    let log = run(emptyHoldLog(), '2026-11-02', ['a', 'b', 'c'], [red('a', 'headway-shift', true), red('b', 'headway-shift'), red('c', 'drop')]);
    log = run(log, '2026-11-09', ['b'], []);
    log.holds[0].cause = 'seasonal: ski season';
    expect(tallyHolds(log, '2026-11')).toEqual([
      { check: 'headway-shift', holds: 2, letThrough: 1, cleared: 1, held: 0, causes: { seasonal: 1, 'no cause noted': 1 } },
      { check: 'drop', holds: 1, letThrough: 0, cleared: 0, held: 1, causes: { 'no cause noted': 1 } },
    ]);
    expect(tallyHolds(log, '2026-10')).toEqual([]);
  });

  it('writes the log file and never throws on a bad one', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'holds-')), 'holds.json');
    logGateRun({ checked: ['a'], flags: [red('a', 'expired')] }, '2026-11-24', path);
    expect(JSON.parse(readFileSync(path, 'utf8')).holds).toHaveLength(1);
    expect(() => logGateRun({ checked: [], flags: [] }, '2026-11-24', join(path, 'not-a-dir', 'x.json'))).not.toThrow();
  });
});
