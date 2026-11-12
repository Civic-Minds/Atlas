/**
 * CIV-1402 step 2: what each build has switched on, computed by the real shared/config.ts.
 *
 * shared/config.ts reads its switches from import.meta.env at build time, so FEATURES can only be
 * known for a given set of env values. featuresForEnv bundles shared/config.ts with those values
 * defined (as Vite does), runs it, and returns its FEATURES. The build writes the result to
 * /flags.json (vite.config.ts) and `npm run flags` reads that file from each site.
 */
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type FeatureMap = Record<string, boolean>;

export interface FlagsFile {
  /** VITE_ATLAS_MODE as the app resolved it (public, preview, beta, dev). */
  mode: string;
  /** Every FEATURES entry of shared/config.ts. */
  features: FeatureMap;
  /** The VITE_*_ENABLED / VITE_*_BUILD / VITE_ATLAS_MODE values the build was given (unset ones left out). */
  switches: Record<string, string>;
  /** The deployed commit, when the build knows it (Vercel). */
  commit?: string;
}

/** The env keys that decide feature exposure: never URLs or keys. */
export function isSwitchKey(key: string): boolean {
  return key === 'VITE_ATLAS_MODE' || /^VITE_[A-Z0-9_]+_(ENABLED|BUILD)$/.test(key);
}

export function pickSwitches(env: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(env).filter(isSwitchKey).sort()) {
    const v = env[key];
    if (v !== undefined && v !== '') out[key] = v;
  }
  return out;
}

/** Run shared/config.ts with these import.meta.env values and return { mode, features }. */
export async function featuresForEnv(env: Record<string, string | boolean | undefined>, root = process.cwd()): Promise<{ mode: string; features: FeatureMap }> {
  const result = await build({
    entryPoints: [resolve(root, 'shared/config.ts')],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    write: false,
    logLevel: 'silent',
    define: { 'import.meta.env': JSON.stringify(env) },
  });
  const code = result.outputFiles[0].text;
  const mod = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`) as { FEATURES: Record<string, unknown>; ATLAS_MODE: string };
  const features: FeatureMap = {};
  for (const [k, v] of Object.entries(mod.FEATURES)) if (typeof v === 'boolean') features[k] = v;
  return { mode: mod.ATLAS_MODE, features };
}

/**
 * The env a package.json dev script sets (`VITE_X=1 VITE_Y=2 vite`), with Vite's DEV/PROD/MODE as `vite` dev
 * sets them. Throws if the script is missing, so a renamed script fails loudly.
 */
export function devScriptEnv(script: string, root = process.cwd()): Record<string, string | boolean> {
  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
  const cmd = pkg.scripts[script];
  if (!cmd) throw new Error(`package.json has no "${script}" script`);
  const env: Record<string, string | boolean> = { DEV: true, PROD: false, MODE: 'development' };
  for (const m of cmd.matchAll(/(?:^|\s)([A-Z][A-Z0-9_]*)=(\S+)/g)) env[m[1]] = m[2];
  return env;
}
