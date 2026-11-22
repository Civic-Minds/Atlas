import type { AgencyDataLicense } from '../../shared/agencyCatalog';
import { scheduleDataCredit } from '../content/noticeCopy';

/** One agency's data credit (CIV-461): its name for the map pill, its licence page, and the sentence it is credited with. */
export interface AgencyCredit {
  slug: string;
  name: string;
  url: string;
  text: string;
}

type Credited = { slug: string; name: string; dataLicense?: AgencyDataLicense };

/**
 * The credit an agency's data licence requires, read from its config (dataLicense): the licence's own sentence where it
 * gives one, else the MassDOT-style line. Null where the licence asks for none (or was not read).
 */
export function agencyCredit(a: Credited): AgencyCredit | null {
  const l = a.dataLicense;
  if (l?.attribution !== 'required') return null;
  return { slug: a.slug, name: a.name, url: l.url, text: l.credit ?? scheduleDataCredit(a.name, l.name) };
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
