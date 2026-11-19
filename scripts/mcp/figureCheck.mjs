#!/usr/bin/env node
/**
 * Atlas Studio MCP figure check: asks the server a fixed set of questions and compares key figures with the numbers
 * Atlas should give, checked by hand in the MCP test rounds (scripts/mcp/TEST-LOG.md). Pass or fail in seconds, so it
 * can run after every server change.
 *
 *   node scripts/mcp/figureCheck.mjs [path/to/atlas-mcp.ts] [--published-only]
 *
 * --published-only skips the checks that read the agency's own schedule files (trip times, combined frequency), which
 * the hosted version doesn't serve. Exit code 1 when any check fails; "known gap" checks are reported but don't fail.
 *
 * The expected figures belong to one data release (EXPECTED_RELEASE). When the data on this Mac is a newer release, a
 * failure may be a real schedule change rather than a bug: check it against the map, then update the figure here.
 */
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXPECTED_RELEASE = 'release-mwl8qwjk';
const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const publishedOnly = args.includes('--published-only');
const script = resolve(args.find(a => !a.startsWith('--')) ?? join(here, 'atlas-mcp.ts'));
const ATLAS_ROOT = process.env.ATLAS_ROOT ?? resolve(here, '..', '..');

const period = (r, name) => r.periods?.find(p => p.period === name);
const routeIds = list => (list ?? []).map(x => String(x.route)).sort();
const sorted = a => [...a].map(String).sort();
const byAgency = (r, needle) => r.agencies?.find(a => a.agency.includes(needle))?.routesMeeting;

/** Each check: one tool call and the figures it must return, as [what, actual(result), expected]. */
const CHECKS = [
  { call: ['route_frequency', { agency: 'TTC', route: '29', day: 'Saturday' }], expect: [
    ['first trip', r => r.service.first, '5:46 AM'],
    ['last trip', r => r.service.last.replace(/ \(after midnight\)$/, ''), '2:08 AM'],
    ['AM peak', r => period(r, 'AM peak').shown, 'every 10–20 min'],
    ['midday', r => period(r, 'Midday').shown, 'every 5–16 min'],
  ] },
  { call: ['route_frequency', { agency: 'Kingston Transit', route: '12' }], expect: [
    ['last trip', r => r.service.last, '6:26 PM'],
    ['AM peak wait', r => period(r, 'AM peak').waitMinutes, 31],
  ] },
  { call: ['routes_at_frequency', { agency: 'OC Transpo', period: 'Midday', every: 10 }], expect: [
    ['routes every 10 or better', r => routeIds(r.meeting), ['1']],
    ['routes running at midday', r => r.routesRunningInPeriod, 76],
  ] },
  { call: ['routes_at_frequency', { agency: 'York Region Transit', period: 'Midday', every: 15, day: 'Sunday' }], expect: [
    ['routes every 15 or better', r => routeIds(r.meeting), ['020']],
    ['routes running at midday', r => r.routesRunningInPeriod, 31],
  ] },
  { call: ['routes_at_frequency', { agency: 'MiWay', period: 'Evening', every: 15 }], expect: [
    ['routes every 15 or better', r => routeIds(r.meeting), sorted(['1', '2', '42', '61', '66', '109'])],
    ['routes running in the evening', r => r.routesRunningInPeriod, 43],
  ] },
  { call: ['compare_agencies', { agencies: ['TTC', 'TransLink', 'MBTA', 'CTA', 'SEPTA'], period: 'Evening', every: 15 }], expect: [
    ['TTC', r => byAgency(r, 'Toronto'), 64], ['CTA', r => byAgency(r, 'Chicago'), 34], ['MBTA', r => byAgency(r, 'Massachusetts'), 33],
    ['TransLink', r => byAgency(r, 'TransLink'), 32], ['SEPTA', r => byAgency(r, 'SEPTA'), 10],
  ] },
  { call: ['compare_agencies', { agencies: ['Calgary Transit', 'Edmonton Transit Service', 'Winnipeg Transit'], period: 'Midday', every: 15, day: 'Sunday' }], expect: [
    ['Calgary', r => byAgency(r, 'Calgary'), 2], ['Edmonton', r => byAgency(r, 'Edmonton'), 13], ['Winnipeg', r => byAgency(r, 'Winnipeg'), 0],
  ] },
  { call: ['rank_agencies', { period: 'Midday', every: 10, country: 'United States', similar_to: 'Hamilton Street Railway' }], expect: [
    ['leader', r => r.ranking[0].agency.includes('Citibus') || r.ranking[0].agency.includes('Lubbock'), true],
    ['leader routes every 10', r => r.ranking[0].routesMeeting, 6],
  ] },
  { call: ['list_agencies', { near: 'Hamilton' }], expect: [
    ['agencies within 60 km', r => r.agencies.length, 12],
    ['nearest', r => r.agencies[0].split(' | ')[0], 'Hamilton Street Railway'],
  ] },
  { call: ['routes_near', { agency: 'TTC', place: 'Bathurst and Bloor' }], expect: [
    // 94 Wellesley stops at Harbord and Bathurst, about 450 m away: in since the radius became the map's 500 m (d8852e99c).
    ['routes', r => routeIds(r.routes), sorted(['2', '7', '94', '300', '307', '511'])],
  ] },
  { call: ['route_history', { agency: 'TTC', route: '504' }], expect: [
    ['Oct 2019 AM peak', r => r.schedules.find(s => s.schedule === 'Oct 2019')?.['AM peak'], 'every 6 min'],
  ] },
  { call: ['route_history', { agency: 'Kingston Transit', route: '12' }], expect: [
    ['doubtful figures flagged', r => Number(/^(\d+) figure/.exec(r.warning ?? '')?.[1]), 6],
  ] },
  { call: ['schedule_changes', { agency: 'Hamilton Street Railway' }], expect: [
    ['routes removed', r => sorted(r.routesRemoved), ['51']],
    ['routes added', r => sorted(r.routesAdded), []],
    ['44 Rymal AM peak', r => { const c = r.frequencyChanges.find(x => x.route === '44' && x.period.startsWith('AM peak')); return c && `${c.before} → ${c.after}`; }, 'every 15 min → every 30 min'],
  ] },
  { local: true, call: ['combined_frequency', { agency: 'TTC', from_stop: 'Dufferin Station', to_stop: 'Wilson Station', day: 'Saturday', from_time: '10:00', to_time: '18:00' }], expect: [
    ['departures, 29 and 929', r => r.byWindow[0].combined.departures, 137],
    ['combined wait', r => r.byWindow[0].combined.every, 'every 3 min'],
  ] },
  { local: true, call: ['combined_frequency', { agency: 'TTC', from_stop: 'Dufferin Station', to_stop: 'Wilson Station', day: 'Sunday', from_time: '13:00', to_time: '18:00' }], expect: [
    // Each Sunday 929 leaves a minute after a 29 (13:04 and 13:05 …), so the pair counts as one departure: every 5, not 3.
    ['combined wait', r => r.byWindow[0].combined.every, 'every 5 min'],
  ] },
  // Known gaps: reported, never fail the run. Move a check up once its fix ships.
  // Fixed in 0.7.0 (CIV-1840): a window starting at midnight used to return nothing.
  { local: true,
    call: ['combined_frequency', { agency: 'TTC', from_stop: 'Spadina Ave at College St', to_stop: 'Spadina Ave at King St West', from_time: '12 AM', to_time: '3 AM' }], expect: [
    ['window has figures', r => r.byWindow.length > 0, true],
  ] },
];

