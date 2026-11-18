/**
 * Every research story's text, one entry each (CIV-1629; Ryan, 2026-11-15: "Do we need to refactor each story bc each has
 * like a title and a social title and a card description and a on the page description etc etc etc", option 1).
 *
 * The /research card, the page's heading and intro, the browser tab, the link preview and the share picture's alt text all
 * read an entry here, so a story's words sit side by side and are typed once. They may still differ in wording. The page
 * code, src/data/research.ts (the cards), src/apps/researchDrafts.ts and shared/seo.ts read these; a test fails if any of
 * these texts is typed anywhere else (src/content/__tests__/researchStories.test.ts). Kept free of React and import.meta
 * so the SEO table and the prerender can load it.
 */
import { FEATURE_ROUTES } from './config';
import { FREQUENT_SERVICE_TITLE } from './frequentService';
import { SITE_NAME, tabTitle } from './pageNames';
import { titleCase } from './titleCase';
import { freeChildFareStats } from '../src/data/freeChildFares';

export interface ResearchStoryText {
  /** The page's address. */
  path: string;
  /** The /research card: its title, its line of text and its link (Ryan's wording per card, CIV-1205). */
  cardTitle: string;
  cardBody: string;
  cardLink: string;
  /** The page's heading (a map view's info panel heading). */
  heading: string;
  /** The paragraphs under the heading, given the page's live counts; a map view has none. */
  intro?: (counts: Record<string, number>) => string[];
  /** The browser tab, which is also the link preview's title (shared/seo.ts). */
  tabTitle: string;
  /** The search and link preview description. */
  description: string;
  /** The share picture's alt text, where the story has a share picture. */
  shareImageAlt?: string;
  /** Sentences that cite a source, in order: the text before the link, the link's words, its address and the text after. */
  sources?: readonly LinkedSentence[];
}

/** A sentence with one link in it: before + link + after, read as one sentence. */
export interface LinkedSentence {
  before: string;
  link: string;
  href: string;
  after: string;
}

const OVERNIGHT_TITLE = 'Overnight service';

export const OVERNIGHT_STORY: ResearchStoryText = {
  path: FEATURE_ROUTES.nightService,
  cardTitle: OVERNIGHT_TITLE,
  // A word joiner after the dash keeps "2–5 AM" on one line.
  cardBody: 'See which routes keep running from 2–⁠5 AM, and how often they come.',
  cardLink: 'Find routes running all night',
  heading: 'Which routes run overnight?',
  tabTitle: tabTitle(titleCase(OVERNIGHT_TITLE)),
  description: 'Find routes with consistent scheduled service from 2–5 AM.',
  shareImageAlt: OVERNIGHT_TITLE,
};

const FREQUENT_STORY_HEADING = 'What happens when you miss the bus?';

export const FREQUENT_SERVICE_STORY: ResearchStoryText = {
  path: FEATURE_ROUTES.frequentService.story,
  cardTitle: FREQUENT_SERVICE_TITLE,
  cardBody: 'What “frequent” means to each agency.',
  cardLink: 'Compare agency definitions',
  heading: FREQUENT_STORY_HEADING,
  intro: ({ agencies }) => [
    'Miss one when the next vehicle comes in 10 minutes? Annoying, but manageable. Miss one when the next one takes 30? That can change your whole trip.',
    'Transit maps show where routes go. Transit planning asks the harder questions: how often does service come and how long does it run?',
    `We checked how ${agencies} agencies define frequent service on their own websites, to show how those decisions turn a network of lines into service people can actually rely on.`,
  ],
  // The story's own headline is its tab (Ryan: left as written), so it keeps its own form rather than "<name> | Transit Atlas".
  tabTitle: `${FREQUENT_STORY_HEADING} ${SITE_NAME}`,
  description: 'A source-backed look at what frequent service means across transit networks.',
  shareImageAlt: FREQUENT_SERVICE_TITLE,
  // The chart paragraph's sources, after its counts: Walker 2011 and the TCQSM (Ryan approved, 2026-11-15), then two
  // studies (CIV-1626, Ryan approved word for word, 2026-11-17).
  sources: [
    { before: 'Transit planner ', link: 'Jarrett Walker', href: 'https://humantransit.org/2011/12/how-frequent-is-freedom.html', after: ' puts “the threshold of ‘high frequency’” at “around every 15 minutes all day.”' },
    { before: 'The industry’s ', link: 'planning manual', href: 'https://onlinepubs.trb.org/onlinepubs/tcrp/tcrp_rpt_165ch-05.pdf', after: ' says that at 10 minutes or better there is “no need for passengers to consult schedules.”' },
    { before: 'A ', link: '2021 study', href: 'https://arxiv.org/pdf/2002.02493', after: ' of bus routes in four US cities found that in three of them, “low-frequency routes are the most sensitive to changes in frequency.”' },
    { before: 'In Montréal, a ', link: '2024 study', href: 'https://tram.mcgill.ca/Research/Publications/STM_Elasticity_COVID.pdf', after: ' of 169 bus routes found that 10% fewer weekday trips meant 13% fewer riders, and the STM’s “10-Minute Max” frequent network shrank from 31 routes to 8 before it was dropped in January 2023.' },
  ],
};

const FREE_CHILD_FARES_TITLE = 'Free child fares';

export const FREE_CHILD_FARES_STORY: ResearchStoryText = {
  path: FEATURE_ROUTES.freeChildFares,
  cardTitle: FREE_CHILD_FARES_TITLE,
  cardBody: 'The age kids stop riding free.',
  cardLink: 'See which ages ride free',
  heading: FREE_CHILD_FARES_TITLE,
  intro: ({ peakAge, agencies }) => [
    `Where kids ride free, age ${peakAge} is the most common cutoff.`,
    'Most transit agencies let young children ride free. Where that free fare ends changes from one agency to the next.',
    `We read the official fare rules of ${agencies} transit agencies in Canada and the United States to find up to what age children ride free, and under what conditions.`,
  ],
  tabTitle: tabTitle(titleCase(FREE_CHILD_FARES_TITLE)),
  // The page's own agency count (CIV-1642: it read 697, the ledger's rows outside Canada and the US included).
  description: `See up to what age children ride free at ${freeChildFareStats.agencies} transit agencies.`,
  shareImageAlt: FREE_CHILD_FARES_TITLE,
};

/** A draft (dev server only, CIV-1550): its page and card read this too; no tab or preview until it's published. */
export const AIRPORT_STORY_DRAFT: Pick<ResearchStoryText, 'path' | 'cardTitle' | 'intro'> = {
  path: '/research/airports/story',
  // The page's heading is still a dev-only placeholder (AirportStory.tsx, CIV-1814 item 29), so the card uses the page's
  // working name.
  cardTitle: 'Airport story',
  intro: () => [
    'You land, walk out of the terminal and look for the bus. Whether one is coming depends on which airport you landed at, and when.',
    'We checked the 157 passenger airports in the cities Atlas covers in Canada and the United States. For each one, we counted the hours of the week when a bus or train leaves for downtown within an hour of landing.',
  ],
};

/** Every published story, and every draft: the guard test reads these. */
export const RESEARCH_STORIES: readonly ResearchStoryText[] = [OVERNIGHT_STORY, FREQUENT_SERVICE_STORY, FREE_CHILD_FARES_STORY];
export const RESEARCH_STORY_DRAFTS = [AIRPORT_STORY_DRAFT] as const;
