import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import FrequentServiceStory from '../FrequentServiceStory';
import { frequentServiceStoryStats } from '../../data/frequentServiceStory';
import audit from '../../../docs/research/system-map-audit-2026-09/data.json';
import recheck from '../../../docs/research/frequent-service-research-2026-09/definition-recheck-2026-10-30.json';

const agencies = [{ slug: 'ttc', name: 'Toronto Transit Commission' }] as any;

describe('FrequentServiceStory', () => {
  it('guides readers from the research question through the verified examples', () => {
    render(<FrequentServiceStory agencies={agencies} onExploreMap={() => {}} />);
    expect(screen.getByRole('heading', { name: 'What happens when you miss the bus?' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'There is no single “frequent.”' })).toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.getByText(/at the slowest wait its source gives for weekday daytime service/)).toBeInTheDocument();
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

  it('counts the Canada and US definitions that still held on the October 30 recheck (CIV-1149)', () => {
    const rows = recheck.rows.filter(row => ['Canada', 'United States'].includes(row.country) && Number.isInteger(row.threshold));
    expect(rows).toHaveLength(67);
    expect(frequentServiceStoryStats.namedNumericAgencies).toBe(61);
    expect(frequentServiceStoryStats.recheckLeftOut).toBe(6);
    expect(frequentServiceStoryStats.recheckedAgencies).toBe(67);
    expect(frequentServiceStoryStats.headwayBars).toEqual([
      { minutes: 10, agencies: 5, agenciesOct11: 5 },
      { minutes: 12, agencies: 1, agenciesOct11: 2 },
      { minutes: 15, agencies: 40, agenciesOct11: 42 },
      { minutes: 20, agencies: 6, agenciesOct11: 9 },
      { minutes: 30, agencies: 9, agenciesOct11: 9 },
      { minutes: 60, agencies: 0, agenciesOct11: 0 },
    ]);
  });

  it('says in How we did this that the chart was checked again (CIV-1149)', () => {
    render(<FrequentServiceStory agencies={agencies} onExploreMap={vi.fn()} />);
    expect(screen.getByText(/On October 30, 2026, we opened the source again for each of the 67 agencies the chart counted\. 61 still matched and stay in the chart\. 6 are left out:/)).toBeInTheDocument();
  });

  it('uses the shared method template: Date updated, and Sources in place of Review boundary (CIV-1167)', () => {
    const { container } = render(<FrequentServiceStory agencies={agencies} onExploreMap={vi.fn()} />);
    const method = screen.getByRole('heading', { name: 'How we did this' }).closest('section')!;
    expect([...method.querySelectorAll('strong')].map(el => el.textContent)).toEqual(['Date conducted:', 'Date updated:', 'Sample:', 'Sources:', 'What counted:', 'How we handled numbers:', 'Rechecked:', 'Limitations:']);
    expect(method).toHaveTextContent('Date updated: October 30, 2026.');
    expect(container).not.toHaveTextContent('Review boundary');
  });

  it('offers the chart as a table', () => {
    render(<FrequentServiceStory agencies={agencies} onExploreMap={() => {}} />);
    expect(screen.getByText('Show as a table')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /^Agencies, Oct\s30$/ })).toBeInTheDocument();
  });

  it('does not mistake unavailable or unnamed maps for numeric definitions', () => {
    expect(audit.records).toHaveLength(317);
    expect(audit.records.filter(record => record.status === 'pending_map_review')).toHaveLength(0);
    expect(frequentServiceStoryStats.agenciesReviewed).toBe(184);
    expect(frequentServiceStoryStats.fullAuditAgencies).toBe(317);
    expect(frequentServiceStoryStats.countryCounts).toEqual([
      { country: 'Canada', agencies: 74 },
      { country: 'United States', agencies: 110 },
    ]);
    expect(frequentServiceStoryStats.categoryCounts).toMatchObject({
      numericDefinition: 47,
      qualitativeDefinition: 12,
      noDefinitionFound: 120,
      mapUnavailable: 5,
    });
  });

  it('keeps the audit canonical and unique after alias merging', () => {
    const canonicalIds = audit.records.map(record => record.canonicalAgencyId);
    expect(canonicalIds.every(Boolean)).toBe(true);
    expect(new Set(canonicalIds).size).toBe(audit.records.length);

    const verified = audit.records.filter(record =>
      record.status === 'numeric_definition_on_map' || record.status === 'qualitative_definition_on_map',
    );
    expect(verified).toHaveLength(97);
    expect(new Set(verified.map(record => record.canonicalAgencyId)).size).toBe(97);
  });

  it('keeps one audit record per Atlas agency', () => {
    const atlasSlugs = audit.records.flatMap(record => record.atlasSlugs);
    expect(new Set(atlasSlugs).size).toBe(atlasSlugs.length);
  });
});
