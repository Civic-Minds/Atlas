/**
 * CIV-1841 / CIV-2120: deletes the questions, arguments and answers from the hosted MCP's call log, keeping each call's
 * time, tool and duration (the daily cron deletes those after 12 months). Run once, 30 days after the pilot ends, and
 * only with Ryan's or the manager's go: it writes to the live D1 database.
 *
 *   npx tsx scripts/mcp/purgeCallText.ts --yes
 */
import { spawnSync } from 'node:child_process';
import { PURGE_CALL_TEXT_SQL } from '../../workers/atlas-mcp/src/retention';

if (!process.argv.includes('--yes')) {
  console.error('This deletes every question, argument and answer from the hosted MCP call log. Run again with --yes to do it.');
  process.exit(1);
}
const r = spawnSync('npx', ['wrangler@4.164.0', 'd1', 'execute', 'atlas-studio-mcp', '--remote', '--command', PURGE_CALL_TEXT_SQL], { cwd: new URL('../../workers/atlas-mcp/', import.meta.url).pathname, stdio: 'inherit' });
process.exit(r.status ?? 1);
