import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';
import {
  MAX_AGENCIES_PER_RUN,
  MAX_COMMENT_CHARS,
  MAX_REDIRECTS,
  MAX_REQUESTS_PER_AGENCY,
  MAX_RUN_MINUTES,
  MAX_SEARCHES_PER_AGENCY,
  MAX_UNZIPPED_ENTRY_BYTES,
  MAX_URL_LENGTH,
  checkLink,
  createClaudeAsk,
  expiredAgencies,
  findForAgency,
  formatComment,
  hasFinderCommentThisWeek,
  inspectGtfsZip,
  isKnownFeedUrl,
  parseFinderAnswer,
  rotateForWeek,
  runLinkFinder,
  weekIndex,
  type AskModel,
  type FetchLike,
  type FinderAgency,
  type GhRunner,
} from './find-expired-feed-links';

// CIV-1360. No network here: the model, fetch and the GitHub CLI are all fakes.

const TODAY = '20261109';

const finderAgency = (extra: Partial<FinderAgency> = {}): FinderAgency => ({
  slug: 'moose-jaw',
  name: 'Moose Jaw Transit',
  region: 'Saskatchewan',
  expiredOn: '2024-03-31',
  websiteUrl: 'https://moosejaw.ca',
  knownFeedUrls: ['https://moosejaw.ca/old/GTFS.zip'],
  ...extra,
});

const indexAgency = (slug: string, lastFeedExpiry: string, extra: Record<string, unknown> = {}) =>
  ({ slug, name: slug.toUpperCase(), region: 'Somewhere', lastFeedExpiry, lastRefreshedAt: '2026-08-07', feedUrl: `https://${slug}.example.org/gtfs.zip`, ...extra });

async function gtfsZip(files: Record<string, string>): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const [name, text] of Object.entries(files)) zip.file(name, text);
  return zip.generateAsync({ type: 'uint8array' });
}

const gtfsFiles = (endDate: string) => ({
  'routes.txt': 'route_id\n1\n',
  'stops.txt': 'stop_id\n1\n',
  'trips.txt': 'trip_id\n1\n',
  'calendar.txt': `service_id,start_date,end_date\nwk,20260101,${endDate}\n`,
});

const respond = (body: BodyInit | Uint8Array | null, init: ResponseInit = {}): FetchLike => async () => new Response(body as BodyInit | null, init);

/** A fake GitHub CLI: one open issue (or none), with the given comments. Records what is posted. */
function fakeGh(options: { issue?: number | null; comments?: string[] } = {}) {
  const posted: string[] = [];
  const calls: string[][] = [];
  const gh: GhRunner = (args, input) => {
    calls.push(args);
    if (args[1] === 'list') {
      return JSON.stringify(options.issue === null ? [] : [
        { number: 9, title: 'Agencies on expired timetables: old copy' },
        { number: options.issue ?? 612, title: 'Agencies on expired timetables' },
      ]);
    }
    if (args[1] === 'view') return JSON.stringify({ comments: (options.comments ?? []).map(body => ({ body })) });
    if (args[1] === 'comment') { posted.push(input ?? ''); return ''; }
    throw new Error(`unexpected gh call: ${args.join(' ')}`);
  };
  return { gh, posted, calls };
}

