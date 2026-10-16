import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LiveV3 } from '../../../../shared/liveDashboard';
import RouteStrip from '../RouteStrip';
import { keyStops, pickLabels, routeStripFromV3, shortStopName, stepFor, stretchSpan, stripSummary, type RouteStripStop } from '../routeStripModel';

const stop = (i: number, over: Partial<RouteStripStop> = {}): RouteStripStop => ({
  stopId: `S${i}`, name: `Spadina Ave at Street ${i} South Side`, delayMin: i * 0.5, lateShare: 0.1, bunchingShare: 0.1 + i * 0.02, n: 500, bunchingN: 400, ...over,
});
const STOPS = Array.from({ length: 12 }, (_, i) => stop(i));

describe('stepFor', () => {
  it('uses the map delay cutoffs: up to 1 min is on time (early included), up to 3 min is a little late', () => {
    expect(stepFor('delay', -4)).toBe(0);
    expect(stepFor('delay', 1)).toBe(0);
    expect(stepFor('delay', 1.1)).toBe(1);
    expect(stepFor('delay', 3)).toBe(1);
    expect(stepFor('delay', 3.1)).toBe(2);
  });
  it('treats a missing value as not measured, never as on time', () => {
    expect(stepFor('delay', null)).toBeNull();
    expect(stepFor('bunching', null)).toBeNull();
  });
  it('bunching steps at 15% and 25%', () => {
    expect(stepFor('bunching', 0.14)).toBe(0);
    expect(stepFor('bunching', 0.2)).toBe(1);
    expect(stepFor('bunching', 0.33)).toBe(2);
  });
});

describe('shortStopName', () => {
  it('keeps the cross street, or the station or loop name', () => {
    expect(shortStopName('Spadina Ave at Queen St West South Side')).toBe('Queen St West');
    expect(shortStopName('Broadview Station at Bay 6')).toBe('Broadview Station');
    expect(shortStopName('Spadina Station Streetcar Platform')).toBe('Spadina Station');
    expect(shortStopName('Queens Quay Loop at Lower Spadina Ave')).toBe('Queens Quay Loop');
  });
});

describe('pickLabels', () => {
  const layout = (n: number, width: number) => {
    const xs = Array.from({ length: n }, (_, i) => 10 + (i * (width - 20)) / (n - 1));
    return { xs, widths: xs.map(() => 90), width };
  };
  const spans = (picked: number[], xs: number[], widths: number[], width: number) => picked.map(i => {
    const l = i === 0 ? 0 : i === xs.length - 1 ? width - widths[i] : Math.max(0, Math.min(width - widths[i], xs[i] - widths[i] / 2));
    return [l, l + widths[i]] as const;
  });
  it('always labels both terminals and the marked stretch ends', () => {
    const l = layout(40, 1000);
    const picked = pickLabels({ ...l, priority: [20, 22] });
    expect(picked).toContain(0);
    expect(picked).toContain(39);
    expect(picked).toContain(20);
  });
  it('never overlaps labels, even when stops are crowded', () => {
    for (const [n, w] of [[42, 520], [16, 480], [42, 1200], [5, 300]] as const) {
      const l = layout(n, w);
      const picked = pickLabels({ ...l, priority: [3, 4], majors: 6 });
      const s = spans(picked, l.xs, l.widths, w);
      for (let a = 0; a < s.length; a++) for (let b = a + 1; b < s.length; b++) {
        expect(s[a][1] <= s[b][0] || s[b][1] <= s[a][0]).toBe(true);
      }
    }
  });
  it('adds about 4-6 evenly spaced stops when there is room', () => {
    const picked = pickLabels({ ...layout(40, 1200), majors: 5 });
    expect(picked.length).toBeGreaterThanOrEqual(6);
    expect(picked.length).toBeLessThanOrEqual(7);
  });
});

