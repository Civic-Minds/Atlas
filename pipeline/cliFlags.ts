/**
 * CIV-3017: a script that can write to R2 refuses any flag it doesn't know. Most scripts read their flags by hand
 * (`argv.includes('--dry-run')`), so a typo such as `--dryrun` was silently ignored and the script did a real write.
 * Call `assertKnownFlags(process.argv.slice(2), { ... })` first, listing every flag the script reads; it changes no
 * accepted flag's meaning and only stops a run that passes something else.
 */

/** 'flag' takes no value; 'value' takes one, as `--name value` or `--name=value`. */
export type FlagKind = 'flag' | 'value';

export function unknownFlags(argv: readonly string[], known: Readonly<Record<string, FlagKind>>): string[] {
  const unknown: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--') break;
    if (!arg.startsWith('-') || arg === '-') continue; // a positional argument or a flag's value
    const name = arg.includes('=') ? arg.slice(0, arg.indexOf('=')) : arg;
    const kind = known[name];
    if (!kind) { unknown.push(name); continue; }
    if (kind === 'value' && !arg.includes('=')) i++; // skip the value, which may itself start with '-'
  }
  return unknown;
}

export function assertKnownFlags(argv: readonly string[], known: Readonly<Record<string, FlagKind>>): void {
  const unknown = unknownFlags(argv, known);
  if (unknown.length === 0) return;
  const accepted = Object.keys(known).sort().join(', ') || '(none)';
  throw new Error(`Unknown flag${unknown.length > 1 ? 's' : ''} ${unknown.join(', ')}; refusing to run. This script accepts: ${accepted}.`);
}
