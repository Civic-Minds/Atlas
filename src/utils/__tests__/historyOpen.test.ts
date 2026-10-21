import { describe, expect, it } from 'vitest';
import { historyAgencyToOpen, historyRouteSearchPlaceholder, inViewFirst } from '../historyOpen';

const HISTORY = new Set(['ttc', 'marta', 'yrt', 'miway']);

describe('historyAgencyToOpen (#1012)', () => {
  it('a fresh load with one History agency in the default view does not open it', () => {
    expect(historyAgencyToOpen({ selectedAgencySlug: null, viewportSlugs: ['ttc', 'not-history'], historySlugs: HISTORY, userMovedMap: false })).toBeNull();
  });

  it('after the user pans or zooms, the one History agency in view opens', () => {
    expect(historyAgencyToOpen({ selectedAgencySlug: null, viewportSlugs: ['marta', 'not-history'], historySlugs: HISTORY, userMovedMap: true })).toBe('marta');
  });

  it('several History agencies in view keep the chooser', () => {
    expect(historyAgencyToOpen({ selectedAgencySlug: null, viewportSlugs: ['ttc', 'yrt', 'miway'], historySlugs: HISTORY, userMovedMap: true })).toBeNull();
  });

  it('no History agency in view keeps the chooser', () => {
    expect(historyAgencyToOpen({ selectedAgencySlug: null, viewportSlugs: ['not-history'], historySlugs: HISTORY, userMovedMap: true })).toBeNull();
  });

  it('an agency the user selected opens even without a pan, but only if it has History', () => {
    expect(historyAgencyToOpen({ selectedAgencySlug: 'ttc', viewportSlugs: ['ttc', 'yrt'], historySlugs: HISTORY, userMovedMap: false })).toBe('ttc');
    expect(historyAgencyToOpen({ selectedAgencySlug: 'not-history', viewportSlugs: ['marta'], historySlugs: HISTORY, userMovedMap: false })).toBeNull();
  });

  it('nothing opens when History is off', () => {
    expect(historyAgencyToOpen({ selectedAgencySlug: 'ttc', viewportSlugs: ['ttc'], historySlugs: null, userMovedMap: true })).toBeNull();
  });
});

describe('inViewFirst', () => {
  const a = (slug: string) => ({ slug });
  it('moves sections with an in-view agency to the top and puts in-view agencies first', () => {
    const sections: [string, { slug: string }[]][] = [
      ['Georgia', [a('marta')]],
      ['Ontario', [a('miway'), a('ttc'), a('yrt')]],
      ['Quebec', [a('stm')]],
    ];
    expect(inViewFirst(sections, new Set(['ttc', 'yrt']))).toEqual([
      ['Ontario', [a('ttc'), a('yrt'), a('miway')]],
      ['Georgia', [a('marta')]],
      ['Quebec', [a('stm')]],
    ]);
  });

  it('keeps the order when nothing is in view', () => {
    const sections: [string, { slug: string }[]][] = [['Georgia', [a('marta')]], ['Ontario', [a('ttc')]]];
    expect(inViewFirst(sections, new Set())).toEqual(sections);
  });
});

describe('historyRouteSearchPlaceholder (CIV-402)', () => {
  it('names the open agency, since the bar searches its routes', () => {
    expect(historyRouteSearchPlaceholder('MARTA')).toBe('Find a MARTA route…');
  });
});
