import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The scan behind rulesBoundary.test.ts (rules audit 4.2): where a rule value (a frequency scale, a period window, a
 * day list, an origin, a colour, a minimum sample, a limit, the earth's radius) is defined or typed outside shared/rules/. Comments don't count,
 * so a comment may quote an old value.
 */
export const ROOT = join(import.meta.dirname, '..', '..', '..');
const DIRS = ['src', 'shared', 'pipeline', 'local-api', 'api', 'workers', 'scripts'];
/** Files that can't import a TS module, checked for origins only. */
const PLAIN = ['vercel.json', 'index.html'];

/** Every tier, night and frequent-service step (ALL_TIER_MAXES, NIGHT_GRADES, FREQUENT_GRADES in the audit). */
const SCALE_VALUES = new Set([5, 8, 10, 15, 20, 30, 60, 90]);
const ORIGINS = /data\.transitatlas\.fyi|pub-5f1c48f86b024c42a8d174a4a5dd69ca\.r2\.dev|(www|beta|preview)\.transitatlas\.fyi|atlas-gamma-two\.vercel\.app/;

export type RuleKind = 'definition' | 'scale-array' | 'grace-formula' | 'period-minutes' | 'route-type-digit' | 'origin' | 'colour' | 'min-sample' | 'earth-radius';

const RULE_NAME = /^(\w*_TIER_MAXES|TIER_RANK|TIME_PERIODS|PERIOD_(KEYS|MINUTES|LABELS)|DAY_TYPES|ALL_DAYS|WEEKDAYS|\w*_THRESHOLD|\w*MIN_SAMPLE\w*|\w*_ROUTE_TYPES|\w*R2_PUBLIC_URL|\w*SITE_URL|EARTH_RADIUS\w*|DEFAULT_RATE_\w+|(TAB_)?TITLE_MAX|DESCRIPTION_M(AX|IN)|DEFAULT_MAP_(CENTER|ZOOM)|\w*_BBOX_PAD|AGENCY_CHIP_PAD|MAP_ZOOM_\w+|DETAIL_GEOJSON_MIN_ZOOM)$/;

/** One line's breaks of each kind. */
export function lineKinds(line: string): RuleKind[] {
  const out: RuleKind[] = [];
  const def = /\b(?:const|let)\s+([A-Z][A-Z0-9_]*)\b/.exec(line);
  if ((def && RULE_NAME.test(def[1])) || /'Weekday'\s*\|\s*'Saturday'\s*\|\s*'Sunday'/.test(line)) out.push('definition');
  for (const m of line.matchAll(/\[\s*(\d+(?:\s*,\s*\d+)+)\s*,?\s*\]/g)) {
    const nums = m[1].split(',').map(n => Number(n.trim()));
    if (nums.every(n => SCALE_VALUES.has(n))) { out.push('scale-array'); break; }
  }
  if (/Math\.max\(\s*5\s*,[^)]*0\.15/.test(line)) out.push('grace-formula');
  if (/(?<![\w.-])(540|570|870|1380)(?![\w.-])|\b26\s*\*\s*60\b/.test(line)) out.push('period-minutes');
  if (/\b(route_?[Tt]ype|routeType|mode)\s*[!=]==?\s*['"]?\d/.test(line)) out.push('route-type-digit');
  if (ORIGINS.test(line)) out.push('origin');
  if (/(['"`]|:\s*)#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b|rgba?\(/.test(line)) out.push('colour');
  if (/(>=|<|>)\s*30\b/.test(line) && /\b(samples?|n|count|trips|days)\b/.test(line)) out.push('min-sample');
  if (/(?<![\w.])6_?371(?:_?000|e3)?(?![\w.])/.test(line)) out.push('earth-radius');
  return out;
}

/** Block comments and line comments that don't start inside a string or URL. */
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, '')).replace(/(^|[^:'"`\w])\/\/.*$/gm, '$1');

function files(dir: string): string[] {
  let names: string[];
  try { names = readdirSync(join(ROOT, dir)); } catch { return []; }
  return names.flatMap(name => {
    const rel = `${dir}/${name}`;
    if (name === 'node_modules' || name === '__tests__' || name.startsWith('.') || rel === 'shared/rules') return [];
    if (statSync(join(ROOT, rel)).isDirectory()) return files(rel);
    return /\.(ts|tsx|mts|mjs)$/.test(name) && !/\.test\.(ts|tsx|mts|mjs)$/.test(name) && !name.endsWith('.d.ts') ? [rel] : [];
  });
}

/** Each scanned file's count of each kind, files with none left out. */
export function scanRules(): Record<string, Partial<Record<RuleKind, number>>> {
  const out: Record<string, Partial<Record<RuleKind, number>>> = {};
  const add = (f: string, k: RuleKind) => { (out[f] ??= {})[k] = (out[f][k] ?? 0) + 1; };
  for (const f of DIRS.flatMap(files)) for (const line of code(readFileSync(join(ROOT, f), 'utf8')).split('\n')) for (const k of lineKinds(line)) add(f, k);
  for (const f of PLAIN) {
    let text = '';
    try { text = readFileSync(join(ROOT, f), 'utf8'); } catch { continue; }
    for (const line of text.split('\n')) if (ORIGINS.test(line)) add(f, 'origin');
  }
  return out;
}
