/**
 * `npm run flags` (CIV-1402): what is switched on for each site, in one table.
 *
 *   public  https://www.transitatlas.fyi/flags.json   (written by the deployed build, see vite.config.ts)
 *   beta    https://beta.transitatlas.fyi/flags.json
 *   local   npm run dev:public / dev:beta, computed from the env those scripts set
 *
 * Run it before stating what is on anywhere. A site whose deploy predates /flags.json shows "no flags.json".
 *
 *   --json   print the raw results instead of the table
 */
import { devScriptEnv, featuresForEnv, type FlagsFile } from './featureFlags.js';

const SITES = [
  { name: 'public', url: 'https://www.transitatlas.fyi/flags.json' },
  { name: 'beta', url: 'https://beta.transitatlas.fyi/flags.json' },
] as const;
const LOCAL = [
  { name: 'local dev:public', script: 'dev:public' },
  { name: 'local dev:beta', script: 'dev:beta' },
] as const;

interface Column { name: string; flags?: FlagsFile; error?: string }

async function fetchSite(name: string, url: string): Promise<Column> {
  try {
    const res = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
    if (res.status === 404) return { name, error: 'no flags.json yet (deploy predates it)' };
    if (!res.ok) return { name, error: `HTTP ${res.status}` };
    const text = await res.text();
    let body: unknown;
    try { body = JSON.parse(text); } catch { return { name, error: 'no flags.json (deploy predates it)' }; }
    const f = body as Partial<FlagsFile>;
    if (typeof f.mode !== 'string' || !f.features || typeof f.features !== 'object') return { name, error: 'flags.json has an unexpected shape' };
    return { name, flags: f as FlagsFile };
  } catch (e) {
    return { name, error: e instanceof Error ? e.message : String(e) };
  }
}

async function localColumn(name: string, script: string): Promise<Column> {
  try {
    const env = devScriptEnv(script);
    const { mode, features } = await featuresForEnv(env);
    return { name, flags: { mode, features, switches: {} } };
  } catch (e) {
    return { name, error: e instanceof Error ? e.message : String(e) };
  }
}

export function renderTable(columns: Column[]): string {
  const keys = [...new Set(columns.flatMap(c => Object.keys(c.flags?.features ?? {})))].sort();
  const cell = (c: Column, key: string) => {
    if (!c.flags) return '?';
    const v = c.flags.features[key];
    return v === undefined ? '-' : v ? 'on' : 'off';
  };
  const header = ['feature', ...columns.map(c => c.name)];
  const rows: string[][] = [
    ['mode', ...columns.map(c => c.flags?.mode ?? '?')],
    ['commit', ...columns.map(c => c.flags?.commit?.slice(0, 7) ?? '')],
    ...keys.map(k => [k, ...columns.map(c => cell(c, k))]),
  ];
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map(r => r[i].length)));
  const line = (r: string[]) => r.map((v, i) => v.padEnd(widths[i])).join('  ').trimEnd();
  const out = [line(header), line(widths.map(w => '-'.repeat(w))), ...rows.map(line)];
  const notes = columns.filter(c => c.error).map(c => `${c.name}: ${c.error}`);
  if (notes.length) out.push('', ...notes);
  out.push('', "'-' = this build has no such feature (older code). Local columns come from the package.json script's env only.");
  return out.join('\n');
}

async function main() {
  const columns = await Promise.all([
    ...SITES.map(s => fetchSite(s.name, s.url)),
    ...LOCAL.map(l => localColumn(l.name, l.script)),
  ]);
  if (process.argv.includes('--json')) { console.log(JSON.stringify(columns, null, 2)); return; }
  console.log(renderTable(columns));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error(e); process.exit(1); });
}
