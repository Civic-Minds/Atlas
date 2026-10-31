import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { addDaysYmd, checkCandidate, expiringFeedCandidates, feedIsNewer, type ExpiryCheckAgency } from '../feedExpiryCheck.js';

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
    expect(feedIsNewer('20261115', '20261107')).toBe(true);
    expect(feedIsNewer('20261107', '20261107')).toBe(false);
    expect(feedIsNewer(null, '20261107')).toBe(false);
    expect(feedIsNewer('20261115', null)).toBe(false);
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
    const newer = await checkCandidate(candidateFor(a), async url => (url.includes('supp') ? feed('20261117') : main), now);
    expect(newer.newer).toBe(true);
    const html = await checkCandidate(candidateFor(a), async url => (url.includes('supp') ? Buffer.from('<html></html>') : main), now);
    expect(html.newer).toBe(false);
    expect(html.feeds[1].error).toMatch(/not a zip/);
  });
});
