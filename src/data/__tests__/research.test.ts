import { describe, expect, it } from 'vitest';
import { newestResearch, RESEARCH, type ResearchEntry } from '../research';

describe('research list (CIV-1205)', () => {
  it('gives the newest entries first, so a new page reaches "Keep looking" on its own', () => {
    const added: ResearchEntry = { ...RESEARCH[0], href: '/research/new', title: 'New', published: '2099-01-01' };
    expect(newestResearch(2, [...RESEARCH, added]).map(e => e.href)).toEqual(['/research/new', newestResearch(1)[0].href]);
  });

  it('has one entry per page, each with a date', () => {
    expect(new Set(RESEARCH.map(e => e.href)).size).toBe(RESEARCH.length);
    for (const e of RESEARCH) expect(e.published).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
