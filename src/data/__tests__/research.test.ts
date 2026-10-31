import { describe, expect, it } from 'vitest';
import { newestResearch, RESEARCH, type ResearchEntry } from '../research';

describe('research list (CIV-1205)', () => {
  it('gives the newest entries first, so a new page reaches the About page on its own', () => {
    const added: ResearchEntry = { ...RESEARCH[0], href: '/research/new', title: 'New', published: '2099-01-01' };
    expect(newestResearch(2, [...RESEARCH, added]).map(e => e.href)).toEqual(['/research/new', newestResearch(1)[0].href]);
  });

  it('has one entry per page, each with a date', () => {
    expect(new Set(RESEARCH.map(e => e.href)).size).toBe(RESEARCH.length);
    for (const e of RESEARCH) expect(e.published).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("uses Ryan's approved card wording, on /research and /about alike", () => {
    const body = (title: string) => RESEARCH.find(e => e.title === title)?.body;
    expect(body('Free child fares')).toBe('Up to what age children ride free on transit in Canada and the US, and which systems are free for everyone.');
    expect(body('Frequent service')).toBe('What agencies in Canada and the US mean when they call a bus frequent.');
    expect(body('Overnight service')).toBe('See which routes keep running from 2–\u20605 AM, and how often they come.');
  });

  it("uses Ryan's approved link text per card", () => {
    const link = (title: string) => RESEARCH.find(e => e.title === title)?.linkText;
    expect(link('Free child fares')).toBe('See which ages ride free');
    expect(link('Frequent service')).toBe('Compare agency definitions');
    expect(link('Overnight service')).toBe('Find routes running all night');
  });
});