const checks = CHECKS.filter(c => !(publishedOnly && c.local));
let release = null;
try { release = readdirSync(join(ATLAS_ROOT, 'tmp/agency-pages-cache')).filter(d => d.startsWith('release-')).sort().at(-1) ?? null; } catch { /* none */ }

const p = spawn(process.execPath, [join(ATLAS_ROOT, 'node_modules/tsx/dist/cli.mjs'), script], { stdio: ['pipe', 'pipe', 'inherit'], env: { ...process.env, ATLAS_ROOT } });
const replies = new Map();
let buf = '';
p.stdout.on('data', d => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); if (l.trim()) { const m = JSON.parse(l); replies.set(m.id, m); } }
});
const send = (id, method, params) => p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
send(0, 'initialize', { protocolVersion: '2025-06-18' });
checks.forEach((c, i) => send(i + 1, 'tools/call', { name: c.call[0], arguments: c.call[1] }));

const started = Date.now();
const timer = setInterval(() => {
  if (replies.size < checks.length + 1 && Date.now() - started < 300_000) return;
  clearInterval(timer);
  p.kill();
  const version = replies.get(0)?.result?.serverInfo?.version ?? '?';
  console.log(`Atlas Studio MCP ${version} · ${script}\nData: ${release ?? 'unknown'}${release && release !== EXPECTED_RELEASE ? ` (expected figures are for ${EXPECTED_RELEASE}: a failure may be a real schedule change)` : ''}\n`);
  let failed = 0, passed = 0;
  const gaps = [];
  checks.forEach((c, i) => {
    const reply = replies.get(i + 1);
    const label = `${c.call[0]} ${JSON.stringify(c.call[1])}`;
    let result;
    try {
      const text = reply?.result?.content?.[0]?.text;
      if (!reply) throw new Error('no reply (timed out)');
      if (reply.error || reply.result?.isError) throw new Error(text ?? JSON.stringify(reply.error));
      result = JSON.parse(text);
    } catch (e) {
      if (c.known) { gaps.push(`  still open: ${c.known} (${e.message.slice(0, 120)})`); return; }
      failed += c.expect.length; console.log(`FAIL ${label}\n     ${e.message.slice(0, 200)}`); return;
    }
    for (const [what, get, want] of c.expect) {
      let got;
      try { got = get(result); } catch (e) { got = `error: ${e.message}`; }
      const ok = JSON.stringify(got) === JSON.stringify(want);
      if (c.known) { gaps.push(`  ${ok ? 'FIXED, move this check up' : 'still open'}: ${c.known}`); continue; }
      if (ok) passed++; else { failed++; console.log(`FAIL ${label}\n     ${what}: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`); }
    }
  });
  console.log(`\n${passed} passed, ${failed} failed${publishedOnly ? ' (published-data checks only)' : ''}, ${((Date.now() - started) / 1000).toFixed(1)} s`);
  if (gaps.length) console.log(`Known gaps:\n${gaps.join('\n')}`);
  process.exit(failed ? 1 : 0);
}, 200);
