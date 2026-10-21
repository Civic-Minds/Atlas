import { describe, expect, it } from 'vitest';
import { shouldShowDirectionSections } from '../routeCardDirectionLayout';
import { rowLabelWithOrigin } from '../rowOriginLabel';
import { resolveBranchLabel } from '../format';
import type { ShapeProperties } from '../../hooks/useIntervalStats';

describe('shouldShowDirectionSections', () => {
  it('shows headings for two one-row directions with different compass labels (TTC 36)', () => {
    expect(shouldShowDirectionSections([
      { realTier: [{}], boundLabel: 'Eastbound' },
      { realTier: [{}], boundLabel: 'Westbound' },
    ])).toBe(true);
  });

  it('hides headings for two one-row directions without two distinct labels', () => {
    expect(shouldShowDirectionSections([{ realTier: [{}] }, { realTier: [{}] }])).toBe(false);
    expect(shouldShowDirectionSections([
      { realTier: [{}], boundLabel: 'Eastbound' },
      { realTier: [{}] },
    ])).toBe(false);
    expect(shouldShowDirectionSections([
      { realTier: [{}], boundLabel: 'Loop' },
      { realTier: [{}], boundLabel: 'loop' },
    ])).toBe(false);
  });

  it('shows section chrome when a direction has multiple branches', () => {
    expect(shouldShowDirectionSections([
      { realTier: [{}, {}] },
      { realTier: [{}] },
    ])).toBe(true);
  });

  it('hides section chrome for a single direction group', () => {
    expect(shouldShowDirectionSections([{ realTier: [{}, {}] }])).toBe(false);
  });

  it('TTC 36 rows under headings still read "to <destination>"', () => {
    const groups = [
      { boundLabel: 'Eastbound', realTier: [{ headsign: 'Finch', stopOrder: ['a'] }] },
      { boundLabel: 'Westbound', realTier: [{ headsign: 'Finch West Station', stopOrder: ['b'] }] },
    ] as unknown as { boundLabel: string; realTier: ShapeProperties[] }[];
    const sections = shouldShowDirectionSections(groups);
    const labels = groups.map(g => g.realTier.map(d => rowLabelWithOrigin(resolveBranchLabel({
      headsign: d.headsign, shortName: '36', longName: 'Finch West', multipleDirections: sections, sectionBoundLabel: sections ? g.boundLabel : undefined,
    }), d, g.realTier)));
    expect(sections).toBe(true);
    expect(labels).toEqual([['to Finch'], ['to Finch West Station']]);
  });
});
