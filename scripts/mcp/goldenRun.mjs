import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const [,, root, out] = process.argv;
const calls = [
  ['list_agencies', { query: 'hamilton' }], ['list_agencies', { region: 'Ontario', country: 'Canada' }], ['list_agencies', { near: 'Hamilton' }],
  ['rank_agencies', { period: 'Midday', every: 10, country: 'United States', limit: 10 }],
  ['rank_agencies', { period: 'Weekday evening'.replace('Weekday ', ''), every: 15, similar_to: 'Hamilton Street Railway' }],
  ['route_frequency', { agency: 'TTC', route: '29', day: 'Saturday' }], ['route_frequency', { agency: 'TTC', route: '29', day: 'Saturday', from_time: '10 AM', to_time: '6 PM' }],
  ['route_frequency', { agency: 'TTC', route: '510' }], ['route_frequency', { agency: 'Kingston Transit', route: '12' }],
  ['routes_at_frequency', { agency: 'OC Transpo', period: 'Midday', every: 10 }], ['routes_at_frequency', { agency: 'York Region Transit', period: 'Midday', every: 15, day: 'Sunday' }],
  ['compare_agencies', { agencies: ['TTC', 'TransLink', 'MBTA'], period: 'Evening', every: 15 }],
  ['routes_near', { agency: 'TTC', place: 'Bathurst and Bloor' }],
  ['route_history', { agency: 'TTC', route: '504' }], ['route_history', { agency: 'Kingston Transit', route: '12' }],
  ['routes_by_hours', { agency: 'TTC', day: 'Sunday', ends_before: '22:00' }],
  ['schedule_changes', { agency: 'Hamilton Street Railway' }],
];
// GOLDEN_EXTRA=1 adds the calls for the MCP chat's findings (CIV-1840): brand search, ferries, paging, night routes.
if (process.env.GOLDEN_EXTRA) calls.push(
  ['list_agencies', { query: 'Viva' }], ['rank_agencies', { period: 'Midday', every: 30, similar_to: 'BC Ferries' }],
  ['schedule_changes', { agency: 'RTD' }], ['schedule_changes', { agency: 'RTD', offset: 40, limit: 10 }],
  ['route_frequency', { agency: 'TTC', route: '329' }],
);
const p = spawn('/opt/homebrew/bin/node', [`${root}/node_modules/tsx/dist/cli.mjs`, `${root}/scripts/mcp/atlas-mcp.ts`], { stdio: ['pipe', 'pipe', 'inherit'], env: { ...process.env, ATLAS_ROOT: process.env.ATLAS_ROOT } });
let buf = ''; const res = {};
p.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); if (l.trim()) { const m = JSON.parse(l); res[m.id] = m; } } });
const send = (id, method, params) => p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
send(0, 'initialize', { protocolVersion: '2025-06-18' });
calls.forEach(([name, args], i) => send(i + 1, 'tools/call', { name, arguments: args }));
const t = setInterval(() => { if (Object.keys(res).length >= calls.length + 1) { clearInterval(t); clearTimeout(giveUp); const o = calls.map(([n, a], i) => ({ call: [n, a], result: res[i + 1].result ?? res[i + 1].error })); writeFileSync(out, JSON.stringify(o, null, 1)); console.log('ok', o.length, o.filter(x => JSON.stringify(x.result).includes('"isError":true')).length, 'errors'); p.kill(); } }, 500);
const giveUp = setTimeout(() => { console.log('timeout', Object.keys(res).length); p.kill(); process.exit(1); }, 600000);
