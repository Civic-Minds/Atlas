import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { addDaysYmd, checkCandidate, expiringFeedCandidates, feedIsNewer, type ExpiryCheckAgency } from '../feedExpiryCheck.js';
import { feedSetSha256 } from '../feedPeek.js';
import { stampFeedMeta } from '../refreshMeta.js';

async function zipOf(files: Record<string, string>): Promise<Buffer> {
  const zip = new JSZip();
  for (const [name, text] of Object.entries(files)) zip.file(name, text);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

const stopTimes = 'trip_id,arrival_time,departure_time,stop_id,stop_sequence\nt1,08:00:00,08:00:00,s1,1\n';
const calendar = (end: string) => `service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nwk,1,1,1,1,1,0,0,20260101,${end}\n`;
const feed = (end: string) => zipOf({ 'stop_times.txt': stopTimes, 'calendar.txt': calendar(end) });
const agency = (a: Partial<ExpiryCheckAgency> & { slug: string }): ExpiryCheckAgency => ({ feedUrl: `https://${a.slug}.example/gtfs.zip`, ...a });
const today = '20261031';
const now = new Date('2026-10-31T14:00:00Z');

describe('addDaysYmd and feedIsNewer (CIV-1223)', () => {
  it('adds days across a month and a year end', () => {
    expect(addDaysYmd('20261031', 7)).toBe('20261107');
    expect(addDaysYmd('20261228', 7)).toBe('20270104');
  });
  it('counts a feed as newer only when both dates are known and the peeked one is later', () => {
    expect(feedIsNewer('20261115', '20261107', today)).toBe(true);
    expect(feedIsNewer('20261107', '20261107', today)).toBe(false);
    expect(feedIsNewer(null, '20261107', today)).toBe(false);
    expect(feedIsNewer('20261115', null, today)).toBe(false);
  });
  it('does not count a later zip that has already ended: refresh would skip it and the check would pick it daily', () => {
    expect(feedIsNewer('20261020', '20261010', today)).toBe(false);
    expect(feedIsNewer('20261031', '20261010', today)).toBe(true);
  });
});

describe('expiringFeedCandidates (CIV-1223)', () => {
  it('picks a main feed ending within the window, a rolling feed and an ending supplemental; skips the rest', () => {
    const picked = expiringFeedCandidates([
      agency({ slug: 'ending', lastPeekedExpiry: '20261105' }),
      agency({ slug: 'far', lastPeekedExpiry: '20261221' }),
      agency({ slug: 'rolling', lastPeekedExpiry: '20261221', nextServiceDatesFeedUrls: ['https://rolling.example/next.zip'] }),
      agency({ slug: 'supp', lastPeekedExpiry: '20261221', supplementalFeedUrls: ['https://supp.example/rail.zip'], lastSupplementalFeeds: [{ url: 'https://supp.example/rail.zip', feedExpiry: '20261103' }] as never }),
      agency({ slug: 'nofeed', feedUrl: null, lastPeekedExpiry: '20261101' }),
    ], { todayYmd: today, days: 7 });
    expect(picked.map(c => [c.slug, c.reason])).toEqual([
      ['ending', 'main ends 20261105'],
      ['rolling', 'rolling feed'],
      ['supp', 'supplemental 1 ends 20261103'],
    ]);
    expect(picked[2].feeds.map(f => [f.kind, f.recorded])).toEqual([['main', '20261221'], ['supplemental', '20261103']]);
  });

  it('uses the open refresh pull request\'s later date, so an agency already refreshed there is not picked again', () => {
    const picked = expiringFeedCandidates([agency({ slug: 'ending', lastPeekedExpiry: '20261105' })], {
      todayYmd: today, days: 7, pending: [agency({ slug: 'ending', lastPeekedExpiry: '20261219' })],
    });
    expect(picked).toEqual([]);
  });

  it('skips an agency holding a timetable that has not started, on main or in the open refresh pull request (#1144)', () => {
    const ending = agency({ slug: 'held', lastPeekedExpiry: '20261105' });
    expect(expiringFeedCandidates([{ ...ending, heldFeedStart: '20261108' }], { todayYmd: today, days: 7 })).toEqual([]);
    expect(expiringFeedCandidates([ending], { todayYmd: today, days: 7, pending: [{ ...ending, heldFeedStart: '20261108' }] })).toEqual([]);
    expect(expiringFeedCandidates([ending], { todayYmd: today, days: 7 }).map(c => c.slug)).toEqual(['held']);
  });

  it('picks a held agency once its start date arrives, even when its recorded end is not near (TTC, Nov 1)', async () => {
    const ttc = agency({ slug: 'ttc', lastPeekedExpiry: '20261031' });
    const onStart = expiringFeedCandidates([ttc], { todayYmd: '20261101', days: 7, pending: [{ ...ttc, heldFeedStart: '20261101' }] });
    expect(onStart.map(c => [c.slug, c.reason])).toEqual([['ttc', 'held timetable starts 20261101; main ends 20261031']]);
    const far = agency({ slug: 'far', lastPeekedExpiry: '20261221', heldFeedStart: '20261101' });
    expect(expiringFeedCandidates([far], { todayYmd: '20261102', days: 7 }).map(c => c.reason)).toEqual(['held timetable starts 20261101']);
    expect(expiringFeedCandidates([far], { todayYmd: '20261031', days: 7 })).toEqual([]);
    const r = await checkCandidate(onStart[0], async () => feed('20261221'), new Date('2026-11-01T14:00:00Z'));
    expect(r.newer).toBe(true);
  });

  it('falls back to lastFeedExpiry when no peeked date is recorded', () => {
    const picked = expiringFeedCandidates([agency({ slug: 'old', lastFeedExpiry: '20261102' })], { todayYmd: today, days: 7 });
    expect(picked[0].feeds[0].recorded).toBe('20261102');
  });
});

describe('checkCandidate (CIV-1223)', () => {
  const candidateFor = (a: ExpiryCheckAgency) => expiringFeedCandidates([a], { todayYmd: today, days: 7 })[0];

  it('names an agency whose main feed now ends later', async () => {
    const c = candidateFor(agency({ slug: 'ending', lastPeekedExpiry: '20261105' }));
    const r = await checkCandidate(c, async () => feed('20261219'), now);
    expect(r.newer).toBe(true);
    expect(r.feeds[0].peeked).toBe('20261219');
  });

  it('does not name an agency whose feed is unchanged', async () => {
    const c = candidateFor(agency({ slug: 'ending', lastPeekedExpiry: '20261105' }));
    expect((await checkCandidate(c, async () => feed('20261105'), now)).newer).toBe(false);
  });

  it('reads the main feed through refresh\'s source choice: an empty primary zip falls back to the next source (#1251)', async () => {
    const c = candidateFor(agency({ slug: 'ttc', lastPeekedExpiry: '20261031', mdbFeedUrl: 'https://files.mobilitydatabase.org/mdb-2253/latest.zip' }));
    expect(c.feeds[0].candidates.length).toBe(2);
    const empty = await new JSZip().generateAsync({ type: 'nodebuffer' });
    const fallback = await feed('20261219');
    const r = await checkCandidate(c, async url => (url === c.feeds[0].candidates[0].url ? empty : fallback), now);
    expect(r.feeds[0].url).toBe(c.feeds[0].candidates[1].url);
    expect(r.newer).toBe(true);
  });

  it('records a download error without naming the agency', async () => {
    const c = candidateFor(agency({ slug: 'ending', lastPeekedExpiry: '20261105' }));
    const r = await checkCandidate(c, async () => { throw new Error('HTTP 503'); }, now);
    expect(r.newer).toBe(false);
    expect(r.feeds[0].error).toMatch(/503/);
  });

  it('names an agency whose supplemental feed now ends later, and rejects a supplemental that is not a zip', async () => {
    const a = agency({ slug: 'supp', lastPeekedExpiry: '20261221', supplementalFeedUrls: ['https://supp.example/rail.zip'], lastSupplementalFeeds: [{ url: 'https://supp.example/rail.zip', feedExpiry: '20261103' }] as never });
    const main = await feed('20261221');
    const newer = await checkCandidate(candidateFor(a), async url => (url.includes('rail') ? feed('20261117') : main), now);
    expect(newer.newer).toBe(true);
    const html = await checkCandidate(candidateFor(a), async url => (url.includes('rail') ? Buffer.from('<html></html>') : main), now);
    expect(html.newer).toBe(false);
    expect(html.feeds[1].error).toMatch(/not a zip/);
  });

  it('does not name an agency whose later zip has already ended', async () => {
    const c = candidateFor(agency({ slug: 'ended', lastPeekedExpiry: '20261010' }));
    const r = await checkCandidate(c, async () => feed('20261020'), now);
    expect(r.feeds[0].peeked).toBe('20261020');
    expect(r.newer).toBe(false);
  });

  it('skips the same zips the release gate refused, and names the agency again once a different zip appears', async () => {
    const refused = await feed('20261219');
    const c = candidateFor(agency({ slug: 'gated', lastPeekedExpiry: '20261105', refusedFeedSha256: feedSetSha256([refused]) }));
    const same = await checkCandidate(c, async () => refused, now);
    expect(same.newer).toBe(false);
    expect(same.refusedAgain).toBe(true);
    const different = await checkCandidate(c, async () => feed('20261220'), now);
    expect(different.newer).toBe(true);
  });

  it('hashes supplementals with the main feed, so a refused set differs from one with a new supplemental', async () => {
    const main = await feed('20261221');
    const supp = await feed('20261117');
    const a = agency({ slug: 'supp', lastPeekedExpiry: '20261221', supplementalFeedUrls: ['https://supp.example/rail.zip'], lastSupplementalFeeds: [{ url: 'https://supp.example/rail.zip', feedExpiry: '20261103' }] as never });
    const c = candidateFor({ ...a, refusedFeedSha256: feedSetSha256([main, supp]) });
    expect((await checkCandidate(c, async url => (url.includes('rail') ? supp : main), now)).newer).toBe(false);
    const newSupp = await feed('20261118');
    expect((await checkCandidate(c, async url => (url.includes('rail') ? newSupp : main), now)).newer).toBe(true);
  });

  it('uses the open refresh pull request\'s refusal record over main\'s', () => {
    const ending = agency({ slug: 'gated', lastPeekedExpiry: '20261105' });
    const picked = expiringFeedCandidates([ending], { todayYmd: today, days: 7, pending: [{ ...ending, refusedFeedSha256: 'abc' }] });
    expect(picked[0].refusedFeedSha256).toBe('abc');
  });
});

describe('refusal record (CIV-1223)', () => {
  it('is cleared once a feed is processed', () => {
    const a: Record<string, unknown> = { slug: 'gated', refusedFeedSha256: 'abc' };
    stampFeedMeta(a as never, { feedExpiry: '20261219', peekedExpiry: '20261219', feedVersion: null, peekedVersion: null, todayYmd: today } as never);
    expect(a.refusedFeedSha256).toBeUndefined();
  });
});
