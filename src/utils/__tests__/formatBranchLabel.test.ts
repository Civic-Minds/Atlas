import { describe, expect, it } from 'vitest';
import { formatBranchLabel, formatStoredDate, resolveBranchLabel } from '../format';

describe('formatStoredDate', () => {
  it('formats YYYYMMDD and YYYY-MM-DD', () => {
    expect(formatStoredDate('20261010')).toBe('Oct 10, 2026');
    expect(formatStoredDate('2026-07-07')).toBe('Jul 7, 2026');
  });
});

describe('formatBranchLabel', () => {
  it('uses fallback when destination matches route long name', () => {
    expect(formatBranchLabel('Warden', '68', 'Warden', 'Southbound')).toBe('to Southbound');
  });

  it('uses fallback when feed spacing differs from route name', () => {
    expect(formatBranchLabel('Crosstown2', '2', 'CROSSTOWN 2', 'Eastbound')).toBe('to Eastbound');
  });

  it('shows distinct terminals', () => {
    expect(formatBranchLabel('Warden Station', '68', 'Warden', 'Southbound')).toBe('to Warden Station');
  });

  it('omits MiWay express branding headsigns when section heading is present', () => {
    expect(resolveBranchLabel({
      headsign: '135 W Express Eglinton Exp',
      shortName: '135',
      longName: 'Eglinton Express',
      directionId: 1,
      multipleDirections: true,
      sectionBoundLabel: 'Westbound',
    })).toBe('');
  });
});

describe('resolveBranchLabel', () => {
  it('falls back to bound label for headsign-less branches at stops', () => {
    expect(resolveBranchLabel({
      headsign: null,
      shortName: '68',
      longName: 'Warden',
      directionId: 0,
      boundLabel: 'Southbound',
      multipleDirections: true,
    })).toBe('to Southbound');
  });

  it('falls back to a direction label when a route card headsign is its route name', () => {
    expect(resolveBranchLabel({
      headsign: 'Crosstown2',
      shortName: '2',
      longName: 'CROSSTOWN 2',
      directionId: 1,
    })).toBe('to Direction 2');
  });

  it('omits row label when it would repeat the section heading', () => {
    expect(resolveBranchLabel({
      headsign: null,
      shortName: '68',
      longName: 'Warden',
      directionId: 0,
      multipleDirections: true,
      sectionBoundLabel: 'Southbound',
    })).toBe('');
  });

  it('capitalizes MVTA destination abbreviations', () => {
    expect(formatBranchLabel('MOA/MSP', '495', '4FUN: Shakopee-Savage-Burnsville-MOA-MSP')).toBe('to MOA/MSP');
    expect(formatBranchLabel('Marschall Road TS', '495', '4FUN: Shakopee-Savage-Burnsville-MOA-MSP')).toBe('to Marschall Road TS');
  });
});
