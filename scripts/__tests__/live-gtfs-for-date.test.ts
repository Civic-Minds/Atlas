import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { archiveTripIds, matchShare, tripsTxtIds } from '../live-gtfs-for-date';

describe('live-gtfs-for-date guard', () => {
  it('collects trip ids from every route file of the date only', () => {
    const dir = mkdtempSync(join(tmpdir(), 'live-gtfs-'));
    writeFileSync(join(dir, '504-2026-10-14.jsonl'), [JSON.stringify({ ts: 1, v: [['a', 't1', 0, 0, 1], ['b', 't2', 0, 0, 1]] }), JSON.stringify({ ts: 2, v: [] })].join('\n'));
    writeFileSync(join(dir, '511-2026-10-14.jsonl'), JSON.stringify({ ts: 1, v: [['c', 't3', 0, 0, 1], ['d', null, 0, 0, 1]] }));
    writeFileSync(join(dir, '504-2026-10-13.jsonl'), JSON.stringify({ ts: 1, v: [['a', 'old', 0, 0, 1]] }));
    expect([...archiveTripIds(dir, '2026-10-14')].sort()).toEqual(['t1', 't2', 't3']);
  });
  it('reads trip_id wherever the column is', () => {
    expect([...tripsTxtIds('route_id,service_id,trip_id,trip_headsign\n10,1,t2,"East, x"\n')]).toEqual(['t2']);
    expect([...tripsTxtIds('﻿trip_id,route_id\r\n"t1",10\r\n')]).toEqual(['t1']);
  });
  it('gives the share of live ids found in the timetable', () => {
    expect(matchShare(new Set(['a', 'b', 'c', 'd']), new Set(['a', 'b', 'c']))).toEqual({ matched: 3, total: 4, share: 0.75 });
  });
});
