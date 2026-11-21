import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import Studio from '../apps/studio/Studio';
import { MODE_EASE_MS } from '../components/ModeTransition';

vi.mock('../apps/studio/useDevFile', () => ({ useDevFile: (url: string) => ({ agencies: url.includes('live') ? ['ttc', 'kingston'] : ['kingston', 'hamilton'] }) }));
// Each page shows the frame key Studio hands it and the key the map last framed (CIV-1925).
vi.mock('../apps/studio/Live', async () => {
  const { useStudioMapFrame } = await import('../context/StudioMapFrame');
  const { useEffect } = await import('react');
  // Live frames its drawing on mount, as PageMapLayer does with the map.
  return { default: () => { const f = useStudioMapFrame(); useEffect(() => { f.framedMemory.current = f.frameKey; }); return <div>live panel</div>; } };
});
vi.mock('../apps/studio/Fleet', async () => {
  const { useStudioMapFrame } = await import('../context/StudioMapFrame');
  return { default: () => { const f = useStudioMapFrame(); return <div>fleet panel <span data-testid="frame">{f.frameKey}|{f.framedMemory.current ?? ''}</span></div>; } };
});

function Where() { const l = useLocation(); return <span data-testid="where">{l.pathname + l.search}</span>; }
function setup(url: string) {
  const tabs = document.createElement('div');
  document.body.appendChild(tabs);
  render(<MemoryRouter initialEntries={[url]}><Studio agencyCatalog={[]} tabsPortal={tabs} headerPortal={null} /><Where /></MemoryRouter>);
  return tabs;
}

describe('Studio mode tabs toggle their panel (#1588)', () => {
  it('clicking the active tab closes its panel, stays in Studio and keeps the agency', () => {
    const tabs = setup('/studio/live/ttc');
    expect(screen.getByText('live panel')).toBeTruthy();
    vi.useFakeTimers();
    fireEvent.click(tabs.querySelector('button[aria-pressed="true"], [aria-selected="true"], button')!);
    // It fades out the way the main map's modes leave (CIV-1921), then goes.
    expect(screen.getByText('live panel').closest('.opacity-0')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(MODE_EASE_MS); });
    vi.useRealTimers();
    expect(screen.queryByText('live panel')).toBeNull();
    const where = screen.getByTestId('where').textContent!;
    expect(where).toBe('/studio');
    // The agency is kept for the next page opened (CIV-1883).
    expect(localStorage.getItem('atlas_studio_agency')).toBe('ttc');
  });

  it('a tab opens its page again after the panel is closed', () => {
    localStorage.setItem('atlas_studio_agency', 'ttc');
    const tabs = setup('/studio');
    expect(screen.queryByText('live panel')).toBeNull();
    fireEvent.click(tabs.querySelectorAll('button')[0]);
    expect(screen.getByTestId('where').textContent).toBe('/studio/live/ttc');
  });
});

describe('Studio keeps the agency (CIV-1883)', () => {
  it('switching pages keeps the agency in the address', () => {
    localStorage.clear();
    const tabs = setup('/studio/live/kingston');
    fireEvent.click(tabs.querySelectorAll('button')[1]);
    expect(screen.getByTestId('where').textContent).toBe('/studio/fleet/kingston');
  });

  it('remembers the agency across visits', () => {
    localStorage.clear();
    setup('/studio/live/kingston');
    document.body.innerHTML = '';
    setup('/studio/live');
    expect(screen.getByTestId('where').textContent).toContain('/studio');
    expect(localStorage.getItem('atlas_studio_agency')).toBe('kingston');
  });
});

describe('Studio opens with no panel (Ryan, 2026-11-18)', () => {
  it('no page in the address shows no panel, with every tab inactive', () => {
    localStorage.clear();
    const tabs = setup('/studio');
    expect(screen.queryByText('live panel')).toBeNull();
    expect(screen.queryByText('fleet panel')).toBeNull();
    fireEvent.click(tabs.querySelectorAll('button')[0]);
    expect(screen.getByText('live panel')).toBeTruthy();
  });
});

describe('A page with no data for the agency keeps it (CIV-1883)', () => {
  it('says so and lists the page\'s agencies instead of switching', () => {
    localStorage.clear();
    setup('/studio/fleet/ttc');
    expect(screen.getByText('No data for ttc yet.')).toBeTruthy();
    expect(screen.queryByText('fleet panel')).toBeNull();
    expect(screen.getByRole('button', { name: /hamilton/i })).toBeTruthy();
    expect(screen.getByTestId('where').textContent).toBe('/studio/fleet/ttc');
  });
});

describe('Studio carries the route and keeps the map across pages (CIV-1925, CIV-1921)', () => {
  it('Live on a route opens Fleet on the same route', () => {
    localStorage.clear();
    const tabs = setup('/studio/live/kingston/501');
    fireEvent.click(tabs.querySelectorAll('button')[1]);
    expect(screen.getByTestId('where').textContent).toBe('/studio/fleet/kingston/501');
  });

  it('a page switch on an agency the map already shows needs no new framing, so the map stays put', () => {
    localStorage.clear();
    const tabs = setup('/studio/live/kingston/501');
    fireEvent.click(tabs.querySelectorAll('button')[1]);
    // Fleet's frame key is the one the map last framed: PageMapLayer leaves the map where it is.
    expect(screen.getByTestId('frame').textContent).toBe('kingston:route-501|kingston:route-501');
  });
});

describe('Studio addresses are paths (CIV-1924)', () => {
  it('an old query address opens its path and keeps the map\'s own parameters', () => {
    localStorage.clear();
    setup('/studio?page=live&agency=kingston&route=501&lat=43.6');
    expect(screen.getByTestId('where').textContent).toBe('/studio/live/kingston/501?lat=43.6');
  });

  it('an old closed-panel address opens /studio and remembers its agency', () => {
    localStorage.clear();
    setup('/studio?agency=kingston&panel=closed');
    expect(screen.getByTestId('where').textContent).toBe('/studio');
    expect(localStorage.getItem('atlas_studio_agency')).toBe('kingston');
  });
});
