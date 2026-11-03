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
  const days = (waits: ReturnType<typeof wait>[], far: ReturnType<typeof wait>[] = waits) => {
    const day = { hubDate: '20261104', readDates: {}, waits: { 200: waits, 400: waits, 800: far } };
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
      { id: 'den', name: 'Federal Center Station', agencies: { 200: ['rtd-denver'], 400: ['rtd-denver'], 800: ['rtd-denver'] }, days: days([wait(525, 0), wait(720, 5)]) },
      { id: 'cos', name: 'Colorado Springs Downtown Station', agencies: { 200: ['mountainmetro'], 400: ['mountainmetro'], 800: ['mountainmetro'] }, days: days([wait(580, 400, 'mountainmetro'), wait(1340, null, 'mountainmetro')]) },
      { id: 'far', name: 'Monument P & R', agencies: { 200: [], 400: [], 800: ['rtd-denver'] }, days: days([], [wait(600, 30, 'rtd-denver', 700)]) },
    ],
  };
});
vi.mock('../../data/bustangConnections.json', () => ({ default: data }));

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
    const names = screen.getAllByRole('button', { name: /Station|P & R/ }).map(b => b.textContent);
    expect(names).toEqual(['Colorado Springs Downtown Station', 'Federal Center Station']);
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
    const table = within(screen.getByRole('table', { name: 'Federal Center Station: each Bustang arrival' }));
    expect(table.getAllByRole('rowheader').map(c => c.textContent)).toEqual(['8:45 AM', '12 PM']);
    expect(table.queryByText(/:00/)).toBeNull();
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
