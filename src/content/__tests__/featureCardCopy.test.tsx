import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AboutPage from '../../AboutPage';
import PlannersPage from '../../PlannersPage';
import ResearchersPage from '../../ResearchersPage';
import { ABOUT_HEADLINE, ATLAS_INTRO_TEXT, ATLAS_MAP_SUMMARY, DATA_SOURCE_TITLE, PLANNERS_COPY, REQUEST_DEMO_LABEL, RESEARCHERS_COPY, dataSourceText, type FeatureCardCopy } from '../noticeCopy';

// Ryan's three rules for the feature cards and the pages that show them (CIV-1793; docs/style/TEXT.md, Words):
// - "The titles should be relatively the same amount of words": at most TITLE_MAX_WORDS (the first card's title has 5).
// - "Dont use the word Atlas in the body text" of a feature card.
// - "it's not just buses": "vehicles", not "bus" or "buses", in the About, For Transit Planners and For Researchers
//   pages' copy and their cards. styleGuard.test.ts checks those files' code; this checks their noticeCopy strings and
//   what the pages render. About's research story tiles are the stories' own words, so they are left out.

/** About five words, with room for a short joining word or two ("How Service Changed, Year by Year" has 6). */
const TITLE_MAX_WORDS = 7;
const words = (text: string) => text.trim().split(/\s+/).length;
const BUS = /\bbus(es)?\b/i;
const ATLAS = /\bAtlas\b/;

const PAGES = { PlannersPage, ResearchersPage };
const copyCards: FeatureCardCopy[] = [...Object.values(PLANNERS_COPY.cards), ...Object.values(RESEARCHERS_COPY.cards)];

/** The rendered feature cards: tinted sections with a heading (the Request a demo card included). */
const featureCards = (container: HTMLElement) =>
  [...container.querySelectorAll('section')].filter(s => s.querySelector('h2') && s.style.background);

describe('feature card copy (CIV-1793)', () => {
  it(`keeps every card title to ${TITLE_MAX_WORDS} words or fewer`, () => {
    for (const { title } of copyCards) expect([title, words(title) <= TITLE_MAX_WORDS]).toEqual([title, true]);
    for (const [name, Page] of Object.entries(PAGES)) {
      const titles = featureCards(render(<Page />).container).map(c => c.querySelector('h2')!.textContent!);
      expect(titles.length, name).toBeGreaterThan(0);
      for (const title of titles) expect([name, title, words(title) <= TITLE_MAX_WORDS]).toEqual([name, title, true]);
    }
  });

  it('never names Atlas in a card’s body text', () => {
    for (const { title, text } of copyCards) expect([title, ATLAS.test(text)]).toEqual([title, false]);
    for (const demo of [PLANNERS_COPY.demo, RESEARCHERS_COPY.demo]) expect([demo, ATLAS.test(demo)]).toEqual([demo, false]);
    for (const [name, Page] of Object.entries(PAGES)) {
      for (const card of featureCards(render(<Page />).container)) {
        const body = [...card.querySelectorAll('p')].map(p => p.textContent).join(' ');
        expect([name, card.querySelector('h2')!.textContent, ATLAS.test(body)]).toEqual([name, card.querySelector('h2')!.textContent, false]);
      }
    }
  });

  it('says "vehicles", not "bus" or "buses", in the pages’ and cards’ copy', () => {
    const strings = [
      ...copyCards.flatMap(c => [c.title, c.text]), PLANNERS_COPY.intro, PLANNERS_COPY.demo, RESEARCHERS_COPY.demo,
      ABOUT_HEADLINE, ATLAS_MAP_SUMMARY, ATLAS_INTRO_TEXT, DATA_SOURCE_TITLE, dataSourceText('1', 'Canada'), REQUEST_DEMO_LABEL,
    ];
    expect(strings.filter(s => BUS.test(s))).toEqual([]);
    for (const [name, Page] of Object.entries({ ...PAGES, AboutPage })) {
      const { container } = render(<Page />);
      for (const stories of container.querySelectorAll('[role="region"]')) stories.remove();
      expect([name, container.textContent!.match(BUS)?.[0] ?? null]).toEqual([name, null]);
    }
    expect(BUS.test('It also shows how many buses a frequency needs.')).toBe(true);
  });
});