describe('stripSummary', () => {
  it('counts stops in each step and names the stretch', () => {
    const span = stretchSpan(STOPS, { fromStopId: 'S3', toStopId: 'S5' }, 'delaysStart');
    const text = stripSummary(STOPS, 'delay', 'Southbound', span);
    expect(text).toContain('12 stops');
    expect(text).toContain('3 on time or early, 4 1–3 min late, 5 3+ min late');
    expect(text).toContain('Delays start between Spadina Ave at Street 3 South Side and Spadina Ave at Street 5 South Side');
  });
});

describe('routeStripFromV3', () => {
  const v3 = {
    directionLabels: { 0: 'Westbound', 1: 'Eastbound' },
    stops: [], buildup: [],
    bands: {
      all: {
        stops: [
          { stopId: 'X', name: 'Broadview Ave at Danforth Ave', directionId: 1, order: -1, n: 22, medianMin: -4.7, p90Min: 0, lateShare: 0, earlyShare: 0.7, ranked: false },
          { stopId: 'B', name: 'Dundas St West at Bathurst St', directionId: 1, order: 1, n: 800, medianMin: 2, p90Min: 6, lateShare: 0.2, earlyShare: 0, ranked: true },
          { stopId: 'A', name: 'DUNDAS WEST STATION AT BAY 5', directionId: 1, order: 0, n: 663, medianMin: 0, p90Min: 2, lateShare: 0.03, earlyShare: 0.07, ranked: true },
        ],
        buildup: [{ directionId: 1, kind: 'forms', forms: { fromStopId: 'A', toStopId: 'B' } }],
        adherence: {},
      },
    },
    bunching: [{ directionId: 1, bands: { all: { kind: 'gradual', forms: null, stops: [{ stopId: 'A', n: 0, badShare: 0 }, { stopId: 'B', n: 640, badShare: 0.2 }] } } }],
  } as unknown as LiveV3;

  it('orders stops, drops the off-pattern stop, and title-cases names', () => {
    const d = routeStripFromV3(v3, 1, 'all', [{ directionId: 1, stops: 1 }]);
    expect(d.stops.map(s => s.stopId)).toEqual(['A', 'B']);
    expect(d.stops[0].name).not.toBe('DUNDAS WEST STATION AT BAY 5');
    expect(d.stops[0].uncertain).toBe(true);
    expect(d.stops[1].uncertain).toBe(false);
    expect(d.delaysStart).toEqual({ fromStopId: 'A', toStopId: 'B' });
    expect(d.bunchingForms).toBeNull();
  });
  it('a stop with no gaps counted has no bunching value (not zero)', () => {
    const d = routeStripFromV3(v3, 1);
    expect(d.stops[0].bunchingShare).toBeNull();
    expect(d.stops[1].bunchingShare).toBe(0.2);
  });
});

