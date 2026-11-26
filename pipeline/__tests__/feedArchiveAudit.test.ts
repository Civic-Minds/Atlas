import { describe, expect, it } from 'vitest';
import { auditFeedArchive, feedArchiveAuditFailures } from '../feedArchiveAudit.js';

const active = () => true;

describe('auditFeedArchive (CIV-3027)', () => {
  it('passes when every recorded main and supplemental zip is archived', () => {
    const result = auditFeedArchive(
      [{ slug: 'grt', lastRawArchiveKey: '20270101-aaaa', lastSupplementalFeeds: [{ rawArchiveKey: '20280703-bbbb' }] }],
      active,
      ['gtfs/archive/grt/20270101-aaaa.zip', 'gtfs/archive/grt--supplemental-1/20280703-bbbb.zip'],
    );
    expect(result).toEqual({ checked: 2, missingRecorded: [], missingUnrecorded: [], unrecordedWithArchive: [] });
    expect(feedArchiveAuditFailures(result)).toEqual([]);
  });

  it('fails on a recorded zip with no archive copy, even when an older zip for the agency is there', () => {
    const result = auditFeedArchive(
      [{ slug: 'cheyenne', lastRawArchiveKey: '20270101-new' }],
      active,
      ['gtfs/archive/cheyenne/20260101-old.zip'],
    );
    expect(result.missingRecorded).toEqual(['gtfs/archive/cheyenne/20270101-new.zip']);
    expect(feedArchiveAuditFailures(result)).toEqual(['1 recorded feed zip(s) with no archive copy']);
  });

  it('fails on a missing supplemental zip', () => {
    const result = auditFeedArchive(
      [{ slug: 'grt', lastRawArchiveKey: 'a', lastSupplementalFeeds: [{ rawArchiveKey: null }, { rawArchiveKey: 'b' }] }],
      active,
      ['gtfs/archive/grt/a.zip'],
    );
    expect(result.checked).toBe(2);
    expect(result.missingRecorded).toEqual(['gtfs/archive/grt--supplemental-2/b.zip']);
  });

  it('needs at least one archived zip for an active agency with no recorded key', () => {
    const result = auditFeedArchive(
      [{ slug: 'evansville' }, { slug: 'barrie' }, { slug: 'hidden-one' }],
      agency => agency.slug !== 'hidden-one',
      ['gtfs/archive/barrie/20260101-x.zip', 'gtfs/archive/evansville/notes.json'],
    );
    expect(result.missingUnrecorded).toEqual(['evansville']);
    expect(result.unrecordedWithArchive).toEqual(['barrie']);
    expect(feedArchiveAuditFailures(result)).toEqual(['1 active agencies with no archived zip']);
  });
});
