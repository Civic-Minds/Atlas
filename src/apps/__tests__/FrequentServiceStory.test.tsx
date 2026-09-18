import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import FrequentServiceStory from '../FrequentServiceStory';
import { frequentServiceStoryStats } from '../../data/frequentServiceStory';
import audit from '../../../docs/research/system-map-audit-2026-09.json';

const agencies = [{ slug: 'ttc', name: 'Toronto Transit Commission' }] as any;

describe('FrequentServiceStory', () => {
  it('guides readers from the research question through the verified examples', () => {
    render(<FrequentServiceStory agencies={agencies} onExploreMap={() => {}} />);
    expect(screen.getByRole('heading', { name: 'What happens when you miss the bus?' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'There is no single “frequent.”' })).toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.getByText(/representative frequent-service tier/)).toBeInTheDocument();
  });

  it('hands readers off to the existing map', () => {
    const onExploreMap = vi.fn();
    render(<FrequentServiceStory agencies={agencies} onExploreMap={onExploreMap} />);
    fireEvent.click(screen.getByRole('button', { name: /Find your city/i }));
    expect(onExploreMap).toHaveBeenCalledOnce();
  });

  it('changes the selected threshold without rendering agency tabs', () => {
    render(<FrequentServiceStory agencies={agencies} onExploreMap={() => {}} />);
    const tenMinuteButton = screen.getByRole('button', { name: /Show examples for 10-minute service/ });
    fireEvent.click(tenMinuteButton);
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(tenMinuteButton).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps the story chart aligned with exact numeric system-map evidence', () => {
    const counts = audit.records
      .filter(record => Number.isInteger(record.representativeThresholdMinutes))
      .reduce<Record<string, number>>((result, record) => {
        result[String(record.representativeThresholdMinutes)] = (result[String(record.representativeThresholdMinutes)] ?? 0) + 1;
        return result;
      }, {});
    expect(frequentServiceStoryStats.headwayBars).toEqual([
      { minutes: 10, agencies: counts['10'] },
      { minutes: 12, agencies: counts['12'] },
      { minutes: 15, agencies: counts['15'] },
      { minutes: 20, agencies: counts['20'] },
      { minutes: 30, agencies: counts['30'] },
    ]);
  });

  it('does not mistake unavailable or unnamed maps for numeric definitions', () => {
    expect(audit.records).toHaveLength(89);
    expect(audit.records.filter(record => record.status === 'pending_map_review')).toHaveLength(0);
    expect(frequentServiceStoryStats.agenciesReviewed).toBe(89);
    expect(frequentServiceStoryStats.categoryCounts).toMatchObject({
      numericDefinition: 26,
      qualitativeDefinition: 8,
      noDefinitionFound: 50,
      mapUnavailable: 5,
    });
    expect(frequentServiceStoryStats.headwayBars).toEqual([
      { minutes: 10, agencies: 1 },
      { minutes: 12, agencies: 1 },
      { minutes: 15, agencies: 15 },
      { minutes: 20, agencies: 3 },
      { minutes: 30, agencies: 6 },
    ]);
  });
});
