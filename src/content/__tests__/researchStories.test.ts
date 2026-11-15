import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AIRPORT_STORY_DRAFT, RESEARCH_STORIES, RESEARCH_STORY_DRAFTS, type ResearchStoryText } from '../../../shared/researchStories';
import { SEO_ROUTES } from '../../../shared/seo';
import { RESEARCH } from '../../data/research';
import { NIGHT_INFO_HEADING, NIGHT_LIST_TITLE } from '../researchRules';

// CIV-1629 (Ryan, option 1): each research story's words live in one entry in shared/researchStories.ts. The cards, the
// pages, the SEO table and the drafts read it; none of the texts may be typed anywhere else.
const ROOT = resolve(__dirname, '../../..');
const REGISTRY = 'shared/researchStories.ts';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : files(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/**
 * The same words in another role, each read from its own constant: the map's key and the Overnight list's back link say
 * "Overnight service" (noticeCopy's MAP_KEY_NIGHT, backLinks' NIGHT_LIST_PLACE, kept equal by backLinks.test.ts), and the
 * Frequent service map and its key name the view "Frequent service" (shared/frequentService.ts, which the registry reads).
 */
const SAME_WORDS_ELSEWHERE: Record<string, string[]> = {
  'Overnight service': ['src/content/noticeCopy.ts', 'src/content/backLinks.ts'],
  'Frequent service': ['shared/frequentService.ts'],
  // The draft map's console warning, for developers.
  'Airport story': ['src/components/AirportStoryMap.tsx'],
};

/** Every text an entry holds; an intro's fixed parts are its words between the counts. */
function texts(story: Partial<ResearchStoryText>): string[] {
  const fields = [story.cardTitle, story.cardBody, story.cardLink, story.heading, story.tabTitle, story.description, story.shareImageAlt];
  const intro = story.intro?.({ agencies: 9999, peakAge: 9999 }).flatMap(p => p.split('9999')) ?? [];
  return [...fields, ...intro].map(t => t?.trim()).filter((t): t is string => !!t && t.length >= 12);
}

describe('research stories: one entry holds every text (CIV-1629)', () => {
  it('no story text is typed anywhere but its entry', () => {
    const sources = [...files(join(ROOT, 'src')), ...files(join(ROOT, 'shared'))]
      // Only code counts: comments may name a story.
      .map(path => ({ path: relative(ROOT, path), text: readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1') }))
      .filter(f => f.path !== REGISTRY);
    const typed: string[] = [];
    for (const story of [...RESEARCH_STORIES, ...RESEARCH_STORY_DRAFTS]) {
      for (const t of texts(story)) {
        for (const f of sources) {
          if (!f.text.includes(t) || SAME_WORDS_ELSEWHERE[t]?.includes(f.path)) continue;
          typed.push(`${f.path}: ${t}`);
        }
      }
    }
    expect(typed).toEqual([]);
  });

  it('the cards, the SEO table and the Overnight panel read the entries', () => {
    for (const story of RESEARCH_STORIES) {
      const entry = RESEARCH.find(r => r.href === story.path);
      expect(entry, story.path).toMatchObject({ title: story.cardTitle, body: story.cardBody, linkText: story.cardLink });
      const seo = SEO_ROUTES.find(r => r.path === story.path)!;
      expect(seo, story.path).toMatchObject({ title: story.tabTitle, description: story.description });
      if (story.shareImageAlt) expect(seo.shareImage?.alt).toBe(story.shareImageAlt);
    }
    const overnight = RESEARCH_STORIES.find(s => s.path === '/research/night')!;
    expect(NIGHT_INFO_HEADING).toBe(overnight.heading);
    expect(NIGHT_LIST_TITLE).toBe(overnight.cardTitle);
    expect(AIRPORT_STORY_DRAFT.heading).toMatch(/^\[/);
  });
});
