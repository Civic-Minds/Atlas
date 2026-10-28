// Type-checks pipeline/ (tsconfig.pipeline.json) for CI (#719).
//
// SKIPPED_FILES filters out errors in files that still have known type errors (tsc cannot skip a
// file that other files import). It is empty: featureDedupe.ts, routeGrading.ts and
// transit-phase2.ts typecheck now (CIV-1004). Add an entry only with an issue number.
//
// TODO(#719): pipeline/catalog.ts and pipeline/population.ts (import the nonexistent
// types/catalog) and pipeline/restore-active-feeds.ts (imports r2 helpers that do not exist) are
// excluded in tsconfig.pipeline.json. They are not imported by anything else; fix or delete them.
import { spawnSync } from 'node:child_process';

const SKIPPED_FILES = [];

const result = spawnSync('npx', ['tsc', '--noEmit', '-p', 'tsconfig.pipeline.json', '--pretty', 'false'], {
  encoding: 'utf8',
  shell: process.platform === 'win32',
});
if (result.error) throw result.error;

const output = `${result.stdout}${result.stderr}`;
const errors = output
  .split('\n')
  .filter(line => /error TS\d+/.test(line))
  .filter(line => !SKIPPED_FILES.some(file => line.startsWith(`${file}(`)));

if (errors.length > 0) {
  console.error(errors.join('\n'));
  console.error(`\n${errors.length} pipeline type error(s).`);
  process.exit(1);
}
const skipped = output.split('\n').filter(line => /error TS\d+/.test(line)).length - errors.length;
console.log(`pipeline typecheck passed${skipped ? ` (${skipped} known error(s) in ${SKIPPED_FILES.length} skipped files, #719)` : ''}`);
