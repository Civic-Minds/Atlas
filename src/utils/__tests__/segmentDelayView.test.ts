import { describe, expect, it } from 'vitest';
import { halfMinutes, halfMinutesDown, stopNameParts, tidyStopName, usableStandingStill, SEGMENT_BAND_OPTIONS, type SegmentDelayData } from '../segmentDelayView';


describe('segmentDelayView', () => {
  it('rounds to half minutes', () => {
    expect(halfMinutes(44)).toBe(0.5);
    expect(halfMinutes(46)).toBe(1);
    expect(halfMinutesDown(75)).toBe(1);
  });



  it('shortens stop names one way everywhere', () => {
    expect(stopNameParts('King St West at Spadina Ave West Side')).toEqual({ street: 'King St', cross: 'Spadina', short: 'King & Spadina' });
    expect(stopNameParts('RONCESVALLES AVE AT QUEEN ST WEST')).toEqual({ street: 'Roncesvalles Ave', cross: 'Queen', short: 'Roncesvalles & Queen' });
    expect(stopNameParts('King St West at Simcoe St - St. Andrew Stn').cross).toBe('Simcoe');
    expect(stopNameParts('Distillery Loop').short).toBe('Distillery Loop');
    expect(stopNameParts('Bathurst St at Dundas St West  - Toronto Western Hospital').cross).toBe('Dundas');
    expect(stopNameParts('Queens Quay West at Bathurst St East Side Billy Bishop Airpo').cross).toBe('Bathurst');
    expect(stopNameParts('Broadview Ave at Langley Ave-Bridgepoint Health Ctr').cross).toBe('Langley');
    expect(stopNameParts('King St West at University Ave East Side - St Andrew Stn').cross).toBe('University');
  });

  it('title-cases all-caps stop names', () => {
    expect(tidyStopName('RONCESVALLES AVE AT QUEEN ST WEST')).toBe('Roncesvalles Ave at Queen St West');
    expect(tidyStopName('King St West at Bay St')).toBe('King St West at Bay St');
  });

  it('shows stood-still stops only with enough events and days, never at planned turn-backs, terminals or carhouses', () => {
    const still = (id: string, events: number, days: number, extra: object = {}) => ({
      stopId: id, stopName: id, directionId: 0, coordinates: [] as [number, number][], bands: { all: { events, days, medianSec: 150, totalMin: 40 } }, ...extra,
    });
    const data: SegmentDelayData = {
      agency: 'ttc', route: '504', generatedAt: '', dates: Array(15).fill('d'), observations: 0, segments: [],
      v2: { standingStill: [
        still('sumach', 54, 15), still('few', 9, 9), still('fewdays', 30, 4),
        still('broadview-queen', 40, 12, { scheduledTurnback: true }), still('loop', 99, 15, { terminal: true }),
        still('carhouse', 60, 14, { nearCarhouse: true }),
      ] },
    };
    expect(usableStandingStill(data, 'all').map(x => x.stop.stopId)).toEqual(['sumach']);
  });

  it('band chips use Atlas\'s period names', () => {
    expect(SEGMENT_BAND_OPTIONS.map(o => o.label)).toEqual(['All day', 'AM Peak', 'Midday', 'PM Peak', 'Evening']);
  });
});
