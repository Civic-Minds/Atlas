import { describe, expect, it } from 'vitest';
import { cloudLiveFiles, pointerFiles } from '../liveFiles';
import { STUDIO_LIVE_POINTER } from '../../scripts/studioLiveRun';

const pointer = {
  schema: 1,
  agencies: {
    hamilton: { run: 'r2', builtAt: '2026-11-23T10:00:00Z', files: ['hamilton-5780-segments.json', 'hamilton-5780-gaps.json', 'hamilton-agency.json'], thisWeekGoodDays: 5, lastWeekGoodDays: 0 },
    ttc: { run: 'r1', builtAt: '2026-11-22T10:00:00Z', files: ['ttc-504-segments.json', '../escape.json'], thisWeekGoodDays: 7, lastWeekGoodDays: 7 },
    'Bad Slug': { run: 'r1', builtAt: '', files: ['x.json'], thisWeekGoodDays: 0, lastWeekGoodDays: 0 },
  },
};

describe('the cloud source of Live files (CIV-2186)', () => {
  it('reads only the names the pointer gives, each from its agency run', () => {
    const files = pointerFiles(pointer as never);
    expect([...files.keys()].sort()).toEqual(['hamilton-5780-gaps.json', 'hamilton-5780-segments.json', 'hamilton-agency.json', 'ttc-504-segments.json']);
    expect(files.get('ttc-504-segments.json')).toEqual({ key: 'studio-live/runs/r1/ttc/ttc-504-segments.json', run: 'r1' });
  });

  it('reads the pointer once per few minutes and each file once', async () => {
    const asked: string[] = [];
    let t = 0;
    const src = cloudLiveFiles(async key => { asked.push(key); return key === STUDIO_LIVE_POINTER ? JSON.stringify(pointer) : `{"key":"${key}"}`; }, () => t);
    expect(await src.read('hamilton-agency.json')).toBe('{"key":"studio-live/runs/r2/hamilton/hamilton-agency.json"}');
    await src.read('hamilton-agency.json');
    expect(await src.read('nope.json')).toBeNull();
    expect(await src.stamp('hamilton-agency.json')).toBe('r2');
    expect(asked.filter(k => k === STUDIO_LIVE_POINTER)).toHaveLength(1);
    expect(asked.filter(k => k.endsWith('hamilton-agency.json'))).toHaveLength(1);
    t += 10 * 60_000;
    await src.list();
    expect(asked.filter(k => k === STUDIO_LIVE_POINTER)).toHaveLength(2);
  });

  it('answers as if nothing were built when the pointer cannot be read', async () => {
    const src = cloudLiveFiles(async () => { throw new Error('denied'); });
    expect(await src.list()).toEqual([]);
    expect(await src.read('ttc-504-segments.json')).toBeNull();
  });
});
