import type { AgencyDataLicense } from '../../shared/agencyCatalog';
import { scheduleDataCredit } from '../content/noticeCopy';
import { agencyNames } from './agencyName';

/** One agency's data credit (CIV-461): its name for the map pill, its licence page, and the sentence it is credited with. */
export interface AgencyCredit {
  slug: string;
  name: string;
  /** The short name the map's pill shows ("SFMTA"). */
  shortName: string;
  url: string;
  text: string;
  /** The text is the licence's own sentence, which may not name the agency: About labels it with the agency's name. */
  ownWords: boolean;
}

type Credited = { slug: string; name: string; dataLicense?: AgencyDataLicense; lastRefreshedAt?: string | null };

/**
 * The credit an agency's data licence requires, read from its config (dataLicense): the licence's own sentence where it
 * gives one, else the MassDOT-style line, then its last-updated date where the licence asks for one. Null where the licence asks for none (or was not read).
 */
export function agencyCredit(a: Credited): AgencyCredit | null {
  const l = a.dataLicense;
  if (l?.attribution !== 'required') return null;
  const text = l.credit ?? scheduleDataCredit(a.name, l.name);
  // The licence asks for the data's last-updated date in its own words (STO): the day Atlas last took the feed.
  const updated = l.updatedLabel && a.lastRefreshedAt ? ` ${l.updatedLabel} ${a.lastRefreshedAt.slice(0, 10)}.` : '';
  return { slug: a.slug, name: a.name, shortName: agencyNames(a.name).short, url: l.url, text: `${text}${updated}`, ownWords: !!l.credit };
}

/** The credits for these agencies (all of them, or the slugs given), in the order given, each once. */
export function agencyCredits(agencies: readonly Credited[], slugs?: readonly string[]): AgencyCredit[] {
  const pick = slugs ? slugs.map(s => agencies.find(a => a.slug === s)).filter((a): a is Credited => !!a) : agencies;
  const out: AgencyCredit[] = [];
  const seen = new Set<string>();
  for (const a of pick) {
    const c = agencyCredit(a);
    if (c && !seen.has(c.slug)) { seen.add(c.slug); out.push(c); }
  }
  return out;
}
