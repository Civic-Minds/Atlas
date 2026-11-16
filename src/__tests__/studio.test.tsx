import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { StudioVehicleGroup } from '../../shared/studioVehicles';

const flags = vi.hoisted(() => ({ studio: true }));
vi.mock('../../shared/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/config')>();
  return { ...actual, FEATURES: new Proxy(actual.FEATURES, { get: (t, k) => (k === 'studio' ? flags.studio : (t as Record<string | symbol, unknown>)[k]) }) };
});

const { default: SiteHeader } = await import('../components/SiteHeader');
const { StudioGroupTable } = await import('../StudioVehiclesPage');

describe('Studio link in the header (CIV-1694)', () => {
  it('shows with the flag on and opens /studio', () => {
    flags.studio = true;
    render(<SiteHeader />);
    expect(screen.getByRole('link', { name: 'Studio' })).toHaveAttribute('href', '/studio');
  });

  it('is not there with the flag off', () => {
    flags.studio = false;
    render(<SiteHeader />);
    expect(screen.queryByRole('link', { name: 'Studio' })).toBeNull();
    flags.studio = true;
  });
});

const GROUPS: StudioVehicleGroup[] = [
  { routes: ['701', '702', '801', '802'], scheduled: 7, implied: 8, runningMin: 112, layoverMin: 29, atTarget: { 10: 15, 15: 10, 20: 8, 30: 5 } },
  { routes: ['11', '13'], scheduled: 2, implied: 2, runningMin: 113, layoverMin: null, atTarget: { 10: 12, 15: 8, 20: 6, 30: 4 } },
];

describe('Studio buses-needed table (CIV-1693)', () => {
  it('draws one row per route group with its member routes and figures', () => {
    render(<StudioGroupTable groups={GROUPS} target="schedule" />);
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    const first = [...rows[0].querySelectorAll('th, td')].map(c => c.textContent);
    expect(first).toEqual(['701, 702, 801, 802', '7', '8', '112 min', '29 min']);
    expect([...rows[1].querySelectorAll('th, td')].at(-1)?.textContent).toBe('—');
    expect(screen.queryByRole('columnheader', { name: /Needed every/ })).toBeNull();
  });

  it('adds the buses needed at a target headway', () => {
    render(<StudioGroupTable groups={GROUPS} target={15} />);
    expect(screen.getByRole('columnheader', { name: 'Needed every 15 min' })).toBeTruthy();
    const rows = screen.getAllByRole('row').slice(1);
    expect([...rows[0].querySelectorAll('th, td')].map(c => c.textContent)).toContain('10');
  });

  it('says so when a time of day has no buses', () => {
    render(<StudioGroupTable groups={[]} target="schedule" />);
    expect(screen.getByText('No buses at this time of day.')).toBeTruthy();
  });
});
