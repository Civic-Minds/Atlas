import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BETA_SITE_URL, DEFAULT_BETA_R2_PUBLIC_URL, DEFAULT_R2_PUBLIC_URL, PREVIEW_SITE_URL, SITE_URL } from '../paths';
import { KIND_REASONS, KNOWN_COPIES } from './rulesBoundaryAllowlist';
import { lineKinds, ROOT, scanRules, type RuleKind } from './rulesBoundaryScan';

/**
 * Rules audit 4.2 (Ryan OK'd the refactor): a rule value, such as a frequency scale, a period window, a day list, an
 * origin, a colour or a minimum sample, is defined only in shared/rules/. Every other copy fails here, except today's
 * known copies (rulesBoundaryAllowlist.ts), which each move into shared/rules/ deletes.
 */
describe('rule values live in shared/rules/ (rules audit 4.2)', () => {
  const found = scanRules();

  it('has no new copy of a rule value outside shared/rules/', () => {
    const extra: string[] = [];
    for (const [file, kinds] of Object.entries(found)) for (const [kind, n] of Object.entries(kinds) as [RuleKind, number][]) {
      const allowed = KNOWN_COPIES[file]?.[kind] ?? 0;
      if (n > allowed) extra.push(`${file}: ${n - allowed} new ${kind} (${KIND_REASONS[kind]}); import it from shared/rules/ instead`);
    }
    expect(extra).toEqual([]);
  });

  it('has no stale allowance: a file that lost a copy lowers its count here', () => {
    const stale: string[] = [];
    for (const [file, kinds] of Object.entries(KNOWN_COPIES)) for (const [kind, n] of Object.entries(kinds) as [RuleKind, number][]) {
      const now = found[file]?.[kind] ?? 0;
      if (now < n) stale.push(`${file}: ${kind} allowed ${n}, found ${now}`);
    }
    expect(stale).toEqual([]);
  });

  it('every origin in the files that cannot import (index.html, vercel.json) is one from shared/rules/paths.ts', () => {
    const known = new Set([SITE_URL, BETA_SITE_URL, PREVIEW_SITE_URL, DEFAULT_R2_PUBLIC_URL, DEFAULT_BETA_R2_PUBLIC_URL].map(u => new URL(u).host));
    for (const f of ['index.html', 'vercel.json']) {
      const hosts = [...readFileSync(join(ROOT, f), 'utf8').matchAll(/https?:\/\/([a-z0-9.-]*(?:transitatlas\.fyi|r2\.dev|vercel\.app))/g)].map(m => m[1]);
      expect([f, hosts.filter(h => !known.has(h))]).toEqual([f, []]);
    }
  });

  it('catches each kind of copy, and leaves comments, phone numbers and other numbers alone', () => {
    const slips: Record<RuleKind, string> = {
      definition: 'export const SURFACE_TIER_MAXES = [10, 15];',
      'scale-array': 'const targets = [10, 15, 20, 30];',
      'grace-formula': 'const grace = Math.max(5, headway * 0.15);',
      'period-minutes': 'const window = { start: 570, end: 870 };',
      'route-type-digit': "if (route.route_type === '2') return true;",
      origin: "const base = 'https://www.transitatlas.fyi';",
      colour: "const red = '#c0392b';",
      'min-sample': 'if (s.n >= 30) keep(s);',
    };
    for (const [kind, line] of Object.entries(slips) as [RuleKind, string][]) expect([kind, lineKinds(line).includes(kind)]).toEqual([kind, true]);
    for (const fine of ["bookingInfo: 'Call 540-343-1721'", 'const sizes = [12, 24];', 'const issue = 1563;', "const n = 3;", "title: 'Phase 30'"]) expect([fine, lineKinds(fine)]).toEqual([fine, []]);
  });
});
