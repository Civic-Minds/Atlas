import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { frequentRuleText, nightReportTitle, nightRuleText } from './researchRules';

describe('research rule text', () => {
  it('a Night list report is titled with the period name and the frequency filter (CIV-3167)', () => {
    expect(nightReportTitle(30)).toBe('Overnight · every 30 min or better');
    expect(nightReportTitle(60)).toBe('Overnight · every 60 min or better');
  });
  it('the Night list builds its report title from nightReportTitle, never a "view" (CIV-3167)', () => {
    const src = readFileSync(new URL('../apps/NightService.tsx', import.meta.url), 'utf8');
    expect(src).toContain('title={nightReportTitle(frequency)}');
    expect(src).not.toMatch(/\bview\)/);
  });
  it('night text uses the selected frequency', () => {
    expect(nightRuleText(30)).toBe('Routes with a departure every 30 min or better from 2–5 AM.');
    expect(nightRuleText(60)).toBe('Routes with a departure every 60 min or better from 2–5 AM.');
  });
  it('frequent text uses frequency, window and days', () => {
    expect(frequentRuleText({ frequency: 15, window: 'daytime', days: ['Weekday'] })).toBe('Routes with a departure every 15 min or better, 7 AM–7 PM, on weekdays.');
    expect(frequentRuleText({ frequency: 30, window: 'extended', days: ['Weekday', 'Saturday', 'Sunday'] })).toBe('Routes with a departure every 30 min or better, 7 AM–12 AM, on weekdays, Saturdays and Sundays.');
  });
});
