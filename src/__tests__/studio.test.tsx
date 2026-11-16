import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { StudioVehicleGroup } from '../../shared/studioVehicles';

vi.mock('../components/MapApp/MapAppMap', () => ({ default: () => null }));
const flags = vi.hoisted(() => ({ studio: true }));
vi.mock('../../shared/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/config')>();
  return { ...actual, FEATURES: new Proxy(actual.FEATURES, { get: (t, k) => (k === 'studio' ? flags.studio : (t as Record<string | symbol, unknown>)[k]) }) };
});

const { default: SiteHeader } = await import('../components/SiteHeader');
const { StudioGroupFigures } = await import('../StudioVehiclesPage');
const { groupFor } = await import('../StudioPage');

describe('Studio link in the header (CIV-1694)', () => {
  it('shows with the flag on and opens /studio', () => {
    flags.studio = true;
    render(<SiteHeader />);
    expect(screen.getByRole('link', { name: 'Studio' })).toHaveAttribute('href', '/studio');
  });

  it('sits after Docs, just before Go to Atlas (CIV-1745)', () => {
    flags.studio = true;
    render(<SiteHeader />);
    const names = screen.getAllByRole('link').map(l => l.textContent?.trim() ?? '');
    const order = names.filter(n => /^(Agencies|Research|Docs|Studio)$/.test(n) || /Go to Atlas/.test(n));
    expect(order.slice(-3)).toEqual(['Docs', 'Studio', expect.stringMatching(/Go to Atlas/)]);
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

const cells = (label: string) => [...screen.getByRole('rowheader', { name: label }).closest('tr')!.querySelectorAll('th, td')].map(c => c.textContent);

describe('Studio buses-needed panel (CIV-1693, a sidebar panel since CIV-1731)', () => {
  it('gives the picked route\'s group: its routes, buses scheduled and needed, and at each target', () => {
    render(<StudioGroupFigures group={GROUPS[0]} periodLabel="Midday" />);
    expect(cells('Routes')).toEqual(['Routes', '701, 702, 801, 802']);
    expect(cells('Scheduled now')).toEqual(['Scheduled now', '7']);
    expect(cells('Needed')).toEqual(['Needed', '8']);
    expect(cells('Needed every 15 min')).toEqual(['Needed every 15 min', '10']);
    expect(cells('Running time')).toEqual(['Running time', '112 min']);
    expect(cells('Layover')).toEqual(['Layover', '29 min']);
  });

  it('shows a dash for layover where the feed has no blocks', () => {
    render(<StudioGroupFigures group={GROUPS[1]} periodLabel="Midday" />);
    expect(cells('Layover')).toEqual(['Layover', '—']);
  });

  it('says so when a time of day has no buses', () => {
    render(<StudioGroupFigures group={null} periodLabel="Midday" />);
    expect(screen.getByText('No buses at this time of day.')).toBeTruthy();
  });

  it('finds the group a route shares buses in', () => {
    const file = { slug: 'kingston', feed: 'f.zip', referenceDate: '20260917', periods: { midday: GROUPS } };
    expect(groupFor(file, '801', 'midday')!.routes).toEqual(['701', '702', '801', '802']);
    expect(groupFor(file, '801', 'evening')).toBeNull();
  });
});