describe('RouteStrip', () => {
  const realRect = HTMLElement.prototype.getBoundingClientRect;
  const setWidth = (w: number) => {
    HTMLElement.prototype.getBoundingClientRect = function () { return { width: w, height: 80, left: 0, top: 0, right: w, bottom: 80, x: 0, y: 0, toJSON: () => ({}) } as DOMRect; };
  };
  afterEach(() => { HTMLElement.prototype.getBoundingClientRect = realRect; vi.restoreAllMocks(); });

  it('is one focusable unit with a summary label, and arrow keys announce each stop', () => {
    setWidth(900);
    render(<RouteStrip stops={STOPS} modes={["delay"]} directionLabel="Southbound" delaysStart={{ fromStopId: 'S3', toStopId: 'S5' }} />);
    const strip = screen.getByRole('group', { name: /Typical delay, southbound/ });
    expect(strip.tabIndex).toBe(0);
    fireEvent.keyDown(strip, { key: 'ArrowRight' });
    expect(strip.textContent).toContain('Spadina Ave at Street 0 South Side');
    fireEvent.keyDown(strip, { key: 'End' });
    expect(strip.textContent).toContain('Usually 5.5 min late');
    expect(screen.getByText('Delays start')).toBeTruthy();
  });

  it('shows a legend line per track, with less exact and faded entries only when they apply', () => {
    setWidth(900);
    const { rerender } = render(<RouteStrip stops={STOPS} modes={["delay"]} directionLabel="Southbound" />);
    expect(screen.getByText('On time or early')).toBeTruthy();
    expect(screen.queryByText('Less exact')).toBeNull();
    rerender(<RouteStrip stops={[stop(0, { uncertain: true }), stop(1, { n: 12 }), ...STOPS.slice(2)]} modes={["delay"]} directionLabel="Southbound" />);
    expect(screen.getByText('Less exact')).toBeTruthy();
    expect(screen.getByText('Fewer than 30 departures or gaps')).toBeTruthy();
  });

  it('switches its colours and legend to bunching', () => {
    setWidth(900);
    render(<RouteStrip stops={STOPS} modes={["bunching"]} directionLabel="Southbound" bunchingForms={{ fromStopId: 'S6', toStopId: 'S8' }} />);
    expect(screen.getByText('Gaps too short or too long:')).toBeTruthy();
    expect(screen.getByText('Bunching forms')).toBeTruthy();
  });

  it('becomes a compact vertical line when narrow, with a switch to the full list of every stop', () => {
    setWidth(300);
    render(<RouteStrip stops={STOPS} modes={["delay"]} directionLabel="Southbound" />);
    fireEvent.click(screen.getByRole('button', { name: `Show all ${STOPS.length} stops` }));
    for (const s of STOPS) expect(screen.getAllByText(s.name).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByText(STOPS[3].name)[0]);
    expect(screen.getAllByText(/^Usually /).length).toBeGreaterThan(0);
  });

  it('draws delay on top and bunching underneath by default, each with its own legend and marker', () => {
    setWidth(900);
    render(<RouteStrip stops={STOPS} directionLabel="Southbound" delaysStart={{ fromStopId: 'S2', toStopId: 'S3' }} bunchingForms={{ fromStopId: 'S6', toStopId: 'S8' }} />);
    expect(screen.getByText('Typical delay:')).toBeTruthy();
    expect(screen.getByText('Gaps too short or too long:')).toBeTruthy();
    expect(screen.getAllByText(/^Delays start/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^Bunching forms/).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Bunching' })).toBeNull();
  });

  it('has a screen-reader table with the same figures, linked to the strip', () => {
    setWidth(900);
    render(<RouteStrip stops={STOPS} modes={["delay"]} directionLabel="Southbound" />);
    expect(screen.queryByText('Show as a table')).toBeNull();
    const table = screen.getByRole('table');
    expect(table.closest('.sr-only')?.id).toBe(document.querySelector('[aria-roledescription="route strip"]')?.getAttribute('aria-describedby'));
  });
});

describe('keyStops', () => {
  const mk = (names: string[]) => names.map((name, i) => ({ stopId: `s${i}`, name, delayMin: 0, lateShare: 0, bunchingShare: 0, n: 100 })) as RouteStripStop[];
  it('names both ends, the marked stretch and a few stations, never two neighbours', () => {
    const names = Array.from({ length: 40 }, (_, i) => (i === 21 ? 'Spadina Station' : `Stop ${i}`));
    const keys = keyStops(mk(names), { from: 30, to: 31 }, 5);
    expect(keys).toEqual(expect.arrayContaining([0, 39, 30, 31, 21]));
    expect(keys.length).toBeLessThanOrEqual(9);
    const extra = keys.filter(i => ![30, 31].includes(i));
    extra.slice(1).forEach((k, j) => expect(k - extra[j]).toBeGreaterThanOrEqual(2));
  });
  it('handles a two-stop route', () => {
    expect(keyStops(mk(['A', 'B']), null)).toEqual([0, 1]);
  });
});
