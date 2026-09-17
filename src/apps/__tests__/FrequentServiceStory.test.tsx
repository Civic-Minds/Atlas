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
    expect(screen.getByText(/Toronto.*Toronto Transit Commission/)).toBeInTheDocument();
    expect(screen.getByText(/Yellowknife.*Yellowknife Transit/)).toBeInTheDocument();
    expect(screen.getByText('No named definition found')).toBeInTheDocument();
    expect(screen.getByText('Agencies publishing this threshold. An agency can appear in more than one bar when it publishes multiple tiers or periods.')).toBeInTheDocument();
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
    expect(frequentServiceStoryStats.thresholdBars.slice(0, 4)).toEqual([
      { minutes: 15, agencies: counts['15'] },
      { minutes: 30, agencies: counts['30'] },
      { minutes: 10, agencies: counts['10'] },
      { minutes: 20, agencies: counts['20'] },
    ]);
  });
});
