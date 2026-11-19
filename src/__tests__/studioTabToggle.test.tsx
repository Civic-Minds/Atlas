import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import Studio from '../apps/studio/Studio';

vi.mock('../apps/studio/useDevFile', () => ({ useDevFile: (url: string) => ({ agencies: url.includes('live') ? ['ttc', 'kingston'] : ['kingston', 'hamilton'] }) }));
vi.mock('../apps/studio/Live', () => ({ default: () => <div>live panel</div> }));
vi.mock('../apps/studio/Fleet', () => ({ default: () => <div>fleet panel</div> }));

function Where() { const l = useLocation(); return <span data-testid="where">{l.pathname + l.search}</span>; }
function setup(url: string) {
  const tabs = document.createElement('div');
  document.body.appendChild(tabs);
  render(<MemoryRouter initialEntries={[url]}><Studio agencyCatalog={[]} tabsPortal={tabs} headerPortal={null} /><Where /></MemoryRouter>);
  return tabs;
}

describe('Studio mode tabs toggle their panel (#1588)', () => {
  it('clicking the active tab closes its panel, stays in Studio and keeps the agency', () => {
    const tabs = setup('/studio?page=live&agency=ttc');
    expect(screen.getByText('live panel')).toBeTruthy();
    fireEvent.click(tabs.querySelector('button[aria-pressed="true"], [aria-selected="true"], button')!);
    expect(screen.queryByText('live panel')).toBeNull();
    const where = screen.getByTestId('where').textContent!;
    expect(where.startsWith('/studio')).toBe(true);
    expect(where).toContain('agency=ttc');
    expect(where).toContain('panel=closed');
  });

  it('a tab opens its page again after the panel is closed', () => {
    const tabs = setup('/studio?page=live&agency=ttc&panel=closed');
    expect(screen.queryByText('live panel')).toBeNull();
    fireEvent.click(tabs.querySelectorAll('button')[0]);
    expect(screen.getByTestId('where').textContent).not.toContain('panel=closed');
  });
});

describe('Studio keeps the agency (CIV-1883)', () => {
  it('switching pages keeps the agency in the address', () => {
    localStorage.clear();
    const tabs = setup('/studio?page=live&agency=kingston');
    fireEvent.click(tabs.querySelectorAll('button')[1]);
    const where = screen.getByTestId('where').textContent!;
    expect(where).toContain('page=fleet');
    expect(where).toContain('agency=kingston');
  });

  it('remembers the agency across visits', () => {
    localStorage.clear();
    setup('/studio?page=live&agency=kingston');
    document.body.innerHTML = '';
    setup('/studio?page=live');
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
    setup('/studio?page=fleet&agency=ttc');
    expect(screen.getByText('No data for ttc yet.')).toBeTruthy();
    expect(screen.queryByText('fleet panel')).toBeNull();
    expect(screen.getByRole('button', { name: /hamilton/i })).toBeTruthy();
    expect(screen.getByTestId('where').textContent).toContain('agency=ttc');
  });
});
