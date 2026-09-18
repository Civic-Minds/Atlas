import fs from 'node:fs';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import FrequentServiceStory from '../FrequentServiceStory';
import { frequentServiceStoryStats } from '../../data/frequentServiceStory';

describe('FrequentServiceStory', () => {
  it('guides readers from the research question through the featured examples', () => {
    render(<FrequentServiceStory onExploreMap={() => {}} />);

    expect(screen.getByRole('heading', { name: 'What does “frequent” actually mean?' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'There is no single “frequent.”' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Vancouver' })).toBeInTheDocument();
    expect(screen.getByText('TransLink Vancouver')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Winnipeg' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Nanaimo' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Asheville' })).toBeInTheDocument();
    expect(screen.getByText(/Each agency appears once/)).toBeInTheDocument();
  });

  it('hands readers off to the existing map', () => {
    const onExploreMap = vi.fn();
    render(<FrequentServiceStory onExploreMap={onExploreMap} />);

    fireEvent.click(screen.getByRole('button', { name: /Find your city/i }));
    expect(onExploreMap).toHaveBeenCalledOnce();
  });

  it('changes the examples when a chart threshold is selected', () => {
    render(<FrequentServiceStory onExploreMap={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /Show examples for 30-minute service/ }));

    fireEvent.click(screen.getByRole('tab', { name: 'Yellowknife' }));

    expect(screen.getByRole('tab', { name: 'Yellowknife' })).toBeInTheDocument();
    expect(screen.getByText('Yellowknife Transit')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Nanaimo' })).toBeInTheDocument();
  });

  it('keeps the story chart aligned with the generated research analysis', () => {
    const analysis = JSON.parse(fs.readFileSync('docs/research/frequent-service-analysis-2026-09.json', 'utf8'));
    const counts = analysis.namedNumericThresholds.agencyCountsByStoryThreshold;
    expect(frequentServiceStoryStats.headwayBars).toEqual([
      { minutes: 10, agencies: counts['10'] },
      { minutes: 12, agencies: counts['12'] },
      { minutes: 15, agencies: counts['15'] },
      { minutes: 20, agencies: counts['20'] },
      { minutes: 30, agencies: counts['30'] },
    ]);
  });

  it('does not mistake generic slower service standards for named frequent definitions', () => {
    const analysis = JSON.parse(fs.readFileSync('docs/research/frequent-service-analysis-2026-09.json', 'utf8'));
    const ddot = analysis.agencies.find((agency: { agencyId: string }) => agency.agencyId === 'ddot');
    const barta = analysis.agencies.find((agency: { agencyId: string }) => agency.agencyId === 'barta');

    expect(ddot.evidence.some((evidence: { namedFrequency: boolean }) => evidence.namedFrequency)).toBe(false);
    expect(barta.evidence.some((evidence: { namedFrequency: boolean }) => evidence.namedFrequency)).toBe(false);
    expect(analysis.namedNumericThresholds.agencyCountsByStoryThreshold).toEqual({
      10: 4,
      12: 2,
      15: 52,
      20: 11,
      30: 18,
    });
    expect(analysis.agencies.find((agency: { agencyId: string }) => agency.agencyId === 'davenport').evidence.some((evidence: { namedFrequency: boolean }) => evidence.namedFrequency)).toBe(false);
  });
});
