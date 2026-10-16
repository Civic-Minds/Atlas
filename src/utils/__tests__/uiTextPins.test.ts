import { describe, expect, it } from 'vitest';
import { agencyIntroSentence, agencyLeadSentence, introLead, namesList } from '../../../shared/agencyPages';
import { agencyIndexDescription } from '../../../shared/agencyIndex';
import { feedQualityReasonForValidationWarnings, feedQualityReasonForShapeAnomalies, feedQualityReasonForHeadwayMismatches } from '../../../shared/feedQuality';
import { frequentRuleText } from '../../content/researchRules';
import { describeMapExport, type MapExportState } from '../mapExportDetails';

// Pins the exact wording of list and count text that step 1 of the UI consolidation moved onto
// shared helpers (joinList, plural). The expectations were written against the code before the
// move and must not change with it.
describe('list and count wording stays exactly as it was', () => {
  it('namesList', () => {
    expect(namesList([])).toBe('');
    expect(namesList(['A'])).toBe('A');
    expect(namesList(['A', 'B'])).toBe('A and B');
    expect(namesList(['A', 'B', 'C'])).toBe('A, B and C');
    expect(namesList(['A', 'B', 'C', 'D'])).toBe('A, B, C and 1 other agency');
    expect(namesList(['A', 'B', 'C', 'D', 'E'])).toBe('A, B, C and 2 other agencies');
  });

  it('agency page sentences', () => {
    expect(agencyLeadSentence({ routes: [] })).toBe('0 weekday routes.');
    expect(agencyLeadSentence({ routes: [{}] } as never)).toBe('1 weekday route.');
    expect(agencyLeadSentence({ routes: [{}, {}] } as never)).toBe('2 weekday routes.');
    expect(introLead({ name: 'Acme', routes: [{}] } as never, 'Town')).toBe('Acme operates 1 route in ');
    expect(introLead({ name: 'Acme', routes: [{}, {}] } as never, 'Town')).toBe('Acme operates 2 routes in ');
    const a = (routes: number, stops: number) => ({ name: 'Acme', city: 'Town', routes: Array.from({ length: routes }, () => ({})), stops }) as never;
    expect(agencyIntroSentence(a(1, 1), 'Town')).toBe('Acme operates 1 route in Town with 1 stop.');
    expect(agencyIntroSentence(a(3, 1980), 'Town', [{ name: 'X' }, { name: 'Y' }])).toBe('Acme operates 3 routes in Town with 1,980 stops and connects with X and Y.');
  });

  it('agency index description', () => {
    expect(agencyIndexDescription({ agencyCount: 1, areas: [{}] } as never)).toContain('1 transit agency and 1 region.');
    expect(agencyIndexDescription({ agencyCount: 1234, areas: [{}, {}] } as never)).toContain('1,234 transit agencies and 2 regions.');
  });

  it('feed quality reasons', () => {
    expect(feedQualityReasonForValidationWarnings(1)).toBe('1 minor schedule issue found while reading the feed.');
    expect(feedQualityReasonForValidationWarnings(2)).toBe('2 minor schedule issues found while reading the feed.');
    expect(feedQualityReasonForShapeAnomalies(1)).toBe('1 route shape needed adjustment before display.');
    expect(feedQualityReasonForShapeAnomalies(2)).toBe('2 route shapes needed adjustment before display.');
    expect(feedQualityReasonForHeadwayMismatches(1)).toBe('1 route has stops whose frequency differs from the overall route schedule.');
    expect(feedQualityReasonForHeadwayMismatches(2)).toBe('2 route have stops whose frequency differs from the overall route schedule.');
  });

  it('frequent rule day lists', () => {
    const t = (days: string[]) => frequentRuleText({ frequency: 15, window: 'daytime', days: days as never });
    expect(t([])).toContain('on the selected day.');
    expect(t(['Weekday'])).toContain('on weekdays.');
    expect(t(['Weekday', 'Saturday'])).toContain('on weekdays and Saturdays.');
    expect(t(['Weekday', 'Saturday', 'Sunday'])).toContain('on weekdays, Saturdays and Sundays.');
  });

  it('map export filter lines', () => {
    const base: MapExportState = { view: 'frequent-service', viewTitle: 'Frequent', colorMode: 'default', maxHeadway: 20, day: 'Saturday', period: 'midday', zoom: 12 };
    const d = (days: string[]) => describeMapExport({ ...base, frequentServiceDays: days as never, frequentServiceFrequency: 15, frequentServiceWindow: 'daytime' }, [], []).lines;
    expect(d(['Weekday'])).toMatchInlineSnapshot(`
      [
        "Every 15 min or better · Weekday · 7am–7pm",
      ]
    `);
    expect(d(['Weekday', 'Saturday'])).toMatchInlineSnapshot(`
      [
        "Every 15 min or better · Weekday and Saturday · 7am–7pm",
      ]
    `);
    expect(d(['Weekday', 'Saturday', 'Sunday'])).toMatchInlineSnapshot(`
      [
        "Every 15 min or better · Weekday, Saturday and Sunday · 7am–7pm",
      ]
    `);
    const f = (modes: number[]) => describeMapExport({ ...base, view: 'frequency', selectedModes: modes }, [], []).lines;
    expect(f([3, 1])).toMatchInlineSnapshot(`
      [
        "Every 20 min or better · Saturday midday · Subway/Metro and Bus",
      ]
    `);
    expect(f([3, 1, 0])).toMatchInlineSnapshot(`
      [
        "Every 20 min or better · Saturday midday · Subway/Metro, Streetcar and Bus",
      ]
    `);
  });
});
