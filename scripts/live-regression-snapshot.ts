/**
 * Writes scripts/handcheck/live-regression-cases.json from the current TTC 501 and 507 analysis files:
 *   npx tsx scripts/live-regression-snapshot.ts            (reads ../_live-data/out, or LIVE_DATA/out)
 * The file is a SNAPSHOT of today's output, NOT hand-checked: it only catches later changes. Replace the values with
 * hand-checked ones (scripts/handcheck/*) before relying on it as a correctness check, and drop the "status" note.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const DATA = process.env.LIVE_DATA ?? join(import.meta.dirname, '..', '..', '_live-data');
const ROUTES = ['501', '507'];
const TOLERANCE_MIN = 0.5;
const r1 = (x: number) => Math.round(x * 10) / 10;

const cases = ROUTES.map(route => {
  const v3 = JSON.parse(readFileSync(join(DATA, 'out', `ttc-${route}-segments.json`), 'utf8')).v3;
  const directions: Record<string, unknown> = {};
  for (const dir of Object.keys(v3.directionLabels)) {
    const st = v3.runningTime.stretch[dir];
    const rt = v3.runningTime.bands.all[dir];
    const b3 = v3.buildup.find((b: { directionId: number }) => String(b.directionId) === dir);
    const forms = b3?.kind === 'forms' ? b3.forms : null;
    const main = (v3.patterns?.[dir] ?? []).find((p: { main: boolean }) => p.main);
    const ends: string[] = main ? [main.stops[0].stopId, main.stops[main.stops.length - 1].stopId] : [];
    directions[dir] = {
      stretch: { fromStopId: st.fromStopId, toStopId: st.toStopId },
      runTime: { scheduledMin: r1(rt.scheduledMin), typicalMin: r1(rt.typicalMin), toleranceMin: TOLERANCE_MIN },
      delaysStart: forms ? { fromStopId: forms.fromStopId, toStopId: forms.toStopId } : null,
      terminalStopIds: ends,
    };
  }
  const excluded = v3.leftOut?.excluded ?? 0;
  return { route, checked: `snapshot ${new Date().toISOString().slice(0, 10)}, not hand-checked`, directions, ...(route === '507' && excluded > 0 ? { minExcludedRuns: Math.floor(excluded * 0.9) } : {}) };
});

mkdirSync(join(import.meta.dirname, 'handcheck'), { recursive: true });
const out = join(import.meta.dirname, 'handcheck', 'live-regression-cases.json');
writeFileSync(out, JSON.stringify({ status: 'SNAPSHOT of the current analysis, not hand-checked: replace with hand-checked values', cases }, null, 2) + '\n');
console.log(`wrote ${out}`);
