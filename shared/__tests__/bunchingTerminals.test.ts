import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

/** The analysis script runs on import, so its terminal rules are checked in its source: only the bunching profile uses the new set. */
const src = readFileSync(new URL('../../scripts/live-segment-delay.ts', import.meta.url), 'utf8');

describe('terminal stops in the analysis (CIV-318)', () => {
  it('keeps the original terminal set (first two and last two stops of each regular pattern) for everything but bunching', () => {
    expect(src).toContain('for (const st of [...p.stops.slice(0, 2), ...p.stops.slice(-2)]) terminalStops.add(st.stopId);');
    expect(src).toContain('delayBuildup(rs, stopOrder, alongOf, stopId => terminalStops.has(stopId))');
    expect(src).toContain('!terminalStops.has(s.fromStopId) && !terminalStops.has(s.toStopId)'); // slow-stretch evidence
    expect(src).toContain('terminal: terminalStops.has(stopId)'); // stop metadata used by the stand-still evidence
  });
  it('gives the bunching profile its own set: a pattern\'s first stop, its last two, and the same stations and loops', () => {
    expect(src).toContain('bunchingProfile(stops, stopId => bunchingTerminals.has(stopId))');
    expect(src).toContain('for (const st of [p.stops[0], ...p.stops.slice(-2)]) bunchingTerminals.add(st.stopId);');
    expect(src).not.toContain('bunchingProfile(stops, stopId => terminalStops.has(stopId))');
  });
});
