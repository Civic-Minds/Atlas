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
const { StudioGroupFigures, STUDIO_AGENCIES, studioAgencyFrom } = await import('../StudioVehiclesPage');
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

  it('offers the map’s public scale, 10 to 60, for every group', () => {
    render(<StudioGroupFigures group={GROUPS[0]} periodLabel="Midday" />);
    const targets = screen.getAllByRole('rowheader').map(c => c.textContent).filter(t => t?.startsWith('Needed every'));
    expect(targets).toEqual([10, 15, 20, 30, 60].map(m => `Needed every ${m} min`));
    expect(cells('Needed every 60 min')).toEqual(['Needed every 60 min', '—']);
  });

  it('never shows rail’s internal 5 or 8, even from an older file that has them', () => {
    const old = { ...GROUPS[1], targets: [5, 8, 10, 15, 30, 60], atTarget: { 5: 20, 8: 13, 10: 12 } } as StudioVehicleGroup;
    render(<StudioGroupFigures group={old} periodLabel="Midday" />);
    expect(screen.queryByRole('rowheader', { name: 'Needed every 5 min' })).toBeNull();
    expect(screen.queryByRole('rowheader', { name: 'Needed every 8 min' })).toBeNull();
    expect(cells('Needed every 10 min')).toEqual(['Needed every 10 min', '12']);
    expect(cells('Needed every 20 min')).toEqual(['Needed every 20 min', '—']);
  });

  it('shows a dash for layover where the feed has no blocks', () => {
    render(<StudioGroupFigures group={GROUPS[1]} periodLabel="Midday" />);
    expect(cells('Layover')).toEqual(['Layover', '—']);
  });

  it('lets the planner split a shared middle’s trips evenly among branches, the current mix first (CIV-1712)', () => {
    const branched = { ...GROUPS[0], atTargetEven: { 10: 17, 15: 11, 20: 9, 30: 6 } };
    const onSplit = vi.fn();
    const { rerender } = render(<StudioGroupFigures group={branched} periodLabel="Midday" onSplit={onSplit} />);
    const choice = screen.getByRole('group', { name: 'Trips on branches' });
    expect(cells('Needed every 10 min')).toEqual(['Needed every 10 min', '15']);
    screen.getByRole('button', { name: 'Split evenly' }).click();
    expect(onSplit).toHaveBeenCalledWith('even');
    rerender(<StudioGroupFigures group={branched} periodLabel="Midday" split="even" onSplit={onSplit} />);
    expect(cells('Needed every 10 min')).toEqual(['Needed every 10 min', '17']);
    expect(choice).toBeTruthy();
  });

  it('offers no choice for a group without branches', () => {
    render(<StudioGroupFigures group={GROUPS[1]} periodLabel="Midday" onSplit={() => {}} />);
    expect(screen.queryByRole('group', { name: 'Trips on branches' })).toBeNull();
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

describe('Studio agencies (CIV-1806)', () => {
  it('opens the agency the address names, when Studio has it, and Kingston otherwise', () => {
    expect(STUDIO_AGENCIES).toEqual(['kingston', 'hamilton', 'rtd-denver']);
    expect(studioAgencyFrom('hamilton')).toBe('hamilton');
    expect(studioAgencyFrom(null)).toBe('kingston');
    expect(studioAgencyFrom('ttc')).toBe('kingston');
  });
});
