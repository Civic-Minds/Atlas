import fs from 'node:fs';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import FrequentServiceStory from '../FrequentServiceStory';
import { frequentServiceStoryStats } from '../../data/frequentServiceStory';

describe('FrequentServiceStory', () => {
  it('guides readers from the research question through the featured examples', () => {
    render(<FrequentServiceStory onExploreMap={() => {}} />);

    expect(screen.getByRole('heading', { name: 'What does “frequent” actually mean?' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '15 minutes is common. It is not universal.' })).toBeInTheDocument();
    expect(screen.getByText('Toronto')).toBeInTheDocument();
    expect(screen.getByText('Toronto Transit Commission')).toBeInTheDocument();
    expect(screen.getByText('Yellowknife')).toBeInTheDocument();
    expect(screen.getByText('Yellowknife Transit')).toBeInTheDocument();
    expect(screen.getByText('No named definition found')).toBeInTheDocument();
    expect(screen.getByText(/Ordered by published headway/)).toBeInTheDocument();
  });

  it('hands readers off to the existing map', () => {
    const onExploreMap = vi.fn();
    render(<FrequentServiceStory onExploreMap={onExploreMap} />);

    fireEvent.click(screen.getByRole('button', { name: /Find your city/i }));
    expect(onExploreMap).toHaveBeenCalledOnce();
  });

  it('keeps the story chart aligned with the generated research analysis', () => {
    const analysis = JSON.parse(fs.readFileSync('docs/research/frequent-service-analysis-2026-09.json', 'utf8'));
    const counts = analysis.namedNumericThresholds.agencyCountsByPublishedThreshold;
    expect(frequentServiceStoryStats.thresholdBars).toEqual([
      { minutes: 5, agencies: counts['5'] },
      { minutes: 6, agencies: counts['6'] },
      { minutes: 7, agencies: counts['7'] },
      { minutes: 10, agencies: counts['10'] },
      { minutes: 12, agencies: counts['12'] },
      { minutes: 15, agencies: counts['15'] },
      { minutes: 20, agencies: counts['20'] },
      { minutes: 30, agencies: counts['30'] },
      { minutes: 60, agencies: counts['60'] },
    ]);
  });
});
