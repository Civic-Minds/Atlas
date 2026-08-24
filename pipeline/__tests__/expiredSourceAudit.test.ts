import { describe, expect, it } from 'vitest';
import {
  buildFeedCandidates,
  classifyExpiredCandidates,
  mobilityDatabaseLatestUrl,
} from '../expiredSourceAudit';

describe('expired source audit', () => {
  it('derives the latest Mobility Database URL from a dated snapshot', () => {
    expect(mobilityDatabaseLatestUrl(
      'https://files.mobilitydatabase.org/mdb-1993/mdb-1993-202605291824/mdb-1993-202605291824.zip',
    )).toBe('https://files.mobilitydatabase.org/mdb-1993/latest.zip');
  });

  it('adds a latest candidate without duplicating an existing latest URL', () => {
    expect(buildFeedCandidates(
      'https://files.mobilitydatabase.org/mdb-1993/mdb-1993-202605291824/mdb-1993-202605291824.zip',
      'https://files.mobilitydatabase.org/mdb-1993/latest.zip',
    )).toEqual([
      { kind: 'configured', url: 'https://files.mobilitydatabase.org/mdb-1993/mdb-1993-202605291824/mdb-1993-202605291824.zip' },
      { kind: 'configured', url: 'https://files.mobilitydatabase.org/mdb-1993/latest.zip' },
    ]);
  });

  it('identifies a newer current candidate', () => {
    expect(classifyExpiredCandidates('20260529', '20260824', [{
      kind: 'configured',
      url: 'https://example.com/go.zip',
      status: 'current',
      feedExpiry: '20260904',
      feedVersion: 'new',
      feedInfoEnd: '20260904',
      calendarExpiry: '20260904',
      sha256: 'hash',
      agencyNames: ['GO Transit'],
      routeCount: 10,
      stopCount: 10,
    }])).toBe('newer-source-found');
  });
});
