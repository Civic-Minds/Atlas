import { describe, expect, it } from 'vitest';
import { historyAgencyToOpen, historyRouteFromRouteKey, historyRouteSearchPlaceholder, indefiniteArticle, inViewFirst } from '../historyOpen';

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

  it('uses "an" before a vowel sound', () => {
    expect(historyRouteSearchPlaceholder('NFTA')).toBe('Find an NFTA route…');
    expect(historyRouteSearchPlaceholder('MBTA')).toBe('Find an MBTA route…');
  });
});

describe('indefiniteArticle', () => {
  it('reads initialisms by their first letter\'s name', () => {
    expect(['NFTA', 'MBTA', 'HSR', 'RTD', 'STM', 'OC Transpo', 'LA Metro', 'SFMTA'].map(indefiniteArticle)).toEqual(Array(8).fill('an'));
    expect(['TTC', 'YRT', 'UTA', 'DDOT', 'GO Transit'].map(indefiniteArticle)).toEqual(Array(5).fill('a'));
  });

  it('reads other names by their first sound', () => {
    expect(['MARTA', 'SEPTA', 'DART', 'TARC', 'MiWay', 'Unitrans', 'Utah Transit'].map(indefiniteArticle)).toEqual(Array(7).fill('a'));
    expect(['IndyGo', 'Edmonton Transit', 'Omnitrans'].map(indefiniteArticle)).toEqual(Array(3).fill('an'));
  });
});

describe('historyRouteFromRouteKey (#1028 item 24)', () => {
  const features = [
    { properties: { routeId: '10937', routeShortName: '6' } },
    { properties: { routeId: '10937', routeShortName: '6' } },
    { properties: { routeId: '20001', routeShortName: '117' } },
  ];
  it('reads a map route link as the History route of the same number', () => {
    expect(historyRouteFromRouteKey('marta::10937', features)).toEqual({ slug: 'marta', routeShortName: '6' });
    expect(historyRouteFromRouteKey('marta::20001::branch:east', features)).toEqual({ slug: 'marta', routeShortName: '117' });
  });
  it('gives nothing for a route id the agency does not have, or a malformed key', () => {
    expect(historyRouteFromRouteKey('marta::nope', features)).toBeNull();
    expect(historyRouteFromRouteKey('10937', features)).toBeNull();
  });
});
