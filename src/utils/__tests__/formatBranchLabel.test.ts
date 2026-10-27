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

  it('drops the repeated route number from zero-padded DART headsigns (#1098)', () => {
    expect(formatBranchLabel('5 INWOOD/ LOVE FIELD STATION', '005', 'LOVE FIELD SHUTTLE')).toBe('to Inwood/Love Field Station');
    expect(formatBranchLabel('5  LOVE FIELD AIRPORT', '005', 'LOVE FIELD SHUTTLE')).toBe('to Love Field Airport');
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

  it('omits a generic direction label when a route card headsign is its route name', () => {
    expect(resolveBranchLabel({
      headsign: 'Crosstown2',
      shortName: '2',
      longName: 'CROSSTOWN 2',
      directionId: 1,
    })).toBe('');
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

describe('destination capitals (CIV-935)', () => {
  it('keeps a mixed-case destination exactly as the feed wrote it', () => {
    expect(formatBranchLabel('McDonald Ave', '9', '')).toBe('to McDonald Ave');
    expect(formatBranchLabel('Station Champ-de-Mars', '9', '')).toBe('to Station Champ-de-Mars');
    expect(formatBranchLabel('95th/Dan Ryan CTA Station Bay A', '352', '')).toBe('to 95th/Dan Ryan CTA Station Bay A');
  });

  it('re-cases an all-capitals destination, keeping listed abbreviations', () => {
    expect(formatBranchLabel('LBJ/CENTRAL STATION', '9', '')).toBe('to LBJ/Central Station');
    expect(formatBranchLabel('MOODY CENTER', '9', '')).toBe('to Moody Center');
  });
});
