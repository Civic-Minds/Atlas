import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runNow } from '../../shared/runClock';
import { pipelineRunDateYmd } from '../pipelineTimeZone';
import { serviceAnchor } from '../serviceDays';
import { agencyTodayYmd } from '../../shared/feedAvailability';
import { runDateCheck, sideRunDate } from '../../scripts/diff-period-figures';

// #1523: #1514's base dry run (23:40 Toronto, Nov 14) and fix run (01:42, Nov 15) read the same zips
// and still differed, because the pipeline reads "today". ATLAS_RUN_AT pins every date read.
const saved = process.env.ATLAS_RUN_AT;
afterEach(() => { if (saved == null) delete process.env.ATLAS_RUN_AT; else process.env.ATLAS_RUN_AT = saved; });

describe('one pinned run clock (#1523)', () => {
  it('is the real clock when unset', () => {
    delete process.env.ATLAS_RUN_AT;
    expect(Math.abs(runNow().getTime() - Date.now())).toBeLessThan(5000);
  });

  it('pins the run date, the service anchor and the agency date', () => {
    process.env.ATLAS_RUN_AT = '2026-11-15T04:40:00Z'; // 23:40 Toronto, Nov 14
    expect(pipelineRunDateYmd()).toBe('20261114');
    expect(serviceAnchor()).toBe('20261115');
    expect(agencyTodayYmd({ timezone: 'America/Toronto' })).toBe('20261114');
    process.env.ATLAS_RUN_AT = '2026-11-15T06:42:00Z'; // 01:42 Toronto, Nov 15
    expect(pipelineRunDateYmd()).toBe('20261115');
  });

  it('refuses a value that is not a date', () => {
    process.env.ATLAS_RUN_AT = 'tomorrow';
    expect(() => runNow()).toThrow(/ATLAS_RUN_AT/);
  });
});

describe('a comparison refuses two runs read at different dates (#1523)', () => {
  const side = (runAt?: string) => {
    const dir = mkdtempSync(join(tmpdir(), 'runclock-'));
    writeFileSync(join(dir, 'build-settings.json'), JSON.stringify(runAt ? { commit: 'x', runAt } : { commit: 'x' }));
    writeFileSync(join(dir, 'period-figures.json'), '{}');
    return join(dir, 'period-figures.json');
  };

  it('reads each side\'s run date beside its figures', () => {
    expect(sideRunDate(side('2026-11-15T04:40:00Z'))).toBe('20261114');
    expect(sideRunDate(side())).toBeNull();
  });

  it('errors when the dates differ, warns when either is unknown, passes when equal', () => {
    expect(runDateCheck('20261114', '20261115').error).toMatch(/different dates/);
    expect(runDateCheck('20261114', null).warning).toMatch(/not recorded/);
    expect(runDateCheck('20261114', '20261114')).toEqual({});
  });
});

describe('no raw clock reads on the processing path (#1523)', () => {
  // A new `new Date()` or `Date.now()` here would read the real clock past ATLAS_RUN_AT. Timestamps
  // (generatedAt) are allowed by name; anything else marks itself `// clock-ok` with a reason.
  const files = [
    'pipeline/process-core.ts', 'pipeline/transit-calendar.ts', 'pipeline/reprocess-derived-artifacts.ts',
    'pipeline/pipelineTimeZone.ts', 'pipeline/serviceDays.ts', 'pipeline/readWeek.ts', 'pipeline/agencyFeeds.ts',
    'pipeline/process-gtfs.ts', 'shared/feedAvailability.ts',
  ];
  it.each(files)('%s reads the date through runNow()', file => {
    const lines = readFileSync(resolve(import.meta.dirname, '../..', file), 'utf8').split('\n');
    const raw = lines.filter(line => /new Date\(\)|Date\.now\(\)/.test(line) && !/generatedAt|clock-ok/.test(line));
    expect(raw).toEqual([]);
  });
});
