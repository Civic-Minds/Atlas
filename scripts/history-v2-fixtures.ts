/**
 * Dev fixtures for History v2: copies the local pilot outputs (marta, rtd-denver, indygo, lacmta) into
 * tmp/dev-history-v2/ (gitignored via `tmp`). Vite dev serves that folder at /dev-history-v2.
 * Run: npm run history-v2:fixtures [-- <pilot-out-root>]
 * Then: VITE_HISTORY_V2_BASE=/dev-history-v2 npm run dev:beta
 * Local only: no network, no R2. Data files are never committed.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = process.argv[2] ?? '/private/tmp/claude-501/-Users-ryan/313c5ad2-816b-47fe-8c90-4f722b49b7de/scratchpad';
const PILOTS: Array<{ dir: string; file: string; slug: string }> = [
  { dir: 'marta-out', file: 'marta-v2-agency.json', slug: 'marta' },
  { dir: 'denver-out', file: 'denver-v2-agency.json', slug: 'rtd-denver' },
  { dir: 'indygo-out', file: 'indygo-v2-agency.json', slug: 'indygo' },
  { dir: 'lacmta-out', file: 'lacmta-v2-agency.json', slug: 'lacmta' },
];
const OUT = resolve('tmp/dev-history-v2');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
for (const p of PILOTS) {
  const src = join(ROOT, p.dir);
  if (!existsSync(join(src, p.file))) { console.warn(`skip ${p.slug}: ${join(src, p.file)} not found`); continue; }
  copyFileSync(join(src, p.file), join(OUT, `${p.slug}-v2-agency.json`));
  // Backfill output is sometimes nested one level deeper (history-v2/{slug}/history-v2/{slug}); only {periodKey}.json files are sidecars.
  const dirs = [join(src, 'history-v2', p.slug), join(src, 'history-v2', p.slug, 'history-v2', p.slug)];
  const dest = join(OUT, 'history-v2', p.slug);
  mkdirSync(dest, { recursive: true });
  for (const dir of dirs.filter(existsSync)) {
    for (const f of readdirSync(dir).filter(n => /^\d{8}\.json$/.test(n))) copyFileSync(join(dir, f), join(dest, f));
  }
  console.log(`ok ${p.slug}`);
}
console.log(`Fixtures in ${OUT}. Start dev with VITE_HISTORY_V2_BASE=/dev-history-v2`);
