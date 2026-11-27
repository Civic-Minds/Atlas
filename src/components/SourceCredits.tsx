import { useMemo } from 'react';
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

/** One credit in Schedule sources: the agency's name, and what its page shows (the licence, linked, then any words it requires). */
export interface SourceCredit { slug: string; label: { primary: string; secondary?: string }; link: { href: string; text: string } | null; words: string | null; feedLink?: { href: string; text: string } | null }

/** The credits Schedule sources lists, sorted by name. MBTA's MassDOT credit is MBTA's row (`massDot`, where Live is on). */
export function useSourceCredits(agencies: readonly Agency[], massDot: boolean): SourceCredit[] {
  return useMemo<SourceCredit[]>(() => {
    const list: SourceCredit[] = agencyCredits(agencies).map(c => ({
      slug: c.slug, label: c.label, words: c.words, feedLink: c.feedLink,
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
}

/**
 * About → Schedule sources' agency credits (CIV-461). Ryan, 2026-11-22: "The pill should just show the name of the agency
 * right then you click on it and it shows the license info". CIV-3119 (Ryan, 2026-11-27: "should the open as a "page" like
 * the other areasdo"): each agency is one row (LinkCard) that opens its own page in the panel, like About's other pages.
 */
export default function SourceCredits({ credits, onOpen }: { credits: readonly SourceCredit[]; onOpen: (slug: string) => void }) {
  return (
    <div className="space-y-2">
      {credits.map(c => (
        <div key={c.slug} id={sourceCreditId(c.slug)}>
          <LinkCard as="button" icon="chevron" onClick={() => onOpen(c.slug)}>
            <AgencyName primary={c.label.primary} secondary={c.label.secondary} />
          </LinkCard>
        </div>
      ))}
    </div>
  );
}

/** One agency's credit page: the licence's name linked to the licence, the feed link, then any wording it requires word for word. */
export function SourceCreditPage({ credit }: { credit: SourceCredit }) {
  return (
    <div className="space-y-2">
      {credit.link && <ArrowLink as={OutboundLink} href={credit.link.href} kind="attribution" tone="inline" size="xs" external wrap>{credit.link.text}</ArrowLink>}
      {credit.feedLink && <ArrowLink as={OutboundLink} href={credit.feedLink.href} kind="attribution" tone="inline" size="xs" external wrap>{credit.feedLink.text}</ArrowLink>}
      {credit.words && <p className="text-xs leading-relaxed text-[var(--text-dim)]">{credit.words}</p>}
    </div>
  );
}
