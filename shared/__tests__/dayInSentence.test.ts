import { describe, expect, it } from 'vitest';
import { dayInSentence, dayPlural } from '../dayTypes';
import { noServiceOnDayNotice } from '../../src/content/noticeCopy';
import { frequentRuleText } from '../../src/content/researchRules';
import { onDemandRunningNote } from '../onDemandAvailability';

// CIV-1569: day names inside sentences come from dayPlural / dayInSentence in shared/dayTypes.ts.
// The check that nothing builds this by hand is in src/content/__tests__/styleGuard.test.ts (CIV-1578).
describe('day names in sentences (CIV-1569)', () => {
  it('"on" takes the plural; weekday is lower case, Saturday and Sunday keep their capital', () => {
    expect(dayPlural('Weekday')).toBe('weekdays');
    expect(dayPlural('Saturday')).toBe('Saturdays');
    expect(dayPlural('Sunday')).toBe('Sundays');
    expect(dayInSentence('Weekday')).toBe('weekday');
    expect(dayInSentence('Saturday')).toBe('Saturday');
  });

  it('every sentence uses the same words', () => {
    expect(noServiceOnDayNotice('route', 'Saturday')).toContain('on Saturdays');
    expect(frequentRuleText({ frequency: 15, window: 'daytime', days: ['Weekday', 'Sunday'] } as Parameters<typeof frequentRuleText>[0])).toContain('on weekdays and Sundays');
    const hours = { Weekday: [{ startHour: 6, endHour: 20 }], Saturday: [{ startHour: 6, endHour: 20 }] };
    expect(onDemandRunningNote(hours, 'Weekday', 'all')).toBe('Running on weekdays');
    expect(onDemandRunningNote(hours, 'Saturday', 'all')).toBe('Running on Saturdays');
    expect(onDemandRunningNote(hours, 'Weekday', 'midday')).toBe('Running during weekday midday');
  });
});
