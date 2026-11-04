import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

// A small stand-in for the built file: one current local agency, one ended one, and a stop only within 800 m.
const data = vi.hoisted(() => {
  const wait = (time: number, waitMin: number | null, agencySlug = 'rtd-denver', distanceM = 120) => ({
    arrival: { time, routeName: 'West' },
    next: waitMin === null ? null : { time: time + waitMin, agencySlug, routeName: '17', stopName: 'Gate A', distanceM },
    waitMin,
  });
  const route = (routeName: string, trips: number, within: [number, number, number], agencySlug = 'rtd-denver') => ({
    agencySlug, routeName, trips, within, stopName: 'Gate A', distanceM: 120,
  });
  type Routes = { after: ReturnType<typeof route>[]; before: ReturnType<typeof route>[] };
  const days = (waits: ReturnType<typeof wait>[], far: ReturnType<typeof wait>[] = waits, routes: Routes = { after: [], before: [] }, departures = waits.length) => {
    const day = { hubDate: '20261104', readDates: {}, waits: { 200: waits, 400: waits, 800: far }, routes: { 200: routes, 400: routes, 800: routes }, departures };
    return { Weekday: day, Saturday: day, Sunday: day };
  };
  return {
    builtFrom: '20261103',
    nearbyChoices: [200, 400, 800],
    hub: { slug: 'bustang', name: 'Bustang', feedVersion: 'v', feedExpiry: '20991231' },
    dates: { Weekday: '20261104', Saturday: '20261107', Sunday: '20261108' },
    agencies: {
      'rtd-denver': { name: 'RTD', feedVersion: 'v', feedExpiry: '20991231' },
      mountainmetro: { name: 'Mountain Metro', feedVersion: 'v', feedExpiry: '20201024' },
    },
    stops: [
      {
        id: 'den', name: 'Federal Center Station', lat: 39.72, lon: -105.13, agencies: { 200: ['rtd-denver'], 400: ['rtd-denver'], 800: ['rtd-denver'] },
        days: days([wait(525, 0), wait(720, 5)], undefined, {
          after: [route('17', 2, [2, 2, 2]), route('3', 2, [0, 1, 2]), route('W', 2, [0, 0, 0])],
          before: [route('17', 3, [0, 0, 3])],
        }, 3),
      },
      { id: 'cos', name: 'Colorado Springs Downtown Station', lat: 38.83, lon: -104.82, agencies: { 200: ['mountainmetro'], 400: ['mountainmetro'], 800: ['mountainmetro'] }, days: days([wait(580, 400, 'mountainmetro'), wait(1340, null, 'mountainmetro')]) },
      { id: 'far', name: 'Monument P & R', lat: 39.09, lon: -104.87, agencies: { 200: [], 400: [], 800: ['rtd-denver'] }, days: days([], [wait(600, 30, 'rtd-denver', 700)]) },
      // Bustang only picks riders up here: the getting-off side is empty.
      { id: 'pick', name: 'Broadway & Speer Blvd', lat: 39.73, lon: -104.99, agencies: { 200: ['rtd-denver'], 400: ['rtd-denver'], 800: ['rtd-denver'] }, days: days([], [], { after: [], before: [route('0', 4, [4, 4, 4])] }, 4) },
    ],
  };
});
vi.mock('../../data/bustangConnections.json', () => ({ default: data }));
// The map needs WebGL: a stand-in lists its dots with their colour group, and a tap picks one.
vi.mock('../../components/research/BustangStopMap', () => ({
  default: ({ points, onPick }: { points: Array<{ id: string; name: string; group: string }>; onPick: (id: string) => void }) => (
    <ul aria-label="map">{points.map(p => <li key={p.id} data-group={p.group}><button type="button" onClick={() => onPick(p.id)}>map {p.name}</button></li>)}</ul>
  ),
}));

import BustangConnectionsPage from '../BustangConnectionsPage';

const renderAt = (url = '/research/bustang-connections') => render(<MemoryRouter initialEntries={[url]}><BustangConnectionsPage /></MemoryRouter>);
const figure = (label: string) => screen.getByText(label, { selector: 'dt' }).nextElementSibling!.textContent;

