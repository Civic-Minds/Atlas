import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { zipContentKey } from '../feedPeek.js';
import { rawFeedDigest } from '../r2.js';

// #1423: publishers that re-zip the same files every download must read as unchanged.
async function zipOf(files: Record<string, string>, opts: { date: Date; level: number; reverse?: boolean }): Promise<Buffer> {
  const zip = new JSZip();
  const names = Object.keys(files);
  for (const name of opts.reverse ? names.reverse() : names) zip.file(name, files[name], { date: opts.date });
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: opts.level } });
}

const feed = { 'stops.txt': 'stop_id,stop_name\n1,Main St\n', 'trips.txt': 'route_id,service_id,trip_id\nA,WK,1\n' };

describe('zipContentKey', () => {
  it('is the same for a re-zipped copy with the same files', async () => {
    const a = await zipOf(feed, { date: new Date('2026-11-02T10:00:00Z'), level: 6 });
    const b = await zipOf(feed, { date: new Date('2026-11-09T10:00:00Z'), level: 9, reverse: true });
    expect(rawFeedDigest(a)).not.toBe(rawFeedDigest(b));
    expect(zipContentKey(a)).toMatch(/^[0-9a-f]{16}$/);
    expect(zipContentKey(a)).toBe(zipContentKey(b));
  });
  it('changes when one file changes', async () => {
    const date = new Date('2026-11-02T10:00:00Z');
    const a = await zipOf(feed, { date, level: 6 });
    const b = await zipOf({ ...feed, 'trips.txt': 'route_id,service_id,trip_id\nA,WE,1\n' }, { date, level: 6 });
    expect(zipContentKey(a)).not.toBe(zipContentKey(b));
  });
  it('is null for something that is not a zip', () => {
    expect(zipContentKey(Buffer.from('not a zip'))).toBeNull();
  });
});
