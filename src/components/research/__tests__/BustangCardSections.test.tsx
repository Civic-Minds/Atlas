import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BustangRouteDepartures, BustangStopConnections } from '../BustangCardSections';
import { bustangStopFor, type BustangData } from '../../../utils/bustangConnections';

// A small stand-in for the built file: two stops, one current local agency and one ended one, one West trip.
const route = (routeName: string, trips: number, within: [number, number, number], agencySlug = 'rtd-denver') => ({
  agencySlug, routeName, trips, within, stopName: 'Gate A', distanceM: 120,
});
const stopDay = (after = [route('17', 4, [3, 4, 4]), route('W', 4, [0, 1, 2]), route('99', 4, [0, 0, 0])]) => {
  const routes = { after, before: [route('3', 4, [0, 0, 2])] };
  const day = { hubDate: '20261104', readDates: {}, arrivals: 4, departures: 4, routes: { 200: routes, 400: routes, 800: routes } };
  return { Weekday: day, Saturday: day, Sunday: { ...day, arrivals: 0 } };
};
const data: BustangData = {
  builtFrom: '20261103',
  hub: { slug: 'bustang', name: 'Bustang', feedVersion: 'v', feedExpiry: '20991231' },
  dates: { Weekday: '20261104', Saturday: '20261107', Sunday: '20261108' },
  agencies: {
    'rtd-denver': { name: 'RTD', feedVersion: 'v', feedExpiry: '20991231' },
    mountainmetro: { name: 'Mountain Metro', feedVersion: 'v', feedExpiry: '20201024' },
  },
  stops: [
    { id: 'S', stopIds: ['34316', '34323'], name: 'Union Station', lat: 39.753, lon: -105.0, agencies: { 200: ['rtd-denver'], 400: ['rtd-denver'], 800: ['rtd-denver'] }, days: stopDay() },
    { id: 'C', stopIds: ['9'], name: 'Colorado Springs Downtown Station', lat: 38.83, lon: -104.82, agencies: { 200: [], 400: ['mountainmetro'], 800: ['mountainmetro', 'rtd-denver'] }, days: stopDay([route('4', 4, [1, 1, 1], 'mountainmetro')]) },
  ],
  routes: [['rtd-denver', '17'], ['rtd-denver', 'W'], ['mountainmetro', '4']],
  trips: {
    Weekday: [{
      id: 'T1', routeId: 'WEST', routeName: 'West', headsign: 'Grand Junction',
      stops: [
        { stop: 0, arrival: 525, departure: 525, after: null, before: [[0, null, 5, 5], [1, null, null, 40]] },
        { stop: 1, arrival: 600, departure: 602, after: [[2, null, 12, 12]], before: [] },
      ],
    }],
    Saturday: [],
    Sunday: [],
  },
};

describe('Bustang route card departures (CIV-101)', () => {
  it('lists the departures by destination; picking one shows each stop with its local routes and waits', () => {
    render(<BustangRouteDepartures data={data} day="Weekday" within={400} routeId="WEST" />);
    expect(screen.getByText('Union Station to Grand Junction')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '8:45 AM' }));
    expect(screen.getByText('Union Station')).toBeTruthy();
    expect(screen.getByText('Leaves 8:45 AM')).toBeTruthy();
    // Route 17 is 5 min away within 400 m; W only reaches within 800 m, so it is left out at 400.
    expect(screen.getByText('17')).toBeTruthy();
    expect(screen.queryByText('W')).toBeNull();
    expect(screen.getByText('Arrives 10 AM, leaves 10:02 AM')).toBeTruthy();
    // An ended schedule is labelled, never shown as current.
    expect(screen.getByText(/Mountain Metro: Outdated schedule \(ended Oct 24\)/)).toBeTruthy();
  });

  it('reads 800 m waits when 800 m is chosen, and says when there are no trips', () => {
    render(<BustangRouteDepartures data={data} day="Weekday" within={800} routeId="WEST" />);
    fireEvent.click(screen.getByRole('button', { name: '8:45 AM' }));
    expect(screen.getByText('W')).toBeTruthy();
    render(<BustangRouteDepartures data={data} day="Saturday" within={400} routeId="WEST" />);
    expect(screen.getByText('No Bustang trips this day.')).toBeTruthy();
  });
});

describe('Bustang stop card section (CIV-101)', () => {
  it('places each route once in its best group with its count, and lists the rest', () => {
    render(<BustangStopConnections data={data} day="Weekday" within={400} stop={data.stops[0]} />);
    expect(screen.getByText('Getting off Bustang')).toBeTruthy();
    expect(screen.getByText('3 of 4')).toBeTruthy(); // 17 within 15 min
    expect(screen.getByText('1 of 4')).toBeTruthy(); // W within 30 min
    expect(screen.getByText(/Not within 60 min/)).toBeTruthy(); // 99
    expect(screen.getByText('2 of 4')).toBeTruthy(); // catching: 3 within 60 min
  });

  it('says when Bustang drops nobody off that day, and when no other agency is near', () => {
    render(<BustangStopConnections data={data} day="Sunday" within={400} stop={data.stops[0]} />);
    expect(screen.getByText('Bustang drops nobody off here this day.')).toBeTruthy();
    render(<BustangStopConnections data={data} day="Weekday" within={200} stop={data.stops[1]} />);
    expect(screen.getByText("No local stop within 200 m.")).toBeTruthy();
  });
});

describe('finding the Bustang stop for a picked map stop', () => {
  it("matches one of the group's stop ids, or a Bustang stop within 150 m", () => {
    expect(bustangStopFor(data, { agencySlug: 'bustang', stopId: '34323' })?.name).toBe('Union Station');
    expect(bustangStopFor(data, { siblingIdsByAgency: { bustang: new Set(['x']) }, lat: 39.7535, lon: -105.0 })?.name).toBe('Union Station');
    // A local agency's stop with no Bustang stop grouped with it shows nothing.
    expect(bustangStopFor(data, { agencySlug: 'rtd-denver', stopId: '34323', siblingIdsByAgency: { 'rtd-denver': new Set(['34323']) } })).toBeNull();
  });
});