describe('Bustang connections page (CIV-101)', () => {
  it('labels an ended local schedule and leaves it out of the figures', () => {
    renderAt();
    const cos = screen.getByRole('button', { name: 'Colorado Springs Downtown Station' }).closest('tr')!;
    expect(within(cos).getByText('Outdated schedule (ended Oct 24)')).toBeInTheDocument();
    // Only Federal Center counts: its 2 arrivals, none without a bus, longest 5 min (not Colorado Springs' 400).
    expect(figure('Bustang arrivals')).toBe('2');
    expect(figure('Arrivals with no local bus after')).toBe('0');
    expect(figure('Longest wait')).toBe('5 min');
    expect(screen.getByText('Current schedules only.')).toBeInTheDocument();
  });

  it('ranks worst first and uses "Typical wait"', () => {
    renderAt();
    const names = within(screen.getByRole('table', { name: 'Bustang stops, worst wait first' })).getAllByRole('button').map(b => b.textContent);
    expect(names).toEqual(['Colorado Springs Downtown Station', 'Federal Center Station', 'Broadway & Speer Blvd']);
    expect(screen.getByRole('columnheader', { name: 'Typical wait' })).toBeInTheDocument();
    expect(screen.queryByText(/median/i)).toBeNull();
  });

  it('switches between 200, 400 and 800 m, starting at 400', () => {
    renderAt();
    const pills = within(screen.getByRole('group', { name: 'Local stop within' }));
    expect(pills.getByRole('button', { name: '400 m' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'Monument P & R' })).toBeNull();
    fireEvent.click(pills.getByRole('button', { name: '800 m' }));
    expect(screen.getByRole('button', { name: 'Monument P & R' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Local agencies within 800 m' })).toBeInTheDocument();
  });

  it('shows a stop\'s arrivals in the shared time format, with the chosen row marked', () => {
    renderAt();
    fireEvent.click(screen.getByRole('button', { name: 'Federal Center Station' }));
    expect(screen.getByRole('button', { name: 'Federal Center Station' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByText('Each Bustang arrival'));
    const table = within(screen.getByRole('table', { name: 'Federal Center Station: each Bustang arrival' }));
    expect(table.getAllByRole('rowheader').map(c => c.textContent)).toEqual(['8:45 AM', '12 PM']);
    expect(table.queryByText(/:00/)).toBeNull();
  });

  it('colours each dot by its worst wait, with outdated and pick-up-only stops apart', () => {
    renderAt();
    const groups = Object.fromEntries(within(screen.getByRole('list', { name: 'map' })).getAllByRole('listitem').map(li => [li.textContent, li.dataset.group]));
    expect(groups).toEqual({ 'map Colorado Springs Downtown Station': 'outdated', 'map Federal Center Station': '15', 'map Broadway & Speer Blvd': 'pickup' });
  });

  it('opens on the worst current stop, with each route once per side in its best group', () => {
    renderAt();
    expect(screen.getByRole('heading', { level: 2, name: 'Federal Center Station' })).toBeInTheDocument();
    const off = within(screen.getByRole('region', { name: 'Getting off Bustang' }));
    const group = (side: typeof off, w: number) => side.getByRole('heading', { name: new RegExp(`^Within ${w}\\smin`) }).nextElementSibling!.textContent;
    expect(group(off, 15)).toContain('17');
    expect(group(off, 15)).toContain('2 of 2');
    expect(group(off, 30)).toContain('1 of 2');
    // An empty group is left out.
    expect(off.queryByRole('heading', { name: /^Within 60\smin/ })).toBeNull();
    expect(off.getByText(/Not within 60 min/).textContent).toBe('Not within 60 min: W');
    const on = within(screen.getByRole('region', { name: 'Catching Bustang' }));
    expect(group(on, 60)).toContain('3 of 3');
  });

  it('a tap on the map opens that stop; a pick-up-only stop says so on the getting-off side', () => {
    renderAt();
    fireEvent.click(screen.getByRole('button', { name: 'map Broadway & Speer Blvd' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Broadway & Speer Blvd' })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Getting off Bustang' })).getByText("Bustang doesn't drop riders off here this day.")).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Catching Bustang' })).getByText('4 of 4')).toBeInTheDocument();
  });

  it("labels every row when Bustang's own schedule has ended, and counts nothing as current", () => {
    data.hub.feedExpiry = '20210102';
    try {
      renderAt();
      expect(screen.getByText('Bustang: Outdated schedule (ended Jan 2)')).toBeInTheDocument();
      const den = screen.getByRole('button', { name: 'Federal Center Station' }).closest('tr')!;
      expect(within(den).getByText('Outdated schedule (ended Jan 2)')).toBeInTheDocument();
      expect(figure('Bustang arrivals')).toBe('0');
      expect(figure('Longest wait')).toBe('–');
    } finally {
      data.hub.feedExpiry = '20991231';
    }
  });
});
