import { describe, expect, it } from 'vitest';
import { clockText, frequentRuleText, nightRuleText } from './researchRules';

describe('research rule text', () => {
  it('formats clock times plainly', () => {
    expect([clockText(420), clockText(1140), clockText(1440), clockText(150)]).toEqual(['7am', '7pm', 'midnight', '2:30am']);
  });
  it('night text uses the selected frequency', () => {
    expect(nightRuleText(30)).toBe('Routes with a departure at least every 30 minutes from 2am to 6am.');
    expect(nightRuleText(60)).toBe('Routes with a departure at least every 60 minutes from 2am to 6am.');
  });
  it('frequent text uses frequency, window and days', () => {
    expect(frequentRuleText({ frequency: 15, window: 'daytime', days: ['Weekday'] })).toBe('Routes with a departure at least every 15 minutes, 7am to 7pm, on weekdays.');
    expect(frequentRuleText({ frequency: 30, window: 'extended', days: ['Weekday', 'Saturday', 'Sunday'] })).toBe('Routes with a departure at least every 30 minutes, 7am to midnight, on weekdays, Saturdays and Sundays.');
  });
});