describe('parsing the model answer', () => {
  it('accepts the three outcomes', () => {
    expect(parseFinderAnswer({ outcome: 'link_found', link_url: 'https://moosejaw.ca/new/GTFS.zip', source_page_url: 'https://moosejaw.ca/transit' }))
      .toEqual({ outcome: 'link_found', linkUrl: 'https://moosejaw.ca/new/GTFS.zip', sourcePageUrl: 'https://moosejaw.ca/transit' });
    expect(parseFinderAnswer({ outcome: 'service_ended', link_url: null, source_page_url: 'https://moosejaw.ca/news/transit-ends' }))
      .toEqual({ outcome: 'service_ended', sourcePageUrl: 'https://moosejaw.ca/news/transit-ends' });
    expect(parseFinderAnswer({ outcome: 'nothing_found', link_url: null, source_page_url: null })).toEqual({ outcome: 'nothing_found' });
  });

  it('rejects answers that do not fit', () => {
    for (const bad of [
      null,
      'link_found',
      { outcome: 'maybe', link_url: null, source_page_url: null },
      { outcome: 'link_found', link_url: null, source_page_url: 'https://moosejaw.ca/transit' },
      { outcome: 'link_found', link_url: 'https://moosejaw.ca/GTFS.zip', source_page_url: null },
      { outcome: 'service_ended', link_url: null, source_page_url: 'not a link' },
      { outcome: 'link_found', link_url: 'ftp://moosejaw.ca/GTFS.zip', source_page_url: 'https://moosejaw.ca' },
      // Links the script would fetch must be public host names.
      { outcome: 'link_found', link_url: 'http://169.254.169.254/latest', source_page_url: 'https://moosejaw.ca' },
      { outcome: 'link_found', link_url: 'http://localhost/GTFS.zip', source_page_url: 'https://moosejaw.ca' },
    ]) {
      expect(parseFinderAnswer(bad)).toBeNull();
    }
  });

  it('rejects a suggested link or source page longer than the length cap', () => {
    const long = `https://moosejaw.ca/${'a'.repeat(MAX_URL_LENGTH)}`;
    const fits = `https://moosejaw.ca/${'a'.repeat(MAX_URL_LENGTH - 'https://moosejaw.ca/'.length)}`;
    expect(fits).toHaveLength(MAX_URL_LENGTH);
    expect(parseFinderAnswer({ outcome: 'link_found', link_url: fits, source_page_url: fits })).not.toBeNull();
    expect(parseFinderAnswer({ outcome: 'link_found', link_url: long, source_page_url: 'https://moosejaw.ca/transit' })).toBeNull();
    expect(parseFinderAnswer({ outcome: 'link_found', link_url: 'https://moosejaw.ca/GTFS.zip', source_page_url: long })).toBeNull();
    expect(parseFinderAnswer({ outcome: 'service_ended', link_url: null, source_page_url: long })).toBeNull();
  });
});

describe('checking a suggested link', () => {
  it('passes a GTFS zip and reports how long its timetable runs', async () => {
    const zip = await gtfsZip(gtfsFiles('20270301'));
    expect(await checkLink('https://moosejaw.ca/new/GTFS.zip', respond(zip), TODAY))
      .toEqual({ verified: true, detail: 'a GTFS zip, timetable runs to 2027-03-01' });
  });

  it('marks a zip unverified when its timetable has also expired, or it holds no timetable files', async () => {
    const expired = await checkLink('https://moosejaw.ca/GTFS.zip', respond(await gtfsZip(gtfsFiles('20240331'))), TODAY);
    expect(expired).toEqual({ verified: false, detail: 'a GTFS zip, but its timetable also ended on 2024-03-31' });
    const other = await checkLink('https://moosejaw.ca/photos.zip', respond(await gtfsZip({ 'readme.txt': 'hello' })), TODAY);
    expect(other).toEqual({ verified: false, detail: 'a zip file without timetable files' });
  });

  it('marks a link unverified when it fails, errors, or claims to be a zip but is not', async () => {
    expect(await checkLink('https://moosejaw.ca/GTFS.zip', async () => { throw new Error('ENOTFOUND'); }, TODAY))
      .toEqual({ verified: false, detail: 'the link did not respond' });
    expect(await checkLink('https://moosejaw.ca/GTFS.zip', respond('gone', { status: 404 }), TODAY))
      .toEqual({ verified: false, detail: 'the link answered with HTTP 404' });
    expect(await checkLink('https://moosejaw.ca/GTFS.zip', respond('<html>Not found</html>', { headers: { 'content-type': 'text/html' } }), TODAY))
      .toEqual({ verified: false, detail: 'the link is not a zip file' });
  });

  it('accepts a page that opens, and says it is not a zip', async () => {
    expect(await checkLink('https://data.moosejaw.ca/dataset/transit', respond('<html>Transit data</html>', { headers: { 'content-type': 'text/html' } }), TODAY))
      .toEqual({ verified: true, detail: 'the link opens, but it is a web page, not a zip' });
  });

  it('does not download a zip over the size cap', async () => {
    let pulled = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...new Array(1020).fill(0)]));
      },
    });
    const check = await checkLink('https://moosejaw.ca/huge.zip', respond(body, { headers: { 'content-length': String(900 * 1024 * 1024) } }), TODAY);
    expect(check).toEqual({ verified: false, detail: 'a zip file, too large to open here' });
    expect(pulled).toBeLessThan(5);
  });

  it('marks a zip unverified when the download itself runs past the size cap', async () => {
    // No content-length, so the size is only known once the cap is hit mid-download.
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        const chunk = new Uint8Array(1024 * 1024);
        if (sent === 0) chunk.set([0x50, 0x4b, 0x03, 0x04]);
        sent += 1;
        controller.enqueue(chunk);
      },
    });
    expect(await checkLink('https://moosejaw.ca/huge.zip', respond(body), TODAY))
      .toEqual({ verified: false, detail: 'a zip file, too large to open here' });
    expect(sent).toBeLessThan(40);
  });

  it('stops unpacking a small zip whose timetable file inflates past the cap', async () => {
    expect(MAX_UNZIPPED_ENTRY_BYTES).toBe(50 * 1024 * 1024);
    const zip = new JSZip();
    for (const [name, text] of Object.entries(gtfsFiles('20270301'))) zip.file(name, text);
    zip.file('calendar_dates.txt', `service_id,date,exception_type\n${'wk,20270101,1\n'.repeat(200_000)}`);
    const bomb = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
    expect(bomb.length).toBeLessThan(100_000);

    await expect(inspectGtfsZip(bomb, 100_000)).rejects.toThrow();
    expect(await checkLink('https://moosejaw.ca/GTFS.zip', respond(bomb), TODAY, { maxEntryBytes: 100_000 }))
      .toEqual({ verified: false, detail: 'a zip file that unpacks too large to open here' });
    // The same zip is fine under the real cap.
    expect((await checkLink('https://moosejaw.ca/GTFS.zip', respond(bomb), TODAY)).verified).toBe(true);
  });
});

