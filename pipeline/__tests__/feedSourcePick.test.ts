import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';
import { pickFeedSource } from '../feedPeek.js';
import { feedZipProblem } from '../feedZipCheck.js';
import type { FeedCandidate } from '../feedSourceCandidates.js';

async function zipOf(files: Record<string, string>): Promise<Buffer> {
  const zip = new JSZip();
  for (const [name, text] of Object.entries(files)) zip.file(name, text);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

const stopTimes = 'trip_id,arrival_time,departure_time,stop_id,stop_sequence\nt1,08:00:00,08:00:00,s1,1\n';
const calendar = (end: string) => `service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nwk,1,1,1,1,1,0,0,20260101,${end}\n`;
const feed = (end: string) => zipOf({ 'stop_times.txt': stopTimes, 'calendar.txt': calendar(end) });
const candidates: FeedCandidate[] = [
  { kind: 'configured', url: 'https://primary.example/gtfs.zip' },
  { kind: 'configured', url: 'https://mdb.example/latest.zip' },
];
const pick = (byUrl: Record<string, Buffer>) => {
  const download = vi.fn(async (url: string) => byUrl[url]);
  return { download, run: () => pickFeedSource(candidates, { download, expiryToday: '20261031', log: () => {} }) };
};

describe('feedZipProblem (#1251)', () => {
  it('rejects the empty zip Toronto open data served for TTC', async () => {
    const empty = await new JSZip().generateAsync({ type: 'nodebuffer' });
    expect(empty.length).toBe(22);
    expect(await feedZipProblem(empty)).toMatch(/no stop_times\.txt/);
  });
  it('rejects a non-zip, a zip with no stop_times rows and a zip with no service dates', async () => {
    expect(await feedZipProblem(Buffer.from('<html>not found</html>'))).toMatch(/not a zip/);
    expect(await feedZipProblem(await zipOf({ 'stop_times.txt': 'trip_id,stop_id\n', 'calendar.txt': calendar('20261231') }))).toMatch(/no rows/);
    expect(await feedZipProblem(await zipOf({ 'stop_times.txt': stopTimes }))).toMatch(/no service dates/);
  });
  it('accepts a feed with stop_times rows and calendar_dates only, including in a subfolder', async () => {
    expect(await feedZipProblem(await feed('20261231'))).toBeNull();
    expect(await feedZipProblem(await zipOf({ 'gtfs/stop_times.txt': stopTimes, 'gtfs/calendar_dates.txt': 'service_id,date,exception_type\nwk,20261105,1\n' }))).toBeNull();
  });
});

describe('pickFeedSource (#1251)', () => {
  it('falls back to the next source when the primary is an empty zip', async () => {
    const { run } = pick({
      [candidates[0].url]: await new JSZip().generateAsync({ type: 'nodebuffer' }),
      [candidates[1].url]: await feed('20261219'),
    });
    const picked = await run();
    expect(picked.selectedCandidate?.url).toBe(candidates[1].url);
    expect(picked.peekedExpiry).toBe('20261219');
  });
  it('keeps a valid current primary and never downloads the fallback', async () => {
    const { run, download } = pick({ [candidates[0].url]: await feed('20261231'), [candidates[1].url]: await feed('20270301') });
    const picked = await run();
    expect(picked.selectedCandidate?.url).toBe(candidates[0].url);
    expect(download).toHaveBeenCalledTimes(1);
  });
  it('an expired primary still yields to a current fallback, as before', async () => {
    const { run } = pick({ [candidates[0].url]: await feed('20261001'), [candidates[1].url]: await feed('20261219') });
    expect((await run()).selectedCandidate?.url).toBe(candidates[1].url);
  });
  it('every source rejected: no source, with the first reason', async () => {
    const empty = await new JSZip().generateAsync({ type: 'nodebuffer' });
    const picked = await pick({ [candidates[0].url]: empty, [candidates[1].url]: empty }).run();
    expect(picked.buf).toBeNull();
    expect(picked.firstCandidateError?.message).toMatch(/no stop_times\.txt/);
  });
});
