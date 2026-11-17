import { describe, expect, it } from 'vitest';
import { KIND_REASONS, KNOWN_COPIES } from './rulesBoundaryAllowlist';
import { lineKinds, scanRules, type RuleKind } from './rulesBoundaryScan';

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