describe('redirects when checking a link', () => {
  const redirect = (location: string, status = 302) => new Response(null, { status, headers: { location } });
  /** A fake fetch that answers each address from a table and records what was asked for. */
  const site = (pages: Record<string, () => Response>) => {
    const seen: Array<{ url: string; redirect?: string }> = [];
    const fetchImpl: FetchLike = async (url, init) => {
      seen.push({ url, redirect: init?.redirect });
      if (!(url in pages)) throw new Error(`unexpected fetch: ${url}`);
      return pages[url]();
    };
    return { fetchImpl, seen };
  };

  it('follows redirects by hand and checks the file at the end', async () => {
    const zip = await gtfsZip(gtfsFiles('20270301'));
    const { fetchImpl, seen } = site({
      'https://moosejaw.ca/GTFS.zip': () => redirect('/files/current.zip', 301),
      'https://moosejaw.ca/files/current.zip': () => redirect('https://cdn.moosejaw.ca/current.zip'),
      'https://cdn.moosejaw.ca/current.zip': () => new Response(zip as BodyInit),
    });
    expect(await checkLink('https://moosejaw.ca/GTFS.zip', fetchImpl, TODAY))
      .toEqual({ verified: true, detail: 'a GTFS zip, timetable runs to 2027-03-01' });
    expect(seen.map(call => call.url)).toEqual(['https://moosejaw.ca/GTFS.zip', 'https://moosejaw.ca/files/current.zip', 'https://cdn.moosejaw.ca/current.zip']);
    expect(seen.every(call => call.redirect === 'manual')).toBe(true);
  });

  it('never fetches a redirect target that is not a public http(s) link', async () => {
    for (const target of ['http://169.254.169.254/latest/meta-data', 'http://localhost:8080/admin', 'http://10.0.0.5/x.zip', 'file:///etc/passwd', 'http://[::1]/x.zip']) {
      const { fetchImpl, seen } = site({ 'https://moosejaw.ca/GTFS.zip': () => redirect(target) });
      expect(await checkLink('https://moosejaw.ca/GTFS.zip', fetchImpl, TODAY))
        .toEqual({ verified: false, detail: 'the link redirects to an address that is not a public web link' });
      expect(seen).toHaveLength(1);
    }
  });

  it('gives up after the redirect cap', async () => {
    let hops = 0;
    const fetchImpl: FetchLike = async () => { hops += 1; return redirect(`https://moosejaw.ca/hop${hops}`); };
    expect(await checkLink('https://moosejaw.ca/GTFS.zip', fetchImpl, TODAY))
      .toEqual({ verified: false, detail: 'the link redirects too many times' });
    expect(hops).toBe(MAX_REDIRECTS + 1);
  });
});

