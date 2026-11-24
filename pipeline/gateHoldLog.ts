/**
 * CIV-2312: a lasting record of every release diff gate hold (a red flag), and how each turned out, so a monthly tally
 * shows which checks mostly flag normal changes and which catch real problems (scripts/gate-holds-tally.ts).
 *
 * The log is config/release-gate-holds.json, committed. The refresh and the rebuild's publish (reprocess --write) update
 * it after each gate run, and their automated pull requests carry it to main. Outcomes fill in on their own:
 * - let-through: a run passed `--allow <slug>:<check>` for it (a reviewed hold);
 * - cleared: a later run gated the agency again and the check no longer fired (a newer feed);
 * - held: still refused.
 * `cause` is one short line written by the chat that reviews the hold: a kind, a colon, then detail ("seasonal: ski season").
 * Kinds: seasonal, holiday weekday, real change, broken feed, pipeline bug. The tally counts by kind.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { GateReport } from './releaseDiff.js';

export const GATE_HOLDS_PATH = resolve('config/release-gate-holds.json');

export type HoldOutcome = 'held' | 'let-through' | 'cleared';

export interface GateHold {
  slug: string;
  /** The gate check that fired (GateFlagName, e.g. headway-shift). */
  check: string;
  /** UTC days (YYYY-MM-DD). */
  firstHeld: string;
  lastHeld: string;
  /** Gate runs that raised it, let-through included. */
  runs: number;
  /** The gate's message the first time. */
  message: string;
  outcome: HoldOutcome;
  /** When the outcome left `held`. */
  outcomeOn?: string;
  /** One short line from the reviewing chat: "<kind>: <detail>". */
  cause?: string;
}

export interface GateHoldLog { version: 1; holds: GateHold[] }

export const emptyHoldLog = (): GateHoldLog => ({ version: 1, holds: [] });

export function readHoldLog(path = GATE_HOLDS_PATH): GateHoldLog {
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as GateHoldLog) : emptyHoldLog();
}

export function writeHoldLog(log: GateHoldLog, path = GATE_HOLDS_PATH): void {
  writeFileSync(path, `${JSON.stringify(log, null, 2)}\n`);
}

/** Days after a let-through within which the same check allowed again counts as the same hold. */
export const RE_ALLOW_DAYS = 7;

const dayNum = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86_400_000;

function recentlyLetThrough(holds: GateHold[], slug: string, check: string, day: string): GateHold | undefined {
  return holds.filter(h => h.slug === slug && h.check === check && h.outcome === 'let-through' && dayNum(day) - dayNum(h.lastHeld) <= RE_ALLOW_DAYS)
    .sort((a, b) => b.lastHeld.localeCompare(a.lastHeld))[0];
}

/**
 * The log after one gate run on `day`. Each red flag continues the agency's open hold for that check, or opens one; an
 * allowed flag lets it through. An open hold for an agency the run gated, whose check didn't fire, is cleared.
 */
export function recordGateRun(log: GateHoldLog, report: Pick<GateReport, 'checked' | 'flags'>, day: string): GateHoldLog {
  const holds = log.holds.map(h => ({ ...h }));
  const open = (slug: string, check: string) => holds.find(h => h.slug === slug && h.check === check && h.outcome === 'held');
  const fired = new Set<string>();
  for (const f of report.flags) {
    if (f.level !== 'red') continue;
    fired.add(`${f.slug}\u001f${f.flag}`);
    // A flag allowed again soon after its hold was let through (a rerun with the same --allow) is that same hold.
    let h = open(f.slug, f.flag) ?? (f.allowed ? recentlyLetThrough(holds, f.slug, f.flag, day) : undefined);
    if (!h) {
      h = { slug: f.slug, check: f.flag, firstHeld: day, lastHeld: day, runs: 0, message: f.message, outcome: 'held' };
      holds.push(h);
    }
    h.lastHeld = day;
    h.runs++;
    if (f.allowed && h.outcome === 'held') { h.outcome = 'let-through'; h.outcomeOn = day; }
  }
  const checked = new Set(report.checked);
  for (const h of holds) {
    if (h.outcome === 'held' && checked.has(h.slug) && !fired.has(`${h.slug}\u001f${h.check}`)) { h.outcome = 'cleared'; h.outcomeOn = day; }
  }
  holds.sort((a, b) => a.firstHeld.localeCompare(b.firstHeld) || a.slug.localeCompare(b.slug) || a.check.localeCompare(b.check));
  return { version: 1, holds };
}

/** Records a gate run in the committed log (the refresh and reprocess --write call this). Never throws: a log failure must not stop a release. */
export function logGateRun(report: Pick<GateReport, 'checked' | 'flags'>, day = new Date().toISOString().slice(0, 10), path = GATE_HOLDS_PATH): void {
  try { writeHoldLog(recordGateRun(readHoldLog(path), report, day), path); }
  catch (e) { console.warn(`  Release gate hold log not updated: ${e instanceof Error ? e.message : e}`); }
}

export interface CheckTally { check: string; holds: number; letThrough: number; cleared: number; held: number; causes: Record<string, number> }

/** Per check, the holds first raised in a month (YYYY-MM) and how they turned out. */
export function tallyHolds(log: GateHoldLog, month: string): CheckTally[] {
  const by = new Map<string, CheckTally>();
  for (const h of log.holds) {
    if (!h.firstHeld.startsWith(month)) continue;
    const t = by.get(h.check) ?? { check: h.check, holds: 0, letThrough: 0, cleared: 0, held: 0, causes: {} };
    t.holds++;
    if (h.outcome === 'let-through') t.letThrough++; else if (h.outcome === 'cleared') t.cleared++; else t.held++;
    const cause = h.cause ? h.cause.split(':')[0].trim() : 'no cause noted';
    t.causes[cause] = (t.causes[cause] ?? 0) + 1;
    by.set(h.check, t);
  }
  return [...by.values()].sort((a, b) => b.holds - a.holds || a.check.localeCompare(b.check));
}
