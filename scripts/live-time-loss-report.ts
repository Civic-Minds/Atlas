/**
 * Atlas Studio time-loss report (CIV-1683): ranks a route's stop pairs by typical extra running time, per band and
 * direction, from one scripts/live-segment-delay.ts output. Local only; writes nothing to R2.
 *
 *   npx tsx scripts/live-time-loss-report.ts --segments <agency>-<route>-segments.json [--out-dir tmp/time-loss] [--top 10]
 *
 * Writes <out-dir>/<agency>-<route>.json (every listed stop pair) and <agency>-<route>.md (the top --top per band and
 * direction). Rules and wording: docs/GLOSSARY.md "## Live" (see src/utils/timeLossReport.ts).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { TIME_LOSS_BANDS, timeLossReport, type TimeLossReport, type TimeLossRow } from '../src/utils/timeLossReport';
import type { SegmentBand, SegmentDelayData } from '../src/utils/segmentDelayView';
import { minutesText } from '../shared/liveFormat';
import { timeLostLine } from '../shared/liveWording';

/** The Live card's band names (GLOSSARY "## Live"). */
const BAND_NAMES: Record<SegmentBand, string> = { all: 'All day', amPeak: 'AM Peak', midday: 'Midday', pmPeak: 'PM Peak', evening: 'Evening' };

const sample = (r: TimeLossRow) => `${r.passes} trips, ${r.days} days`;
/** Card wording: "Time lost: {X}" (timeLostLine, the Delays start cards' own). */
const slowerText = (r: TimeLossRow) => timeLostLine(r.typicalMin);
/** Card wording: "The schedule allows {X} more than vehicles need". */
const looserText = (r: TimeLossRow) => `The schedule allows ${minutesText(-r.typicalMin)} more than vehicles need`;

export function timeLossMarkdown(report: TimeLossReport, top = 10): string {
  const lines: string[] = [];
  const dates = report.dates;
  lines.push(`# Where the ${report.route} falls behind`, '');
  lines.push(`${report.agency.toUpperCase()} ${report.route}, ${dates[0]} to ${dates[dates.length - 1]} (${dates.length} service days).`);
  lines.push(`Stop pairs need ${report.rules.minPasses} trips or more, on ${report.rules.minDays} days or more, in the period; stop pairs at the ends of the main patterns are left out.`, '');
  for (const band of TIME_LOSS_BANDS) {
    const dirs = report.bands[band];
    if (!dirs) continue;
    lines.push(`## ${BAND_NAMES[band]}`, '');
    for (const d of dirs) {
      lines.push(`### ${d.label}`, '');
      if (!d.slower.length) lines.push(`No stop pair takes ${report.rules.listFromSec} s or more longer than scheduled (${d.measured} stop pairs measured).`, '');
      else {
        lines.push('| # | Stop pair | Running time | Sample | Flag |', '|---|---|---|---|---|');
        d.slower.slice(0, top).forEach((r, i) => lines.push(`| ${i + 1} | ${r.fromName} to ${r.toName} | ${slowerText(r)} | ${sample(r)} | ${r.level} |`));
        lines.push('', `${d.slower.length} of ${d.measured} stop pairs measured are listed${d.slower.length > top ? ` (top ${top} shown)` : ''}.`, '');
      }
      if (d.looser.length) {
        lines.push('Where the schedule is looser than needed:', '');
        for (const r of d.looser) lines.push(`- ${r.fromName} to ${r.toName}: ${looserText(r)} (${sample(r)})`);
        lines.push('');
      }
      lines.push(`Left out: ${d.tooFewPasses} stop pairs with too few trips or days, ${d.patternEnds} at the ends of the main patterns.`, '');
    }
  }
  return lines.join('\n');
}

function main() {
  const argv = process.argv.slice(2);
  const args: Record<string, string> = {};
  argv.forEach((a, i) => { if (a.startsWith('--')) args[a.slice(2)] = argv[i + 1]; });
  if (!args.segments) { console.error('live-time-loss-report: give --segments <file>'); process.exit(2); }
  const data = JSON.parse(readFileSync(resolve(args.segments), 'utf8')) as SegmentDelayData;
  const report = timeLossReport(data);
  const dir = resolve(args['out-dir'] ?? 'tmp/time-loss');
  mkdirSync(dir, { recursive: true });
  const base = join(dir, `${data.agency}-${data.route}`);
  writeFileSync(`${base}.json`, JSON.stringify(report, null, 1));
  writeFileSync(`${base}.md`, timeLossMarkdown(report, Number(args.top ?? 10)));
  console.log(`live-time-loss-report: ${base}.{json,md}`);
}

if (process.argv[1] && resolve(process.argv[1]).endsWith('live-time-loss-report.ts')) main();