describe('one agency', () => {
  it('never reports the link Atlas already uses', async () => {
    expect(isKnownFeedUrl('http://www.moosejaw.ca/old/GTFS.zip/', ['https://moosejaw.ca/old/GTFS.zip'])).toBe(true);
    expect(isKnownFeedUrl('https://moosejaw.ca/new/GTFS.zip', ['https://moosejaw.ca/old/GTFS.zip'])).toBe(false);
    const fetchImpl = vi.fn<FetchLike>();
    const result = await findForAgency(
      finderAgency(),
      async () => ({ outcome: 'link_found', link_url: 'https://www.moosejaw.ca/old/GTFS.zip', source_page_url: 'https://moosejaw.ca/transit' }),
      fetchImpl,
      TODAY,
    );
    expect(result).toEqual({ kind: 'nothing', reason: 'the search only turned up the link Atlas already uses' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('turns an API error or a malformed answer into "nothing found (error)"', async () => {
    const failing: AskModel = async () => { throw new Error('429 rate limited'); };
    expect(await findForAgency(finderAgency(), failing, respond(null), TODAY)).toEqual({ kind: 'error' });
    expect(await findForAgency(finderAgency(), async () => ({ outcome: 'link_found' }), respond(null), TODAY)).toEqual({ kind: 'error' });
  });

  it('collects every feed link Atlas knows from the shared expired-agency list', () => {
    const agencies = expiredAgencies([
      indexAgency('taft', '20220101', { websiteUrl: 'https://taft.example.org', mdbFeedUrl: 'https://files.mobilitydatabase.org/mdb-1/latest.zip', feedFallbackUrls: ['https://taft.example.org/alt.zip'] }),
      indexAgency('ttc', '20991231'),
      indexAgency('hidden', '20220101', { hiddenInProduction: true }),
    ], TODAY);
    expect(agencies).toEqual([{
      slug: 'taft',
      name: 'TAFT',
      region: 'Somewhere',
      expiredOn: '2022-01-01',
      websiteUrl: 'https://taft.example.org',
      knownFeedUrls: ['https://taft.example.org/gtfs.zip', 'https://files.mobilitydatabase.org/mdb-1/latest.zip', 'https://taft.example.org/alt.zip'],
    }]);
  });
});

describe('the weekly comment', () => {
  const comment = formatComment([
    { agency: finderAgency(), result: { kind: 'link', linkUrl: 'https://moosejaw.ca/new/GTFS.zip', sourcePageUrl: 'https://moosejaw.ca/transit', check: { verified: true, detail: 'a GTFS zip, timetable runs to 2027-03-01' } } },
    { agency: finderAgency({ slug: 'b', name: 'B Transit' }), result: { kind: 'link', linkUrl: 'https://b.example.org/gtfs.zip', sourcePageUrl: 'https://b.example.org/data', check: { verified: false, detail: 'the link did not respond' } } },
    { agency: finderAgency({ slug: 'c', name: 'C Transit' }), result: { kind: 'ended', sourcePageUrl: 'https://c.example.org/news' } },
    { agency: finderAgency({ slug: 'd', name: 'D Transit' }), result: { kind: 'nothing' } },
    { agency: finderAgency({ slug: 'e', name: 'E Transit' }), result: { kind: 'error' } },
  ], TODAY, 2);

  it('has a dated heading and one line per agency', () => {
    expect(comment).toContain('### Link finder, 2026-11-09');
    expect(comment.split('\n').filter(line => line.startsWith('- '))).toEqual([
      '- Moose Jaw Transit (`moose-jaw`): suggested link <https://moosejaw.ca/new/GTFS.zip> (checked: a GTFS zip, timetable runs to 2027-03-01), found on <https://moosejaw.ca/transit>',
      '- B Transit (`b`): suggested link <https://b.example.org/gtfs.zip> (unverified: the link did not respond), found on <https://b.example.org/data>',
      '- C Transit (`c`): service ended, according to <https://c.example.org/news>',
      '- D Transit (`d`): nothing found',
      '- E Transit (`e`): nothing found (error)',
    ]);
    expect(comment).toContain('2 more agencies were not checked this week');
  });

  it('is plain text: no emoji and no all-caps words apart from GTFS', () => {
    expect(comment).not.toMatch(/\p{Extended_Pictographic}/u);
    const shouting = (comment.replace(/<[^>]*>/g, '').match(/\b[A-Z]{2,}\b/g) ?? []).filter(word => word !== 'GTFS');
    expect(shouting).toEqual([]);
  });

  it('recognises its own comment by the marker, for the same Monday-to-Sunday week only', () => {
    // 2026-11-09 is a Monday.
    expect(hasFinderCommentThisWeek(['unrelated', comment], '20261112')).toBe(true);
    expect(hasFinderCommentThisWeek([comment], '20261115')).toBe(true);
    expect(hasFinderCommentThisWeek([comment], '20261116')).toBe(false);
    expect(hasFinderCommentThisWeek(['### Link finder, 2026-11-09'], TODAY)).toBe(false);
    // A manual run on Thursday the 5th does not suppress the comment on Monday the 9th.
    expect(hasFinderCommentThisWeek([formatComment([], '20261105')], TODAY)).toBe(false);
    // The week does not break at new year: Thursday 2026-12-31 and Friday 2027-01-01 share one.
    expect(hasFinderCommentThisWeek([formatComment([], '20261231')], '20270101')).toBe(true);
  });

  it('stays under the GitHub comment limit, with a plain line saying the list was cut short', () => {
    const link = `https://example.org/${'a'.repeat(MAX_URL_LENGTH - 'https://example.org/'.length)}`;
    const many = Array.from({ length: 200 }, (_, i) => ({
      agency: finderAgency({ slug: `agency-${i}`, name: `Agency ${i}` }),
      result: { kind: 'link' as const, linkUrl: link, sourcePageUrl: link, check: { verified: false, detail: 'the link did not respond' } },
    }));
    const long = formatComment(many, TODAY, 4);
    expect(MAX_COMMENT_CHARS).toBeLessThan(65_536);
    expect(long.length).toBeLessThanOrEqual(MAX_COMMENT_CHARS);
    const listed = long.split('\n').filter(line => line.startsWith('- '));
    expect(listed.length).toBeGreaterThan(0);
    expect(listed.length).toBeLessThan(200);
    // Only whole lines are kept.
    expect(listed.every(line => line.endsWith(`found on <${link}>`))).toBe(true);
    expect(long).toContain(`List cut short: ${200 - listed.length} more results did not fit in one comment.`);
    expect(long).toContain('4 more agencies were not checked this week');
    expect(long.startsWith('<!-- expired-feed-link-finder 2026-11-09 -->')).toBe(true);
    expect(comment).not.toContain('List cut short');
  });
});

describe('the weekly starting point', () => {
  it('numbers weeks Monday to Sunday', () => {
    expect(weekIndex('20261108')).toBe(weekIndex('20261109') - 1);
    expect(weekIndex('20261115')).toBe(weekIndex('20261109'));
    expect(weekIndex('20261116')).toBe(weekIndex('20261109') + 1);
  });

  it('starts somewhere else each week, the same within a week, and reaches every agency in turn', () => {
    const mondays = (count: number) => Array.from({ length: count }, (_, i) => {
      const date = new Date(Date.UTC(2026, 10, 9 + 7 * i));
      return date.toISOString().slice(0, 10).replace(/-/g, '');
    });
    for (const size of [2, 7, 35, 40, 43, 210]) {
      const list = Array.from({ length: size }, (_, i) => i);
      const firsts = mondays(size).map(day => rotateForWeek(list, day)[0]);
      // Over as many weeks as there are agencies, each one is first exactly once.
      expect(new Set(firsts).size).toBe(size);
      const rotated = rotateForWeek(list, TODAY);
      expect([...rotated].sort((a, b) => a - b)).toEqual(list);
      expect(rotateForWeek(list, '20261113')).toEqual(rotated);
    }
    expect(rotateForWeek(['only'], TODAY)).toEqual(['only']);
  });
});

describe('the whole run', () => {
  const agencies = [indexAgency('taft', '20220101'), indexAgency('sfmta', '20240828'), indexAgency('ttc', '20991231')];
  const ask = (answers: Record<string, unknown>) => vi.fn<AskModel>(async agency => {
    if (!(agency.slug in answers)) throw new Error('529 overloaded');
    return answers[agency.slug];
  });
  const key = { ANTHROPIC_API_KEY: 'test-key' };

  it('prints one line and stops when there is no API key', async () => {
    const { gh, calls } = fakeGh();
    const createAsk = vi.fn();
    const log = vi.fn();
    for (const env of [{}, { ANTHROPIC_API_KEY: '' }]) {
      expect(await runLinkFinder({ env, agencies, gh, createAsk, log, today: TODAY })).toBe('no-key');
    }
    expect(log.mock.calls).toEqual([
      ['ANTHROPIC_API_KEY is not set: skipping the expired-timetable link finder.'],
      ['ANTHROPIC_API_KEY is not set: skipping the expired-timetable link finder.'],
    ]);
    expect(createAsk).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it('does nothing when there is no open issue, or no expired agency', async () => {
    const { gh, posted } = fakeGh({ issue: null });
    const createAsk = vi.fn();
    expect(await runLinkFinder({ env: key, agencies, gh, createAsk, log: () => undefined, today: TODAY })).toBe('no-open-issue');
    expect(await runLinkFinder({ env: key, agencies: [indexAgency('ttc', '20991231')], gh, createAsk, log: () => undefined, today: TODAY })).toBe('none-expired');
    expect(createAsk).not.toHaveBeenCalled();
    expect(posted).toEqual([]);
  });

  it('does not post a second comment in the same week', async () => {
    const { gh, posted } = fakeGh({ comments: [formatComment([], TODAY)] });
    const createAsk = vi.fn();
    expect(await runLinkFinder({ env: key, agencies, gh, createAsk, log: () => undefined, today: '20261113' })).toBe('already-commented');
    expect(createAsk).not.toHaveBeenCalled();
    expect(posted).toEqual([]);
  });

  it('still posts on Monday after a manual run late the week before', async () => {
    const { gh, posted } = fakeGh({ comments: [formatComment([], '20261107')] });
    const askModel = ask({ taft: { outcome: 'nothing_found', link_url: null, source_page_url: null } });
    expect(await runLinkFinder({ env: key, agencies, gh, createAsk: () => askModel, log: () => undefined, today: TODAY })).toBe('posted');
    expect(posted).toHaveLength(1);
  });

  it('starts from a different agency each week', async () => {
    const many = Array.from({ length: 9 }, (_, i) => indexAgency(`a${i}`, '20220101'));
    const firstAsked = async (today: string) => {
      const { gh } = fakeGh();
      const askModel = vi.fn<AskModel>(async () => ({ outcome: 'nothing_found', link_url: null, source_page_url: null }));
      await runLinkFinder({ env: key, agencies: many, gh, createAsk: () => askModel, log: () => undefined, today });
      expect(askModel).toHaveBeenCalledTimes(9);
      return askModel.mock.calls[0][0].slug;
    };
    expect(await firstAsked(TODAY)).not.toBe(await firstAsked('20261116'));
  });

  it('stops requests still running at the time cap and posts what it has', async () => {
    expect(MAX_RUN_MINUTES).toBeLessThan(30);
    const { gh, posted } = fakeGh();
    const signals: AbortSignal[] = [];
    let quick = true;
    const askModel = vi.fn<AskModel>((_agency, signal) => {
      if (quick) { quick = false; return Promise.resolve({ outcome: 'nothing_found', link_url: null, source_page_url: null }); }
      signals.push(signal!);
      // One request stops when told to, the others ignore the signal and never finish.
      return signals.length === 1
        ? new Promise((_resolve, reject) => signal!.addEventListener('abort', () => reject(new Error('aborted'))))
        : new Promise(() => undefined);
    });
    const many = Array.from({ length: 6 }, (_, i) => indexAgency(`a${i}`, '20220101'));
    const log = vi.fn();
    const started = Date.now();
    expect(await runLinkFinder({ env: key, agencies: many, gh, createAsk: () => askModel, log, today: TODAY, maxRunMs: 60 })).toBe('posted');
    expect(Date.now() - started).toBeLessThan(2000);
    expect(signals.length).toBeGreaterThan(0);
    expect(signals.every(signal => signal.aborted)).toBe(true);
    // Nothing new was started after the cap.
    expect(askModel.mock.calls.length).toBeLessThanOrEqual(3);
    expect(posted).toHaveLength(1);
    expect(posted[0].split('\n').filter(line => line.startsWith('- '))).toHaveLength(1);
    expect(posted[0]).toContain('5 more agencies were not checked this week');
    expect(log.mock.calls.flat().join('\n')).toContain('Time cap');
  });

  it('posts exactly one comment on the exact-title issue, and one failed agency does not stop the rest', async () => {
    const { gh, posted, calls } = fakeGh();
    const askModel = ask({ taft: { outcome: 'service_ended', link_url: null, source_page_url: 'https://taft.example.org/news' } });
    expect(await runLinkFinder({ env: key, agencies, gh, createAsk: () => askModel, fetchImpl: respond(null), log: () => undefined, today: TODAY })).toBe('posted');
    expect(askModel).toHaveBeenCalledTimes(2);
    expect(posted).toHaveLength(1);
    expect(posted[0].split('\n').filter(line => line.startsWith('- '))).toEqual([
      '- TAFT (`taft`): service ended, according to <https://taft.example.org/news>',
      '- SFMTA (`sfmta`): nothing found (error)',
    ]);
    expect(calls.find(args => args[1] === 'comment')).toEqual(['issue', 'comment', '612', '--body-file', '-']);
  });

  it('prints the comment instead of posting it on a dry run, without touching GitHub', async () => {
    const { gh, calls } = fakeGh();
    const log = vi.fn();
    const askModel = ask({ taft: { outcome: 'nothing_found', link_url: null, source_page_url: null }, sfmta: { outcome: 'nothing_found', link_url: null, source_page_url: null } });
    expect(await runLinkFinder({ env: key, agencies, gh, createAsk: () => askModel, log, dryRun: true, today: TODAY })).toBe('dry-run');
    expect(calls).toEqual([]);
    expect(log.mock.calls.at(-1)?.[0]).toContain('### Link finder, 2026-11-09');
  });

  it('posts nothing when every lookup failed', async () => {
    const { gh, posted } = fakeGh();
    expect(await runLinkFinder({ env: key, agencies, gh, createAsk: () => ask({}), log: () => undefined, today: TODAY })).toBe('all-failed');
    expect(posted).toEqual([]);
  });

  it('stops at the per-run agency cap and counts the rest', async () => {
    const many = Array.from({ length: MAX_AGENCIES_PER_RUN + 3 }, (_, i) => indexAgency(`a${String(i).padStart(2, '0')}`, '20220101'));
    const { gh, posted } = fakeGh();
    const askModel = vi.fn<AskModel>(async () => ({ outcome: 'nothing_found', link_url: null, source_page_url: null }));
    await runLinkFinder({ env: key, agencies: many, gh, createAsk: () => askModel, log: () => undefined, today: TODAY });
    expect(askModel).toHaveBeenCalledTimes(MAX_AGENCIES_PER_RUN);
    expect(posted[0]).toContain('3 more agencies were not checked this week');
  });
});

describe('the Claude request', () => {
  const message = (content: unknown[], stop_reason: string, searches = 0) =>
    ({ content, stop_reason, usage: { server_tool_use: { web_search_requests: searches } } });
  const client = (responses: unknown[]) => {
    const create = vi.fn(async (_params: Record<string, unknown>) => responses.shift());
    return { create, client: { messages: { create } } as never };
  };

  it('caps searches and output, and reads the answer from the strict report tool', async () => {
    const input = { outcome: 'nothing_found', link_url: null, source_page_url: null };
    const { create, client: fake } = client([message([{ type: 'tool_use', id: 't1', name: 'report_finding', input }], 'tool_use', 2)]);
    expect(await createClaudeAsk(fake)(finderAgency())).toEqual(input);
    const params = create.mock.calls[0][0] as { max_tokens: number; tools: Array<Record<string, unknown>>; messages: Array<{ content: string }> };
    expect(params.max_tokens).toBeLessThanOrEqual(8192);
    expect(params.tools[0]).toMatchObject({ name: 'web_search', max_uses: MAX_SEARCHES_PER_AGENCY });
    expect(params.tools[1]).toMatchObject({ name: 'report_finding', strict: true });
    expect(params.messages[0].content).toContain('https://moosejaw.ca/old/GTFS.zip');
  });

  it('resumes a paused search turn only within the request limit, and fails without a report', async () => {
    const paused = () => message([{ type: 'server_tool_use', id: 's1', name: 'web_search', input: {} }], 'pause_turn', 1);
    const looping = client(Array.from({ length: 10 }, paused));
    await expect(createClaudeAsk(looping.client)(finderAgency())).rejects.toThrow(/request limit/);
    expect(looping.create).toHaveBeenCalledTimes(MAX_REQUESTS_PER_AGENCY);

    const spent = client([message([], 'pause_turn', MAX_SEARCHES_PER_AGENCY), paused()]);
    await expect(createClaudeAsk(spent.client)(finderAgency())).rejects.toThrow(/no report/);
    expect(spent.create).toHaveBeenCalledTimes(1);

    const prose = client([message([{ type: 'text', text: 'I could not find it.' }], 'end_turn')]);
    await expect(createClaudeAsk(prose.client)(finderAgency())).rejects.toThrow(/no report/);
  });

  it('gives a resumed turn only the searches still unused, and stops resuming at zero', async () => {
    const paused = (searches: number) => message([{ type: 'server_tool_use', id: 's1', name: 'web_search', input: {} }], 'pause_turn', searches);
    const input = { outcome: 'nothing_found', link_url: null, source_page_url: null };
    const maxUses = (create: ReturnType<typeof client>['create']) =>
      create.mock.calls.map(call => (call[0] as { tools: Array<{ max_uses?: number }> }).tools[0].max_uses);

    const resumed = client([paused(3), paused(1), message([{ type: 'tool_use', id: 't1', name: 'report_finding', input }], 'tool_use', 1)]);
    expect(await createClaudeAsk(resumed.client)(finderAgency())).toEqual(input);
    expect(maxUses(resumed.create)).toEqual([MAX_SEARCHES_PER_AGENCY, MAX_SEARCHES_PER_AGENCY - 3, MAX_SEARCHES_PER_AGENCY - 4]);

    const spent = client([paused(3), paused(2), paused(1)]);
    await expect(createClaudeAsk(spent.client)(finderAgency())).rejects.toThrow(/no report/);
    expect(maxUses(spent.create)).toEqual([MAX_SEARCHES_PER_AGENCY, MAX_SEARCHES_PER_AGENCY - 3]);
  });

  it('passes the time-cap signal to the request', async () => {
    const input = { outcome: 'nothing_found', link_url: null, source_page_url: null };
    const create = vi.fn(async (_params: unknown, _options?: { signal?: AbortSignal }) => message([{ type: 'tool_use', id: 't1', name: 'report_finding', input }], 'tool_use'));
    const cap = new AbortController();
    await createClaudeAsk({ messages: { create } } as never)(finderAgency(), cap.signal);
    expect(create.mock.calls[0][1]?.signal).toBe(cap.signal);
  });
});

describe('the workflow step', () => {
  const workflow = readFileSync('.github/workflows/refresh-feeds.yml', 'utf8');
  const start = workflow.indexOf('      - name: Suggest newer links for agencies on expired timetables');
  const step = workflow.slice(start, workflow.indexOf('      - name: Install tippecanoe'));

  it('runs right after the expired-timetables report and can never fail the refresh', () => {
    expect(start).toBeGreaterThan(workflow.indexOf('      - name: Report agencies on expired timetables'));
    expect(workflow.slice(workflow.indexOf('      - name: Report agencies on expired timetables'), start)).not.toMatch(/\n      - name: (?!Report agencies)/);
    expect(step).toContain('continue-on-error: true');
    expect(step).toContain('ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}');
    expect(step).toContain('npx tsx scripts/find-expired-feed-links.ts');
  });

  it('only suggests: the script has no R2, config or file-writing code', () => {
    const source = readFileSync('scripts/find-expired-feed-links.ts', 'utf8');
    expect(source).not.toMatch(/writeFile|appendFile|@aws-sdk|config\/agencies|R2_/);
  });
});
