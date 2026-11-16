import { FEATURES, FEATURE_ROUTES } from '../../shared/config';
import { PAGE_NAMES } from '../../shared/pageNames';

/** Studio's pages, in the order the nav lists them (CIV-1715). */
const STUDIO_PAGES = [
  { key: 'studioVehicles', href: FEATURE_ROUTES.studioVehicles, name: PAGE_NAMES.studioVehicles },
  { key: 'studioChanges', href: FEATURE_ROUTES.studioChanges, name: PAGE_NAMES.studioChanges },
] as const;
export type StudioPageKey = (typeof STUDIO_PAGES)[number]['key'];

/**
 * The row of links between Atlas Studio's pages (CIV-1715), above each page's title: the page open now is plain text,
 * the others are links. Local only, like the rest of Studio (FEATURES.studio).
 */
export default function StudioNav({ current }: { current: StudioPageKey }) {
  if (!FEATURES.studio) return null;
  return (
    <nav aria-label={PAGE_NAMES.studio} className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-sm font-bold text-[var(--text-muted)]">
      {STUDIO_PAGES.map(p => (p.key === current
        ? <span key={p.key} aria-current="page" className="text-[var(--text-primary)]">{p.name}</span>
        : <a key={p.key} href={p.href} className="hover:text-[var(--text-primary)]">{p.name}</a>))}
    </nav>
  );
}
