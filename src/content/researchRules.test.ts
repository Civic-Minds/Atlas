import { describe, expect, it } from 'vitest';
import { frequentRuleText, nightRuleText } from './researchRules';

describe('research rule text', () => {
  it('night text uses the selected frequency', () => {
    expect(nightRuleText(30)).toBe('Routes with a departure every 30 min or better from 2–5 AM.');
    expect(nightRuleText(60)).toBe('Routes with a departure every 60 min or better from 2–5 AM.');
  });
  it('frequent text uses frequency, window and days', () => {
    expect(frequentRuleText({ frequency: 15, window: 'daytime', days: ['Weekday'] })).toBe('Routes with a departure every 15 min or better, 7 AM–7 PM, on weekdays.');
    expect(frequentRuleText({ frequency: 30, window: 'extended', days: ['Weekday', 'Saturday', 'Sunday'] })).toBe('Routes with a departure every 30 min or better, 7 AM–12 AM, on weekdays, Saturdays and Sundays.');
  });
});
