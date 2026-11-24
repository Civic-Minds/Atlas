/**
 * CIV-2312: how often each release diff gate check held an agency in a month, and how those holds turned out
 * (config/release-gate-holds.json, pipeline/gateHoldLog.ts). A hold let through after review mostly means the check flagged
 * a normal change; a hold that stayed until a newer feed cleared it, or still holds, mostly means it caught a problem.
 *
 *   npx tsx scripts/gate-holds-tally.ts [--month 2026-11]   (default: the current UTC month)
 */
import { readHoldLog, tallyHolds } from '../pipeline/gateHoldLog.js';

const i = process.argv.indexOf('--month');
const month = i > 0 ? process.argv[i + 1] : new Date().toISOString().slice(0, 7);
if (!/^\d{4}-\d{2}$/.test(month ?? '')) { console.error('Usage: npx tsx scripts/gate-holds-tally.ts [--month YYYY-MM]'); process.exit(1); }

const tally = tallyHolds(readHoldLog(), month);
if (!tally.length) { console.log(`No release gate holds first raised in ${month}.`); process.exit(0); }
console.log(`Release gate holds first raised in ${month}:\n`);
console.log('| check | holds | let through | cleared | still held | causes |');
console.log('|---|---|---|---|---|---|');
for (const t of tally) {
  const causes = Object.entries(t.causes).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} (${n})`).join('; ');
  console.log(`| ${t.check} | ${t.holds} | ${t.letThrough} | ${t.cleared} | ${t.held} | ${causes.replace(/\|/g, '/')} |`);
}
