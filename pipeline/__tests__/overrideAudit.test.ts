import { describe, expect, it } from 'vitest';
import {
  clearIssueUrlOnFeedChange,
  clearOverrideUserFacingOnFeedChange,
  formatOverrideIssueUrlClearedLog,
  formatOverrideResolvedLog,
  formatOverrideUserFacingClearedLog,
  reconcileExcludeRouteShortNames,
  upstreamFeedChanged,
} from '../overrideAudit.js';
import { shouldReviewNextFeed } from '../feedReview.js';

describe('data quality review threshold', () => {
  it('reviews the next feed after two flagged feeds in the last ten', () => {
    const records = Array.from({ length: 10 }, (_, i) => ({ result: i === 2 || i === 8 ? 'issue' as const : 'clean' as const }));
    expect(shouldReviewNextFeed(records)).toBe(true);
  });

  it('does not review after one flagged feed or with too little history', () => {
    expect(shouldReviewNextFeed([{ result: 'issue' }])).toBe(false);
    expect(shouldReviewNextFeed([
      { result: 'issue' }, { result: 'clean' }, { result: 'clean' }, { result: 'clean' },
    ])).toBe(false);
  });

  it('only counts the ten most recent reviewed feeds', () => {
    const records = Array.from({ length: 10 }, () => ({ result: 'clean' as const }));
    records.unshift({ result: 'issue' });
    expect(shouldReviewNextFeed(records)).toBe(false);
  });
});

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

describe('clearOverrideUserFacingOnFeedChange', () => {
  it('clears issueUrl and overrideNote on new upstream file but keeps exclusions', () => {
    const agency = {
      lastFeedVersion: 'S1000045',
      issueUrl: 'https://github.com/Civic-Minds/Atlas/issues/144',
      overrideNote: 'Hidden test route.',
      excludeRouteShortNames: ['Test'],
    };
    expect(clearOverrideUserFacingOnFeedChange(agency, null, 'S1000099')).toBe(true);
    expect(agency.issueUrl).toBeUndefined();
    expect(agency.overrideNote).toBeUndefined();
    expect(agency.excludeRouteShortNames).toEqual(['Test']);
  });

  it('does not clear when feed version is unchanged', () => {
    const agency = {
      lastFeedVersion: 'S1000045',
      overrideNote: 'Hidden test route.',
    };
    expect(clearOverrideUserFacingOnFeedChange(agency, null, 'S1000045')).toBe(false);
    expect(agency.overrideNote).toBeDefined();
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

describe('formatOverrideUserFacingClearedLog', () => {
  it('mentions re-verify if override still needed', () => {
    expect(formatOverrideUserFacingClearedLog('rockford')).toContain('excludeRouteShortNames kept');
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
