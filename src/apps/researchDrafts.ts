import React from 'react';
import { Plane } from 'lucide-react';
import type { ResearchEntry } from '../data/research';

/**
 * A research story still being built: main.tsx registers its route and the /research index shows its card with a "Draft" tag,
 * both on the dev server only (CIV-1550). A new draft is added here once; when it is published it moves to RESEARCH.
 */
export interface ResearchDraft extends Pick<ResearchEntry, 'href' | 'Icon' | 'kind' | 'title'> {
  Component: React.ComponentType;
}

// The whole list sits behind import.meta.env.DEV, so a built bundle has no draft route, card or page chunk at all.
export const RESEARCH_DRAFTS: readonly ResearchDraft[] = import.meta.env.DEV
  ? [
      {
        href: '/research/airports/story',
        Icon: Plane,
        kind: 'Story',
        // The page's heading is still a placeholder for Ryan's wording, so the card uses the page's working name.
        title: 'Airport story',
        Component: React.lazy(() => import('./AirportStory')),
      },
    ]
  : [];
