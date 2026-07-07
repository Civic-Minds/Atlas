import { describe, expect, it } from 'vitest';
import {
  clearIssueUrlOnFeedChange,
  formatOverrideIssueUrlClearedLog,
  formatOverrideResolvedLog,
  issueRefFromUrl,
  reconcileExcludeRouteShortNames,
  upstreamFeedChanged,
} from '../overrideAudit.js';

describe('reconcileExcludeRouteShortNames', () => {
  it('flags exclusions still present in the feed', () => {
    const present = new Set(['1', 'Test', '11']);
    expect(reconcileExcludeRouteShortNames(present, ['Test'])).toEqual({
      stillNeeded: ['Test'],
      resolved: [],
    });
  });

  it('flags exclusions absent from a new feed version', () => {
    const present = new Set(['1', '11']);
    expect(reconcileExcludeRouteShortNames(present, ['Test'])).toEqual({
      stillNeeded: [],
      resolved: ['Test'],
    });
  });

  it('matches case-insensitively', () => {
    const present = new Set(['test']);
    expect(reconcileExcludeRouteShortNames(present, ['Test']).stillNeeded).toEqual(['Test']);
  });
});

describe('upstreamFeedChanged', () => {
  it('is false on first ingest with no prior snapshot', () => {
    expect(upstreamFeedChanged({}, '20240101', 'v2')).toBe(false);
  });

  it('is true when feed_version changes', () => {
    expect(upstreamFeedChanged(
      { lastFeedVersion: 'S1000045' },
      null,
      'S1000099',
    )).toBe(true);
  });

  it('is false when feed_version is unchanged', () => {
    expect(upstreamFeedChanged(
      { lastFeedVersion: 'S1000045' },
      null,
      'S1000045',
    )).toBe(false);
  });
});

describe('clearIssueUrlOnFeedChange', () => {
  it('clears issueUrl on new upstream file but keeps exclusions', () => {
    const agency = {
      lastFeedVersion: 'S1000045',
      issueUrl: 'https://github.com/Civic-Minds/Atlas/issues/144',
      excludeRouteShortNames: ['Test'],
    };
    const cleared = clearIssueUrlOnFeedChange(agency, null, 'S1000099');
    expect(cleared).toContain('/issues/144');
    expect(agency.issueUrl).toBeUndefined();
    expect(agency.excludeRouteShortNames).toEqual(['Test']);
  });

  it('does not clear issueUrl when feed version is unchanged', () => {
    const agency = {
      lastFeedVersion: 'S1000045',
      issueUrl: 'https://github.com/Civic-Minds/Atlas/issues/144',
    };
    expect(clearIssueUrlOnFeedChange(agency, null, 'S1000045')).toBeNull();
    expect(agency.issueUrl).toBeDefined();
  });
});

describe('formatOverrideIssueUrlClearedLog', () => {
  it('mentions re-file if override still needed', () => {
    expect(formatOverrideIssueUrlClearedLog(
      'rockford',
      'https://github.com/Civic-Minds/Atlas/issues/144',
    )).toContain('excludeRouteShortNames kept');
  });
});

describe('formatOverrideResolvedLog', () => {
  it('suggests removing override from index.json after upstream fix', () => {
    const msg = formatOverrideResolvedLog('rockford', ['Test'], 'https://github.com/Civic-Minds/Atlas/issues/144');
    expect(msg).toContain('drop excludeRouteShortNames from index.json');
    expect(msg).not.toContain('Closes');
  });
});
