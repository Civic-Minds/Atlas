import { describe, expect, it } from 'vitest';
import { liveLinkPreview } from '../liveLinkPreview';
import type { AgencySummary } from '../liveAgency';

const summary = {
  weekly: { thisWeek: { dates: ['2026-10-08', '2026-10-14'], late: { share: 0.075 } } },
  routes: [{ route: '504', titleLabel: '504 King', lateShare: 0.087 }],
} as unknown as AgencySummary;

describe('liveLinkPreview', () => {
  it('uses the approved title and the Late tile and subtitle wording', () => {
    expect(liveLinkPreview('ttc', '504', summary)).toEqual({ title: '504 King · Live · Atlas', description: '9% of departures left more than 5½ min late · Week of Oct 8–14' });
    expect(liveLinkPreview('ttc', null, summary).description).toBe('8% of departures left more than 5½ min late · Week of Oct 8–14');
  });
  it('falls back to the title alone without data', () => {
    expect(liveLinkPreview('ttc', '512', null)).toEqual({ title: 'TTC 512 · Live · Atlas', description: '' });
  });
});
