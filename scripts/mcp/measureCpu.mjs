// Measures the CPU time of each hosted-MCP tool call on the deployed pilot Worker (CIV-1840): for each call it deploys a
// new version (so the call starts on a fresh isolate: cold), makes the call, then makes it again (warm), and reads the
// CPU time Cloudflare reports for each request from `wrangler tail`. Usage: node scripts/mcp/measureCpu.mjs <tester link> [label]
// Deploys workers/atlas-mcp with WORKER_CONFIG (default wrangler.perf.jsonc: the separate perf Worker, so a pilot in use is never redeployed).
import { execFileSync, spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const [,, link, label = 'run'] = process.argv;
const WORKER = process.env.WORKER_NAME ?? 'atlas-studio-mcp-perf';
const CONFIG = process.env.WORKER_CONFIG ?? 'wrangler.perf.jsonc';
const WRANGLER = ['--yes', 'wrangler@4.164.0'];
const cwd = new URL('../../workers/atlas-mcp/', import.meta.url).pathname;
const calls = [
  ['@ping', {}], ['@tools/list', {}],
  ['list_agencies', { query: 'hamilton' }],
  ['rank_agencies', { period: 'Midday', every: 10, country: 'United States', limit: 10 }],
  ['rank_agencies', { period: 'Evening', every: 15, similar_to: 'Hamilton Street Railway' }],
  ['route_frequency', { agency: 'TTC', route: '29', day: 'Saturday' }],
  ['route_frequency', { agency: 'TTC', route: '52' }],
  ['routes_at_frequency', { agency: 'OC Transpo', period: 'Midday', every: 10 }],
  ['compare_agencies', { agencies: ['TTC', 'TransLink', 'MBTA'], period: 'Evening', every: 15 }],
  ['routes_near', { agency: 'TTC', place: 'Bathurst and Bloor' }],
  ['route_history', { agency: 'TTC', route: '504' }],
  ['route_history', { agency: 'MBTA', route: '1' }],
  ['routes_by_hours', { agency: 'TTC', day: 'Sunday', ends_before: '22:00' }],
  ['schedule_changes', { agency: 'Hamilton Street Railway' }],
  ['list_agencies', { query: 'Viva' }],
];
const tail = spawn('npx', [...WRANGLER, 'tail', WORKER, '--format', 'json'], { cwd, stdio: ['ignore', 'pipe', 'ignore'] });
let buf = '';
tail.stdout.on('data', d => { buf += d; });
await new Promise(r => setTimeout(r, 8000));
const call = async (name, args, id) => { const t0 = Date.now(); const status = (await fetch(link, { method: 'POST', body: JSON.stringify(name.startsWith('@') ? { jsonrpc: '2.0', id, method: name.slice(1) } : { jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } }) })).status; return { t0, t1: Date.now(), status }; };
const order = [];
for (const [i, [name, args]] of calls.entries()) {
  execFileSync('npx', [...WRANGLER, 'deploy', '-c', CONFIG, '--message', `cpu ${label} ${i}`], { cwd, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 4000));
  // The first call after a deploy starts on a new isolate (cold); the next four show what a warm one costs.
  for (let k = 0; k < 5; k++) { order.push({ name, args, k, ...(await call(name, args, i)) }); await new Promise(r => setTimeout(r, 600)); }
}
await new Promise(r => setTimeout(r, 6000));
tail.kill();
const events = buf.split(/^}\n/m).map(s => s.trim() + '\n}').filter(s => s.length > 3).map(s => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean)
  .filter(e => e.event?.request?.method === 'POST');
// Match each call to the request Cloudflare logged for it by time, not by order.
const cpuOf = o => events.find(e => e.eventTimestamp >= o.t0 - 1500 && e.eventTimestamp <= o.t1 + 300)?.cpuTime ?? null;
const rows = order.map(o => ({ tool: o.name, args: JSON.stringify(o.args).slice(0, 60), k: o.k, status: o.status, cpuMs: cpuOf(o) }));
writeFileSync(`/tmp/cpu-${label}.json`, JSON.stringify(rows, null, 1));
for (let i = 0; i < rows.length; i += 5) {
  const first = rows[i].cpuMs, rest = rows.slice(i + 1, i + 5).map(r => r.cpuMs).filter(v => v != null).sort((a, b) => a - b);
  console.log(rows[i].tool.padEnd(20), rows[i].args.padEnd(62), 'first', String(first).padStart(3), 'ms | next four', rest.join(','), '| worst', Math.max(first ?? 0, ...rest));
}
console.log('events', events.length, 'calls', order.length);
