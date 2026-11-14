import { describe, expect, it } from 'vitest';
import {
  DAY_LABEL, LIVE_EXTRA_WAIT_INTRO, LIVE_NO_FREQUENT_STOP, MODE_LABEL, NEAR_YOU_TITLE, PART_TIME_ROUTES_NOUN, PART_TIME_ROUTES_SEARCH,
  PART_TIME_ROUTES_TITLE, REPORT_A_PROBLEM, SEARCH_ROUTES_PLACEHOLDER, TIME_LABEL, ZOOMED_OUT_NOTICE, liveNoAgencyAnalysis, liveNoRoute,
} from '../noticeCopy';
import { minutesText } from '../../../shared/liveFormat';
import { TRIP_TIME_LABEL } from '../../../shared/liveWording';
import { liveLinkPreview } from '../../../shared/liveLinkPreview';
import { countOf } from '../../../shared/overflowText';
import { ON_DEMAND_PILL_LABEL } from '../../utils/onDemandPill';
import { TRIP_TIME_LABEL as MAP_TRIP_TIME_LABEL } from '../../components/Interval/TripTimeStrip';
import { NETWORK_RUN_TIME_LABEL } from '../../utils/liveAgencyKpi';
import { MEASURES } from '../../components/Live/routeMapModel';
import { delayText } from '../../components/Live/routeStripModel';
import { patternLabel } from '../../components/Live/sections/runTimeRows';
import { schedText } from '../../components/Live/LiveRoutePerformance';

const plain = (s: string) => s.replace(/[  ⁠]/g, ' ').replace(/⁠/g, '');

// CIV-1160, Ryan's answers of 2026-11-13, word for word. Each shared string or formatter below is the one source for its words.
describe('CIV-1160 wording answers', () => {
  it('3: Extra wait keeps its definition', () => {
    expect(plain(LIVE_NO_FREQUENT_STOP)).toBe('No stop on this route has a vehicle every 15 min or better at this time of day.');
    expect(plain(LIVE_EXTRA_WAIT_INTRO)).toBe('How much longer riders wait than scheduled, where a vehicle is due every 15 min or better.');
  });

  it('5: Live uses the map’s shared minutes format', () => {
    expect(schedText({ scheduledMedianGapSec: 540, scheduledP10Sec: 480, scheduledP90Sec: 600 })).toBe('every 8–10 min');
    expect(minutesText(7.5)).toBe('7.5 min');
    expect(minutesText(3)).toBe('3 min');
    expect(minutesText(-0.4)).toBe('−0.4 min');
    expect(delayText(2)).toBe('2 min late');
    expect(delayText(-2)).toBe('2 min early');
    expect(delayText(0)).toBe('on time');
  });

  it('6: one name each', () => {
    expect(REPORT_A_PROBLEM).toBe('Report a problem');
    expect([PART_TIME_ROUTES_TITLE, PART_TIME_ROUTES_SEARCH, PART_TIME_ROUTES_NOUN]).toEqual(['Part-time routes', 'Search part-time routes…', 'part-time routes']);
    expect([DAY_LABEL, TIME_LABEL, MODE_LABEL]).toEqual(['Day', 'Time', 'Mode']);
    expect(TRIP_TIME_LABEL).toBe('Trip time');
    expect(MAP_TRIP_TIME_LABEL).toBe(TRIP_TIME_LABEL);
    expect(NETWORK_RUN_TIME_LABEL).toBe('Trip time vs schedule');
    expect(MEASURES.map(([, label]) => label)).toEqual(['Late', 'Trip time', 'Extra wait', 'Bunching']);
    expect(ON_DEMAND_PILL_LABEL).toBe('On-demand');
  });

  it('7: sentence case, and Live names the agency by its own short name', () => {
    expect(NEAR_YOU_TITLE).toBe('Near you');
    expect(liveLinkPreview('MiWay', '1', null).title).toBe('MiWay 1 · Live · Atlas');
    expect(liveNoRoute('109', 'MiWay')).toBe('Live has no route 109 for MiWay.');
    expect(liveNoAgencyAnalysis('MiWay')).toBe('Live has no route analysis for MiWay.');
  });

  it('8: the small fixes', () => {
    expect([countOf(1, 'match', 'matches'), countOf(1, 'stop'), countOf(1, 'day')]).toEqual(['1 match', '1 stop', '1 day']);
    expect(patternLabel('Kipling', 'Islington', 1)).toBe('Kipling → Islington · 1 stop');
    expect(ZOOMED_OUT_NOTICE).toBe('Zoomed out. Some less frequent routes are hidden.');
    expect(SEARCH_ROUTES_PLACEHOLDER).toBe('Search routes…');
  });
});
