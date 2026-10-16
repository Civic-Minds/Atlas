import { describe, expect, it } from 'vitest';
import {
  capitalizeFirst,
  delayAmount,
  headwayAbout,
  headwayAboutRange,
  headwayAmount,
  headwayBandLabel,
  headwayEvery,
  headwayFilterLabel,
  headwayOrBetter,
  headwayTierLabel,
} from '../headwayText';

describe('headwayText', () => {
  it('every: a stated spacing', () => {
    expect(headwayEvery(10)).toBe('every 10 min');
    expect(headwayEvery(60)).toBe('every 60 min');
  });

  it('or better: what a filter means', () => {
    expect(headwayOrBetter(10)).toBe('every 10 min or better');
    expect(headwayOrBetter(30)).toBe('every 30 min or better');
  });

  it('filter label: capitalised, and no limit is All routes', () => {
    expect(headwayFilterLabel(15)).toBe('Every 15 min or better');
    expect(headwayFilterLabel(Infinity)).toBe('All routes');
  });

  it('about: a measured spacing', () => {
    expect(headwayAbout(16)).toBe('about every 16 min');
    expect(headwayAbout(60)).toBe('about every 60 min');
  });

  it('about range: both ends in minutes, collapsed when equal, split above 60', () => {
    expect(headwayAboutRange(6, 12)).toBe('about every 6–12 min');
    expect(headwayAboutRange(10, 10)).toBe('about every 10 min');
    expect(headwayAboutRange(30, 90)).toBe('about every 30 min – about every 90 min');
  });

  it('tier label and band label', () => {
    expect(headwayTierLabel(10)).toBe('≤10 min');
    expect(headwayTierLabel(60)).toBe('≤60 min');
    expect(headwayBandLabel(16, 30)).toBe('16–30 min');
  });

  it('amount: bare spacing, always minutes', () => {
    expect(headwayAmount(10)).toBe('10 min');
    expect(headwayAmount(60)).toBe('60 min');
    expect(headwayAmount(61)).toBe('61 min');
    expect(headwayAmount(120)).toBe('120 min');
  });

  it('delay amount is not a headway', () => {
    expect(delayAmount(3)).toBe('3 min');
    expect(delayAmount(2.5)).toBe('2.5 min');
  });

  describe('units above 60 minutes', () => {
    it('exact spacings stay in minutes, never hours', () => {
      expect(headwayEvery(90)).toBe('every 90 min');
      expect(headwayEvery(120)).toBe('every 120 min');
      expect(headwayEvery(75)).toBe('every 75 min');
      expect(headwayOrBetter(120)).toBe('every 120 min or better');
    });
    it('about rounds to the nearest 30 min', () => {
      expect(headwayAbout(61)).toBe('about every 60 min');
      expect(headwayAbout(80)).toBe('about every 90 min');
      expect(headwayAbout(90)).toBe('about every 90 min');
      expect(headwayAbout(120)).toBe('about every 120 min');
    });
  });

  describe('non-integers', () => {
    it('prints one decimal and never float noise', () => {
      expect(headwayEvery(7.5)).toBe('every 7.5 min');
      expect(headwayAbout(0.1 + 0.2)).toBe('about every 0.3 min');
      expect(headwayAbout(16.04)).toBe('about every 16 min');
    });
  });

  describe('missing values', () => {
    it('print a dash, never "NaN" or "null"', () => {
      for (const bad of [null, undefined, NaN, Infinity]) {
        expect(headwayEvery(bad)).toBe('—');
        expect(headwayOrBetter(bad)).toBe('—');
        expect(headwayAbout(bad)).toBe('—');
        expect(headwayAmount(bad)).toBe('—');
        expect(delayAmount(bad)).toBe('—');
      }
      expect(headwayTierLabel(Infinity)).toBe('—');
    });
  });

  it('capitalizeFirst', () => {
    expect(capitalizeFirst('every 10 min')).toBe('Every 10 min');
    expect(capitalizeFirst('')).toBe('');
  });
});
