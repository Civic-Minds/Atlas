import { describe, expect, it } from 'vitest';
import { reportDetails } from '../reportIssue';

// CIV-999: one builder for every card's report details, the same text the cards wrote by hand.
describe('reportDetails', () => {
  it('writes labelled fields, plain lines as written, and the Atlas URL last', () => {
    expect(reportDetails([['Agency', 'TTC'], ['Period', 'midday'], '**Listed:**', '- 504 King'], 'https://x/?a=1'))
      .toBe('**Agency:** TTC\n**Period:** midday\n**Listed:**\n- 504 King\n**Atlas URL:** https://x/?a=1');
  });

  it("matches the agency card's old hand-built text", () => {
    const url = 'https://x/';
    const old = `**Agency:** A\n**Day:** Weekday\n**Period:** midday\n**Schedule added:** unknown\n**Schedule covers service until:** unknown\n**Atlas URL:** ${url}`;
    expect(reportDetails([['Agency', 'A'], ['Day', 'Weekday'], ['Period', 'midday'], ['Schedule added', 'unknown'], ['Schedule covers service until', 'unknown']], url)).toBe(old);
  });
});
