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

  it('derives the latest URL for non-mdb Mobility Database ids', () => {
    expect(mobilityDatabaseLatestUrl(
      'https://files.mobilitydatabase.org/tld-7068_1/tld-7068_1-202601060114/tld-7068_1-202601060114.zip',
    )).toBe('https://files.mobilitydatabase.org/tld-7068_1/latest.zip');
    expect(mobilityDatabaseLatestUrl(
      'https://files.mobilitydatabase.org/ntd-60190/ntd-60190-202601240120/ntd-60190-202601240120.zip',
    )).toBe('https://files.mobilitydatabase.org/ntd-60190/latest.zip');
  });

  it('maps the retired Google-hosted mirror to the current latest URL (#627)', () => {
    expect(mobilityDatabaseLatestUrl(
      'https://storage.googleapis.com/storage/v1/b/mdb-latest/o/us-washington-island-transit-gtfs-280.zip?alt=media',
    )).toBe('https://files.mobilitydatabase.org/mdb-280/latest.zip');
    expect(mobilityDatabaseLatestUrl(
      'https://storage.googleapis.com/mdb-latest/ca-ontario-go-transit-gtfs-1993.zip',
    )).toBe('https://files.mobilitydatabase.org/mdb-1993/latest.zip');
  });

  it('adds a latest fallback behind a retired mirror URL (#627)', () => {
    expect(buildFeedCandidates(
      'https://storage.googleapis.com/storage/v1/b/mdb-latest/o/us-washington-island-transit-gtfs-280.zip?alt=media',
    )).toEqual([
      {
        kind: 'configured',
        url: 'https://storage.googleapis.com/storage/v1/b/mdb-latest/o/us-washington-island-transit-gtfs-280.zip?alt=media',
      },
      { kind: 'mdb-latest', url: 'https://files.mobilitydatabase.org/mdb-280/latest.zip' },
    ]);
  });

  it('leaves non-Mobility Database URLs alone', () => {
    expect(mobilityDatabaseLatestUrl('https://agency.example/gtfs.zip')).toBeNull();
    expect(mobilityDatabaseLatestUrl('https://files.mobilitydatabase.org/mdb-280/latest.zip')).toBeNull();
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

  it('keeps documented fallback sources ahead of Mobility Database fallbacks', () => {
    expect(buildFeedCandidates(
      'https://example.com/expired.zip',
      'https://files.mobilitydatabase.org/mdb-1993/latest.zip',
      ['https://agency.example/current.zip'],
    )).toEqual([
      { kind: 'configured', url: 'https://example.com/expired.zip' },
      { kind: 'fallback', url: 'https://agency.example/current.zip' },
      { kind: 'configured', url: 'https://files.mobilitydatabase.org/mdb-1993/latest.zip' },
    ]);
  });

  it('derives a latest fallback when the configured feed is a dated Mobility Database ZIP', () => {
    expect(buildFeedCandidates(
      'https://files.mobilitydatabase.org/mdb-1993/mdb-1993-202605291824/mdb-1993-202605291824.zip',
    )).toEqual([
      {
        kind: 'configured',
        url: 'https://files.mobilitydatabase.org/mdb-1993/mdb-1993-202605291824/mdb-1993-202605291824.zip',
      },
      {
        kind: 'mdb-latest',
        url: 'https://files.mobilitydatabase.org/mdb-1993/latest.zip',
      },
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

  it('does not call an agency genuinely expired when a candidate could not be checked', () => {
    expect(classifyExpiredCandidates('20260801', '20260824', [{
      kind: 'configured',
      url: 'https://example.com/expired.zip',
      status: 'expired',
      feedExpiry: '20260801',
      feedVersion: null,
      feedInfoEnd: '20260801',
      calendarExpiry: '20260801',
      sha256: 'hash',
      agencyNames: ['Example Transit'],
      routeCount: 1,
      stopCount: 1,
    }, {
      kind: 'mdb-latest',
      url: 'https://example.com/latest.zip',
      status: 'unavailable',
      feedExpiry: null,
      feedVersion: null,
      feedInfoEnd: null,
      calendarExpiry: null,
      sha256: null,
      agencyNames: [],
      routeCount: null,
      stopCount: null,
      error: 'HTTP 404',
    }])).toBe('needs-manual-source-review');
  });
});
