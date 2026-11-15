import { Moon, Ticket, Zap, type LucideIcon } from 'lucide-react';
import { FREE_CHILD_FARES_STORY, FREQUENT_SERVICE_STORY, OVERNIGHT_STORY, type ResearchStoryText } from '../../shared/researchStories';

/** One piece of Atlas research: the /research index lists them all, and the About page's "Explore our research" the newest (CIV-1205). */
export interface ResearchEntry {
  href: string;
  Icon: LucideIcon;
  /** The small label naming its kind of page (CIV-1167, Ryan's "Sure"). */
  kind: 'Map' | 'Story' | 'Data';
  title: string;
  body: string;
  /** The card's link text, Ryan's wording per card (CIV-1205). */
  linkText: string;
  /** When it was published (YYYY-MM-DD), for "newest first". */
  published: string;
  /**
   * Its share picture, as `${picture}-light.${pictureExt}` and `${picture}-dark.${pictureExt}` (CIV-1167): the About page's story tiles
   * show it (CIV-1206). Overnight is Ryan's pick 1 and Frequent his pick B4; Free child fares uses its own chart picture, also its link preview (Ryan, 2026-11-15).
   */
  picture: string;
  /** The picture's file type: 'svg' unless it is a photo ('png'). */
  pictureExt?: 'svg' | 'png';
}

/** A card's words and address, from the story's one entry (shared/researchStories.ts, CIV-1629). */
function card(story: ResearchStoryText): Pick<ResearchEntry, 'href' | 'title' | 'body' | 'linkText'> {
  return { href: story.path, title: story.cardTitle, body: story.cardBody, linkText: story.cardLink };
}

/** Every research page, in the /research index's order. A new page is added here and shows up on both pages. */
export const RESEARCH: readonly ResearchEntry[] = [
  {
    ...card(OVERNIGHT_STORY),
    Icon: Moon,
    kind: 'Map',
    published: '2026-08-15',
    picture: '/assets/research/share/night',
  },
  {
    ...card(FREQUENT_SERVICE_STORY),
    Icon: Zap,
    kind: 'Story',
    published: '2026-09-17',
    picture: '/assets/research/share/frequent',
    pictureExt: 'png',
  },
  {
    ...card(FREE_CHILD_FARES_STORY),
    Icon: Ticket,
    kind: 'Data',
    published: '2026-10-30',
    picture: '/assets/research/share/free-child-fares',
  },
];

/** The newest research, newest first. */
export function newestResearch(count: number, entries: readonly ResearchEntry[] = RESEARCH): ResearchEntry[] {
  return [...entries].sort((a, b) => b.published.localeCompare(a.published)).slice(0, count);
}
