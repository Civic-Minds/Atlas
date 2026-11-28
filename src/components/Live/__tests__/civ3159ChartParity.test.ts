import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MIN_CHART_HOURS, miniChartBars } from '../sections/LateByHourSection';
import { studioScope } from '../tool/useLiveBody';
import { resolveLiveVehicles } from '../../../utils/liveResolveVehicles';
import { LIVE_MIN_CHART_HOUR_SHARE, LIVE_MIN_SAMPLE } from '../../../../shared/rules/live';
import { PERIOD_LABELS, SPARKLINE_HOURS } from '../../../../shared/config';
import type { LiveVehicle } from '../../../context/LiveVehiclesMapOverlay';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const hour = (h: number, n = LIVE_MIN_SAMPLE, value = 0.1) => ({ hour: h, value, n });

/** CIV-3159, critic recheck 2026-11-28: Studio's Live panel and the map's Live card, each fix guarded. */
describe('CIV-3159 Studio and map parity', () => {
  it('hides the late chart with too few measured hours, from the one shared share ("If there\'s few measurements then should we hide the chart")', () => {
    expect(MIN_CHART_HOURS).toBe(Math.ceil(SPARKLINE_HOURS.length * LIVE_MIN_CHART_HOUR_SHARE));
    const few = Array.from({ length: MIN_CHART_HOURS - 1 }, (_, i) => hour(6 + i));
    expect(miniChartBars(few)).toBeNull();
    // Thin hours don't count towards it.
    expect(miniChartBars([...few, hour(23, LIVE_MIN_SAMPLE - 1)])).toBeNull();
    expect(miniChartBars([...few, hour(23)])).not.toBeNull();
  });

  it('draws every hour with departures, as the map chart draws every hour with service: thin hours faded and capped', () => {
    const day = Array.from({ length: MIN_CHART_HOURS }, (_, i) => hour(6 + i, 200, 0.1));
    const bars = miniChartBars([...day, { hour: 1, value: 0.9, n: 4 }])!;
    // After midnight on the chart's 5am-4am axis (25), faded, and capped at the measured hours' top (10%).
    expect(bars.countByHour[25]).toBe(10);
    expect([...bars.faded]).toEqual([25]);
    expect(bars.countByHour[6]).toBe(10);
  });

  it("builds the chart from the map route card's own component, not a copy", () => {
    const src = read('src/components/Live/sections/LateByHourSection.tsx');
    const mini = src.slice(src.indexOf('function Mini('), src.indexOf('export default function LateByHourSection'));
    expect(mini).toContain('<CountSparkline');
    expect(mini).not.toMatch(/<HourSpark|<svg|<rect/);
    expect(read('src/components/Interval/HeadwaySparkline.tsx')).toMatch(/export function CountSparkline[\s\S]*?return <HeadwaySparkline /);
  });

  it('names no "both directions" in Studio\'s sections, as the map card names none ("The placement of \'both directions\' differs so much lol")', () => {
    expect(studioScope('all')).toBeUndefined();
    expect(studioScope('evening')).toBe(PERIOD_LABELS.evening);
    const body = read('src/components/Live/tool/useLiveBody.tsx');
    expect(body).toContain('scope={inStudio ? studioScope(band)');
    expect(body).toContain('scope={inStudio ? undefined : BOTH_DIRECTIONS}');
  });

  it('reads the vehicles behind the gaps through one resolver on the map card and in Studio (same route, same figures)', () => {
    const map = read('src/apps/LiveVehicles.tsx');
    const studio = read('src/apps/studio/RouteRightNow.tsx');
    expect(map).toContain('resolveLiveVehicles(');
    expect(studio).toContain('resolveLiveVehicles(');
    expect(studio).toContain('useLiveTripDirections(');
    // No second copy of the direction guess.
    expect(map).not.toContain('inferLiveDirection');
    expect(studio).not.toContain('inferLiveDirection');
  });

  it('leaves a vehicle as polled while the route shapes load', () => {
    const fc: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
    const v = { id: 'a', routeShortName: '512', lat: 43.68, lon: -79.43, directionId: 0, headsign: 'Keele' } as unknown as LiveVehicle;
    expect(resolveLiveVehicles([v], undefined)[0]).toBe(v);
    expect(resolveLiveVehicles([v], fc)[0].id).toBe('a');
  });
});
