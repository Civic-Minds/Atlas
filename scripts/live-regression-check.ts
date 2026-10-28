/**
 * Standing regression cases for Live: the TTC 501 and 507 analyses, pinned to hand-checked values.
 *   npx tsx scripts/live-regression-check.ts            (reads ../_live-data/out, or LIVE_DATA/out)
 * Exits non-zero, naming each difference, when a pinned output moves. live:analyze runs it after every rebuild.
 * The pinned values live in scripts/handcheck/live-regression-cases.json; change them only after a new hand-check.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

interface Stretch { fromStopId: string; toStopId: string }
interface DirectionCase {
  /** Main stretch ends (stop ids), as hand-checked. */
  stretch: Stretch;
  /** Run time over the main stretch, whole week, all day. */
  runTime: { scheduledMin: number; typicalMin: number; toleranceMin: number };
  /** Where delays start (B3 'forms'), or null when the route page says it builds slowly or stays level. */
  delaysStart: Stretch | null;
  /** Terminal and loop stops: no hotspot (B3 or B4) may start or end at one. */
  terminalStopIds: string[];
}
interface RouteCase {
  route: string;
  checked: string;
  directions: Record<string, DirectionCase>;
  /** Runs of a separate service left out (the 507M shuttle): at least this many in the window. */
  minExcludedRuns?: number;
}
interface Cases { cases: RouteCase[] }

const DATA = process.env.LIVE_DATA ?? join(import.meta.dirname, '..', '..', '_live-data');
const cases: Cases = JSON.parse(readFileSync(join(import.meta.dirname, 'handcheck', 'live-regression-cases.json'), 'utf8'));
const problems: string[] = [];
const same = (a: Stretch | null | undefined, b: Stretch | null) => (a == null || b == null ? a == null && b == null : a.fromStopId === b.fromStopId && a.toStopId === b.toStopId);
const show = (s: Stretch | null | undefined) => (s ? `${s.fromStopId}->${s.toStopId}` : 'none');

for (const c of cases.cases) {
  const file = join(DATA, 'out', `ttc-${c.route}-segments.json`);
  if (!existsSync(file)) { problems.push(`${c.route}: no analysis file at ${file}`); continue; }
  const v3 = JSON.parse(readFileSync(file, 'utf8')).v3;
  const fail = (msg: string) => problems.push(`${c.route}: ${msg}`);
  for (const [dir, want] of Object.entries(c.directions)) {
    const st = v3.runningTime?.stretch?.[dir];
    if (!same(st, want.stretch)) fail(`dir ${dir} main stretch is ${show(st)}, pinned ${show(want.stretch)}`);
    const rt = v3.runningTime?.bands?.all?.[dir];
    for (const k of ['scheduledMin', 'typicalMin'] as const) {
      if (rt?.[k] == null || Math.abs(rt[k] - want.runTime[k]) > want.runTime.toleranceMin) fail(`dir ${dir} run time ${k} is ${rt?.[k]}, pinned ${want.runTime[k]} (±${want.runTime.toleranceMin})`);
    }
    const b3 = v3.buildup.find((b: { directionId: number }) => String(b.directionId) === dir);
    const starts = b3?.kind === 'forms' ? b3.forms : null;
    if (!same(starts, want.delaysStart)) fail(`dir ${dir} delays start ${show(starts)}, pinned ${show(want.delaysStart)}`);
    const b4 = v3.bunching.find((b: { directionId: number }) => String(b.directionId) === dir)?.bands?.all;
    const terminal = new Set(want.terminalStopIds);
    const hotspots: Array<[string, Stretch | null | undefined]> = [['delays start', b3?.forms], ['biggest delay step', b3?.biggest], ['bunching forms', b4?.forms], ['biggest bunching rise', b4?.biggestRise]];
    for (const [name, s] of hotspots) {
      if (s && (terminal.has(s.fromStopId) || terminal.has(s.toStopId))) fail(`dir ${dir} ${name} ${show(s)} touches a terminal`);
    }
  }
  if (c.minExcludedRuns != null && !((v3.leftOut?.excluded ?? 0) >= c.minExcludedRuns)) fail(`${v3.leftOut?.excluded ?? 0} runs of the separate service left out, expected ${c.minExcludedRuns}+`);
}

if (problems.length) {
  console.error(`live regression: ${problems.length} pinned output(s) moved:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`live regression: ${cases.cases.map(c => c.route).join(', ')} match their hand-checked values`);
