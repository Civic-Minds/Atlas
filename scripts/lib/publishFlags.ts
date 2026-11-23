/**
 * #1708: the pipeline switches the publish job reads from the repo variables (.github/workflows/rebuild-release.yml: the
 * dry-run job's allowlist and the publish job's env). A Mac script that builds from the pipeline turns on the same ones,
 * so its output reads routes the way the published map does. With them off, Studio's schedule-change files for hamilton,
 * mbta, rtd-denver and ttc differed from the cloud's, built from the same zips and commit.
 */
import { execFileSync } from 'node:child_process';

/** The switches, as the workflow lists them (a test checks the workflow still names exactly these). */
export const PUBLISH_FLAGS = ['ATLAS_HEADLINE_FROM_TRUNK', 'ATLAS_PIECE_READING', 'ATLAS_BRANCH_READINGS', 'ATLAS_PIECES_BY_TRIPS'] as const;

/** `ATLAS_PUBLISH_FLAGS=none` leaves every switch as the shell set it (for a flags-off comparison). */
export const PUBLISH_FLAGS_OFF = 'none';

type Env = Record<string, string | undefined>;

/**
 * The switches to turn on: each one the repo variables set to 1, unless the shell already set it (the shell wins, so a
 * one-off comparison can still turn a switch off with ATLAS_PIECE_READING=0).
 */
export function publishFlagsToSet(vars: Record<string, string>, env: Env): string[] {
  if (env.ATLAS_PUBLISH_FLAGS === PUBLISH_FLAGS_OFF) return [];
  return PUBLISH_FLAGS.filter(flag => env[flag] === undefined && vars[flag] === '1');
}

/** The repo variables, read with the GitHub CLI. */
export function repoVariables(): Record<string, string> {
  const out = execFileSync('gh', ['variable', 'list', '--json', 'name,value'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return Object.fromEntries((JSON.parse(out) as Array<{ name: string; value: string }>).map(v => [v.name, v.value]));
}

/**
 * Turns on the publish job's switches in this process before any pipeline work, and says which are on. Stops with a
 * message when the repo variables can't be read, rather than quietly building with every switch off.
 */
export function applyPublishFlags(env: Env = process.env, read: () => Record<string, string> = repoVariables): string[] {
  if (env.ATLAS_PUBLISH_FLAGS === PUBLISH_FLAGS_OFF) {
    console.log('Publish flags: left as the shell set them (ATLAS_PUBLISH_FLAGS=none)');
    return [];
  }
  let vars: Record<string, string>;
  try {
    vars = read();
  } catch (err) {
    throw new Error(`Could not read the repo variables with \`gh variable list\` (${(err as Error).message.split('\n')[0]}). Log in with gh, set the switches yourself, or run with ATLAS_PUBLISH_FLAGS=none for a flags-off build.`);
  }
  const on = publishFlagsToSet(vars, env);
  for (const flag of on) env[flag] = '1';
  const all = PUBLISH_FLAGS.filter(flag => env[flag] === '1');
  console.log(`Publish flags on (as the publish job): ${all.length ? all.join(' ') : 'none'}`);
  return on;
}
