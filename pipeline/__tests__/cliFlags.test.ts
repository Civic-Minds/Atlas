import { describe, expect, it } from 'vitest';
import { assertKnownFlags, unknownFlags } from '../cliFlags';

const KNOWN = { '--dry-run': 'flag', '--write': 'flag', '--only': 'value', '--run-prefix': 'value' } as const;

describe('assertKnownFlags (CIV-3017)', () => {
  it('accepts every listed flag, values in both forms, and positionals', () => {
    expect(unknownFlags(['--dry-run', '--only', 'ttc,go', '--run-prefix=atlas/runs/1', 'ttc'], KNOWN)).toEqual([]);
    expect(() => assertKnownFlags(['--write', '--only', 'ttc'], KNOWN)).not.toThrow();
  });

  it('refuses a mistyped flag, so a typo never turns into a real write', () => {
    expect(unknownFlags(['--dryrun'], KNOWN)).toEqual(['--dryrun']);
    expect(() => assertKnownFlags(['--dryrun', '--write'], KNOWN)).toThrow(/Unknown flag --dryrun; refusing to run\. This script accepts: --dry-run, --only, --run-prefix, --write\./);
  });

  it('reads a value that starts with a dash as the value, not a flag', () => {
    expect(unknownFlags(['--only', '-x'], KNOWN)).toEqual([]);
  });

  it('checks the name before = and stops at --', () => {
    expect(unknownFlags(['--dry-run=1', '--nope=2'], KNOWN)).toEqual(['--nope']);
    expect(unknownFlags(['--', '--anything'], KNOWN)).toEqual([]);
  });

  it('refuses short flags it was not given', () => {
    expect(unknownFlags(['-n'], KNOWN)).toEqual(['-n']);
  });
});
