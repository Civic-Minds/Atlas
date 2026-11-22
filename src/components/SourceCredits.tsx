import { useEffect, useMemo, useState } from 'react';
import LinkCard from './ui/LinkCard';
import AgencyName from './ui/AgencyName';
import ArrowLink from './ui/ArrowLink';
import { OutboundLink } from './OutboundLink';
import { agencyCredits } from '../utils/agencyCredits';
import { agencyNames, type AgencyNameInput } from '../utils/agencyName';
import { sourceCreditId } from '../utils/sourcesFocus';
import { MASSDOT_CREDIT_SHORT, MASSDOT_CREDIT_URL, MBTA_VEHICLES_CREDIT } from '../content/noticeCopy';
import { MASSDOT_CREDITED_SLUGS } from '../../shared/liveArchiveFeeds';

type Agency = Parameters<typeof agencyCredits>[0][number];

/** One credit in Schedule sources: the agency's pill, and what opens under it (the licence, linked, then any words it requires). */
interface SourceCredit { slug: string; label: { primary: string; secondary?: string }; link: { href: string; text: string } | null; words: string | null }

/**
 * About → Schedule sources' agency credits (CIV-461). Ryan, 2026-11-22: "The pill should just show the name of the agency
 * right then you click on it and it shows the license info". Each agency is one pill (LinkCard) with its name and place;
 * opening it shows the licence's name linked to the licence, then any wording the licence requires word for word.
 * MBTA's MassDOT credit is MBTA's pill (`massDot`, where Live is on). `focusSlug`/`focusN`: the map's credit pill asked
 * for this agency, so its pill opens and scrolls into view.
 */
export default function SourceCredits({ agencies, massDot, focusSlug, focusN }: { agencies: readonly Agency[]; massDot: boolean; focusSlug: string | null; focusN: number }) {
  const credits = useMemo<SourceCredit[]>(() => {
    const list: SourceCredit[] = agencyCredits(agencies).map(c => ({
      slug: c.slug, label: c.label, words: c.words,
      link: c.licenceName ? { href: c.url, text: c.licenceName } : null,
    }));
    if (massDot) {
      for (const slug of MASSDOT_CREDITED_SLUGS) {
        const a = agencies.find(x => x.slug === slug) as Exclude<AgencyNameInput, string> | undefined;
        list.push({ slug, label: a ? agencyNames(a).list : { primary: MASSDOT_CREDIT_SHORT }, words: MBTA_VEHICLES_CREDIT, link: { href: MASSDOT_CREDIT_URL, text: MASSDOT_CREDIT_SHORT } });
      }
    }
    return list.sort((a, b) => a.label.primary.localeCompare(b.label.primary) || (a.label.secondary ?? '').localeCompare(b.label.secondary ?? ''));
  }, [agencies, massDot]);

  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  // The map's credit pill named this agency: open its pill and bring it into view.
  useEffect(() => {
    if (!focusSlug) return;
    setOpen(prev => new Set(prev).add(focusSlug));
    const t = window.setTimeout(() => document.getElementById(sourceCreditId(focusSlug))?.scrollIntoView?.({ block: 'center' }), 0);
    return () => window.clearTimeout(t);
  }, [focusSlug, focusN]);

  const toggle = (slug: string) => setOpen(prev => {
    const next = new Set(prev);
    if (!next.delete(slug)) next.add(slug);
    return next;
  });

  return (
    <div className="space-y-2">
      {credits.map(c => {
        const isOpen = open.has(c.slug);
        const panelId = `${sourceCreditId(c.slug)}-licence`;
        return (
          <div key={c.slug} id={sourceCreditId(c.slug)}>
            <LinkCard as="button" icon="chevron" expanded={isOpen} aria-controls={panelId} onClick={() => toggle(c.slug)}>
              <AgencyName primary={c.label.primary} secondary={c.label.secondary} />
            </LinkCard>
            {isOpen && (
              <div id={panelId} className="px-3 pt-2 pb-1 space-y-1">
                {c.link && <ArrowLink as={OutboundLink} href={c.link.href} kind="attribution" tone="inline" size="xs" external wrap>{c.link.text}</ArrowLink>}
                {c.words && <p className="text-xs leading-relaxed text-[var(--text-dim)]">{c.words}</p>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
