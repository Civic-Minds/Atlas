import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import History, { type AgencyHistory } from '../History';
import { HistoryMapOverlayProvider } from '../../context/HistoryMapOverlay';

const YEARS = Array.from({ length: 11 }, (_, i) => 2015 + i);
const agency = (slug: string, name: string, region: string): AgencyHistory => ({
  slug,
  name,
  region,
  center: [-79.4, 43.7],
  routes: [
    { routeShortName: '504', routeName: 'King', snapshots: YEARS.map(year => ({ label: String(year), year, weekdayHeadwayMin: 10 })) },
    { routeShortName: '29', routeName: 'Dufferin', snapshots: YEARS.map(year => ({ label: String(year), year, weekdayHeadwayMin: 12 })) },
  ],
});
const DATA = [agency('ttc', 'Toronto Transit Commission', 'Ontario'), agency('sta', 'Spokane Transit', 'Washington')];

/** History with a stand-in for the app's top search bar, which History shares (#1015). */
function WithTopBar() {
  const [query, setQuery] = useState('');
  return (
    <>
      <input aria-label="Top search" value={query} onChange={e => setQuery(e.target.value)} />
      <History active query={query} searchFocused={false} setQuery={setQuery} />
    </>
  );
}

function renderHistory(search: string) {
  window.history.replaceState(null, '', `/apps/history${search}`);
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => DATA })));
  return render(
    <HistoryMapOverlayProvider>
      <WithTopBar />
    </HistoryMapOverlayProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

describe('History shared links', () => {
  it('opens the linked agency, route and year, and keeps them in the URL after data loads', async () => {
    renderHistory('?agency=ttc&hroute=29&year=2019');
    const scrubber = await screen.findByLabelText('History year');
    await waitFor(() => expect(scrubber).toHaveValue(String(YEARS.indexOf(2019))));
    await waitFor(() => expect(new URLSearchParams(window.location.search).get('year')).toBe('2019'));
    const sp = new URLSearchParams(window.location.search);
    expect(sp.get('agency')).toBe('ttc');
    expect(sp.get('hroute')).toBe('29');
    expect(sp.get('year')).toBe('2019');
  });

  it('restores the route search into the top search bar and filters the agency list', async () => {
    renderHistory('?agency=ttc&rq=duff');
    expect(await screen.findByDisplayValue('duff')).toBe(screen.getByLabelText('Top search'));
    expect(screen.queryByText('King')).not.toBeInTheDocument();
    await waitFor(() => expect(new URLSearchParams(window.location.search).get('rq')).toBe('duff'));
  });

  it('keeps a linked region filter through the data load', async () => {
    renderHistory('?region=Washington');
    expect(await screen.findByText('Spokane Transit')).toBeInTheDocument();
    expect(screen.queryByText('Toronto Transit Commission')).not.toBeInTheDocument();
    expect(new URLSearchParams(window.location.search).get('region')).toBe('Washington');
  });

  it('falls back to the agency chooser for an unknown agency and drops it from the URL', async () => {
    renderHistory('?agency=nope&year=2019');
    expect(await screen.findByText('Spokane Transit')).toBeInTheDocument();
    await waitFor(() => expect(window.location.search).toBe(''));
  });
});
