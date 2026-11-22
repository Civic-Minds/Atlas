import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dailyCapFor } from './dailyCap';

describe('daily call cap per tester', () => {
  const env = { DAILY_CALL_CAP: '300', TESTER_DAILY_CAPS: { 'MCP check': 2000 } };
  it('gives the internal testing link its own cap and everyone else the shared one', () => {
    expect(dailyCapFor('MCP check', env)).toBe(2000);
    expect(dailyCapFor('Elias', env)).toBe(300);
    expect(dailyCapFor('Elias', { DAILY_CALL_CAP: '300' })).toBe(300);
    expect(dailyCapFor('MCP check', { DAILY_CALL_CAP: '300', TESTER_DAILY_CAPS: '{"MCP check": 2000}' })).toBe(2000);
    expect(dailyCapFor('MCP check', { DAILY_CALL_CAP: '300', TESTER_DAILY_CAPS: 'not json' })).toBe(300);
  });
  it('keeps the caps in both deploy configs, not in code', () => {
    for (const f of ['wrangler.jsonc', 'wrangler.pilot-test.jsonc']) {
      const text = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
      expect(text).toMatch(/"DAILY_CALL_CAP": "300"/);
      expect(text).toMatch(/"TESTER_DAILY_CAPS": \{ "MCP check": 2000 \}/);
    }
    expect(readFileSync(new URL('./index.ts', import.meta.url), 'utf8')).toContain('dailyCapFor(tester.name, env)');
  });
});
