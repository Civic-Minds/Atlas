import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import Studio from '../apps/studio/Studio';

vi.mock('../apps/studio/useDevFile', () => ({ useDevFile: () => ({ agencies: ['ttc', 'kingston'] }) }));
vi.mock('../apps/studio/Live', () => ({ default: () => <div>live panel</div> }));
vi.mock('../apps/studio/Fleet', () => ({ default: () => <div>fleet panel</div> }));

function Where() { const l = useLocation(); return <span data-testid="where">{l.pathname + l.search}</span>; }
function setup(url: string) {
  const tabs = document.createElement('div');
  document.body.appendChild(tabs);
  render(<MemoryRouter initialEntries={[url]}><Studio agencyCatalog={[]} sidebarLeft={0} searchBarWidth={300} tabsPortal={tabs} headerPortal={null} /><Where /></MemoryRouter>);
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
