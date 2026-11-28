import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { stopCardGroups } from '../components/Live/stopCardModel';
import { lateKeyLimit } from '../../shared/liveWording';
import type { RouteStripStop } from '../components/Live/routeStripModel';

// CIV-3220: the late limit's words come from one place (shared/liveWording.ts: LATE_LIMIT_TEXT, lateLimitText,
// lateKeyLimit), so an agency that publishes its own limit (the TTC, more than 5 min) shows it everywhere. The stop
// card's "5½+ min late" was typed by hand and showed Atlas's limit on the TTC.
const files = (dir: string): string[] => readdirSync(dir).flatMap(f => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? (f === '__tests__' ? [] : files(p)) : /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : [];
});
const isComment = (line: string) => /^\s*(\/\/|\*|\/\*)/.test(line) || /^[^'"`]*\/\/.*5½/.test(line);

describe('late limit words (CIV-3220)', () => {
  it('no code types the late limit by hand outside the shared wording', () => {
    const own = [...files('src'), ...files('shared')]
      .filter(p => !p.endsWith(join('shared', 'liveWording.ts')))
      .flatMap(p => readFileSync(p, 'utf8').split('\n').map((line, i) => ({ p, i, line })))
      .filter(({ line }) => /5½\+? min/.test(line) && !isComment(line))
      .map(({ p, i, line }) => `${p}:${i + 1}: ${line.trim()}`);
    // Studio's cut-off picker writes its own choices ("5½ min") through cutoffMinutesText, not the limit.
    expect(own.filter(l => !/liveCutoffs\.ts|StudioCutoffs/.test(l))).toEqual([]);
  });

  const stop: RouteStripStop = { stopId: 's', name: 'King St', delayMin: 2, lateShare: 0.12, bunchingShare: null, n: 40 };
  const vehicleLines = (window?: Parameters<typeof lateKeyLimit>[0]) => stopCardGroups(stop, null, window)[0].lines;

  it('the stop card says the agency’s own late limit where it publishes one', () => {
    expect(vehicleLines({ lateAtOrAboveMin: 5, onTimeWindowPublished: true })).toContain(`12% are ${lateKeyLimit({ lateAtOrAboveMin: 5 })} late`);
    expect(lateKeyLimit({ lateAtOrAboveMin: 5 })).toBe('5+ min');
  });
  it('and Atlas’s own limit otherwise', () => {
    expect(vehicleLines()).toContain(`12% are ${lateKeyLimit()} late`);
    expect(lateKeyLimit()).toBe('5½+ min');
  });
});
