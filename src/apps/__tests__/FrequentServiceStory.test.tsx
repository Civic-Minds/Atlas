import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
// The story map's MapLibre worker URL is a Vite build import (?worker&url) the test runner can't load; no map is drawn here.
vi.mock('../../lib/maplibreWorker', () => ({}));
import FrequentServiceStory from '../FrequentServiceStory';
import { frequentServiceDefinitionSample, frequentServiceStoryResearchRecord, frequentServiceStoryStats } from '../../data/frequentServiceStory';
import audit from '../../../docs/research/system-map-audit-2026-09/data.json';
import recheck from '../../data/definition-recheck-2026-10-30.json';

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

  it('picks a threshold bar the split bar\'s way: it fades the other bars and highlights its name, without agency tabs', () => {
    render(<FrequentServiceStory agencies={agencies} onExploreMap={() => {}} />);
    const tenMinuteButton = screen.getByRole('button', { name: /Show examples for 10-minute service/ });
    fireEvent.click(tenMinuteButton);
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(tenMinuteButton.querySelector('[data-active="true"]')).not.toBeNull();
    const fifteen = screen.getByRole('button', { name: /Show examples for 15-minute service/ });
    expect((fifteen.querySelector('[style*="width"]') as HTMLElement).style.opacity).toBe('0.35');
  });

  it('highlights the most common threshold, 15 min, until another bar is picked (CIV-1286)', () => {
    render(<FrequentServiceStory agencies={agencies} onExploreMap={() => {}} />);
    const bar = (min: number) => screen.getByRole('button', { name: new RegExp(`Show examples for ${min}-minute service`) });
    const fill = (min: number) => (bar(min).querySelector('[style*="width"]') as HTMLElement).style.opacity;
    expect(bar(15).querySelector('[data-active="true"]')).not.toBeNull();
    expect([fill(15), fill(10)]).toEqual(['', '0.35']);
    fireEvent.mouseEnter(bar(10));
    expect([fill(10), fill(15)]).toEqual(['', '0.35']);
    fireEvent.mouseLeave(bar(10).parentElement!);
    expect(bar(15).querySelector('[data-active="true"]')).not.toBeNull();
  });

  it("says how many agencies the chart shows, from the data (Ryan's caption, 2026-11-02)", () => {
    render(<FrequentServiceStory agencies={agencies} onExploreMap={() => {}} />);
    expect(screen.getByText(`This chart shows the ${frequentServiceStoryStats.chartedAgencies} agencies that publish a specific number of minutes.`, { exact: false })).toBeInTheDocument();
  });

  it("bridges the montage and the map with Ryan's approved text, word for word (version A, 2026-11-02)", () => {
    render(<FrequentServiceStory agencies={agencies} onExploreMap={() => {}} />);
    const bridge = [...screen.getByRole('heading', { name: 'Every map tells it differently.' }).closest('section')!.querySelectorAll('p')].map(p => p.textContent!.replace(/[\u2060\u00a0\u202f]/g, m => (m === '\u2060' ? '' : ' ')));
    expect(bridge).toEqual([
      "Each agency decides what its map shows, so one map is hard to compare with the next. Toronto's Ten-Minute Network means a bus or streetcar every 10 min or better, from 6 AM to 1 AM. Vancouver and Los Angeles both draw the line at 15 minutes, but Vancouver checks it until 9 PM every day of the week, and Los Angeles only on weekdays until 6 PM. Washington, DC has two levels, one at 12 minutes and one at 20. Miami-Dade's map doesn't use the word frequent at all. It colours every route by how often the bus comes at weekday midday.",
      "The maps also differ in what they draw. Vancouver's and Portland's show only the frequent network, so a slower route isn't on the map. Toronto's, Ottawa's and Seattle's draw every route and mark the frequent ones. Seattle also counts two routes that share a street as frequent together, which none of the other maps here do.",
      "Atlas starts from the schedules instead. Here is Toronto's network, built from the TTC's own schedule data, one step at a time.",
    ]);
  });

  it('pins the story map below the sticky header at every width, through the last stage (#1310)', () => {
    const { container } = render(<FrequentServiceStory agencies={agencies} onExploreMap={() => {}} />);
    const section = container.querySelector('section[aria-labelledby="network-story-heading"]')!;
    const pinned = section.querySelector('[data-story-stage="0"]')!.parentElement!.previousElementSibling!;
    // top-16 (4rem, 56px at the site's 14px root) clears the page header (42px on phones, 53px from sm); no lg: prefix, so phones pin too.
    expect(pinned.className.split(' ')).toEqual(expect.arrayContaining(['sticky', 'top-16', 'lg:top-24']));
    expect(pinned.className).not.toContain('lg:sticky');
    // The space after the last step keeps the map pinned while the last stage is read.
    expect(section.querySelector('[data-story-stage="3"]')!.parentElement!.className).toContain('pb-[60vh]');
  });

  it('fills the phone screen under the header with the pinned map, leaving no empty band (#1310)', async () => {
    const { readFileSync } = await import('node:fs');
    const map = readFileSync('src/components/FrequentServiceStoryMap.tsx', 'utf8');
    // top-16 is 4rem: the figure below lg is the rest of the screen; from lg, top-24 with 2rem below.
    expect(map).toContain('h-[calc(100dvh-4rem)] lg:h-[calc(100dvh-8rem)]');
  });

  it('counts the Canada and US definitions that still held on the October 30 recheck (CIV-1149)', () => {
    const rows = recheck.rows.filter(row => ['Canada', 'United States'].includes(row.country) && Number.isInteger(row.threshold));
    expect(rows).toHaveLength(69);
    expect(frequentServiceStoryStats.namedNumericAgencies).toBe(63);
    expect(frequentServiceStoryStats.recheckLeftOut).toBe(6);
    expect(frequentServiceStoryStats.recheckedAgencies).toBe(69);
  });

  it('applies the tier rule: fastest multi-route frequent tier, slowest weekday daytime wait (CIV-1178)', () => {
    // CTtransit and Intercity Transit leave (one-corridor and one-route tiers); ART 10→12, CapMetro 20→15,
    // RTC 20→15, DRT 15→20, Fort McMurray 15→25 (its own 25 bar). CATS (15) and LADOT (20) join from the CIV-1258 recheck.
    expect(frequentServiceStoryStats.chartedAgencies).toBe(61);
    expect(frequentServiceStoryStats.headwayBars).toEqual([
      { minutes: 10, agencies: 3, agenciesOct11: 3 },
      { minutes: 12, agencies: 2, agenciesOct11: 3 },
      { minutes: 15, agencies: 40, agenciesOct11: 41 },
      { minutes: 20, agencies: 6, agenciesOct11: 8 },
      { minutes: 25, agencies: 1, agenciesOct11: 1 },
      { minutes: 30, agencies: 9, agenciesOct11: 9 },
    ]);
    expect(frequentServiceStoryStats.headwayBars.reduce((sum, bar) => sum + bar.agencies, 0)).toBe(61);
  });

  it('says in Method that the chart was checked again (CIV-1149)', () => {
    render(<FrequentServiceStory agencies={agencies} onExploreMap={vi.fn()} />);
    expect(screen.getByText(/Between October 30 and November 3, we opened the source again for each of the 69 agencies the chart counted\. 63 still matched and stay in the chart\. 6 are left out:/)).toBeInTheDocument();
  });

  it('uses the shared method template: Date updated, and Sources in place of Review boundary (CIV-1167)', () => {
    const { container } = render(<FrequentServiceStory agencies={agencies} onExploreMap={vi.fn()} />);
    const method = screen.getByRole('heading', { name: 'Method' }).closest('section')!;
    expect([...method.querySelectorAll('strong')].map(el => el.textContent)).toEqual(['Date conducted:', 'Date updated:', 'Sample:', 'Sources:', 'What counted:', 'How we handled numbers:', 'Rechecked:', 'Limitations:']);
    expect(method).toHaveTextContent('Date updated: November 3, 2026.');
    expect(container).not.toHaveTextContent('Review boundary');
  });

  it('credits the share picture shelter photo in Sources (CIV-1259)', () => {
    render(<FrequentServiceStory agencies={agencies} onExploreMap={vi.fn()} />);
    const method = screen.getByRole('heading', { name: 'Method' }).closest('section')!;
    expect(method).toHaveTextContent('Shelter photo: Dillan Payne, CC BY-SA 4.0, cut out and adapted.');
    expect(screen.getByRole('link', { name: 'Dillan Payne' })).toHaveAttribute('href', 'https://commons.wikimedia.org/wiki/File:TTC_Bus_Stop_on_Port_Union_Road,_April_30_2026.jpg');
    expect(screen.getByRole('link', { name: 'CC BY-SA 4.0' })).toHaveAttribute('href', 'https://creativecommons.org/licenses/by-sa/4.0/');
  });

  it('gives screen readers the chart as a table, with no visible toggle (CIV-1281)', () => {
    render(<FrequentServiceStory agencies={agencies} onExploreMap={() => {}} />);
    expect(screen.queryByText('Show as a table')).toBeNull();
    const chart = screen.getByRole('group', { name: /Interactive chart showing the number of agencies/ });
    expect(chart).toHaveAttribute('aria-details', screen.getByRole('table', { name: 'There is no single “frequent.”' }).parentElement!.id);
    expect(screen.getByRole('columnheader', { name: /^Agencies, Oct\s30$/ })).toBeInTheDocument();
  });

  it('reads the intro count and the story agency from the definitions file (CIV-87)', () => {
    expect(frequentServiceDefinitionSample).toMatchObject({ agencies: 428, blocked: 2, canada: 85, unitedStates: 343, namedNetwork: 80, withWait: 69 });
    expect(frequentServiceStoryResearchRecord).toEqual({ agencyId: 'ttc', agencyName: 'Toronto Transit Commission' });
    render(<FrequentServiceStory agencies={agencies} onExploreMap={() => {}} />);
    expect(screen.getByText(/We checked how 428 agencies define frequent service on their own websites/)).toBeInTheDocument();
    expect(screen.getByText(/at 428 agencies Atlas covers in Canada \(85\) and the United States \(343\)\. We couldn't check 2 others because their websites block automated visits\./)).toBeInTheDocument();
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
