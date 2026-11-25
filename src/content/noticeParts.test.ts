import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CARD_LINE_DRAFTS, CARD_LINE_PENDING, NOTICE_EXPLAINERS, NOTICE_PARTS, type NoticeSample } from './noticeCopy';

// CIV-2896 (Ryan, 2026-11-24): "Why do thesel iterally say the exact same thing", then "1": a card notice with Learn more
// gets a short line, and its Learn more page keeps the full sentence and adds what's new. The page never repeats the card.
const SAMPLES: NoticeSample[] = [
  { agencyName: 'Barrie Transit', date: 'Nov 3, 2026', ended: true, maxHeadway: 15, periodRange: '6–9 AM', overrideNote: 'Route 8’s Sunday trips were missing from the agency’s data; we added them back.' },
  { agencyName: 'TTC', date: 'Dec 1, 2026', ended: false, maxHeadway: 10, periodRange: '3–7 PM', overrideNote: 'We removed a duplicate trip.' },
];

const normalize = (text: string) => text.toLowerCase().replace(/[‘’]/g, "'").replace(/[⁠ ]/g, ' ').replace(/\s+/g, ' ').trim();
/** The card line without its subject ("Barrie Transit's", "This agency's"), so a page naming the agency still counts as repeating it. */
const cardCore = (card: string) => normalize(card).replace(/\.$/, '').replace(/^(?:[^ ]+ ){0,3}?[^ ]+'s /, '');
const repeats = (card: string, page: string) => cardCore(card).split(' ').length >= 3 && normalize(page).includes(cardCore(card));

const codes = Object.keys(NOTICE_PARTS) as (keyof typeof NOTICE_PARTS)[];

describe('Learn more pages never repeat their card line (CIV-2896)', () => {
  it('every Learn-more notice has a card part and a page part (N19: config text, none set)', () => {
    expect([...codes, 'N19'].sort()).toEqual(Object.keys(NOTICE_EXPLAINERS).sort());
  });

  it('only the notices still waiting for an approved short line repeat their page, and they all still do', () => {
    for (const s of SAMPLES) {
      const repeating = codes.filter(code => repeats(NOTICE_PARTS[code].card(s), NOTICE_PARTS[code].page(s)));
      expect(repeating.sort()).toEqual([...CARD_LINE_PENDING].sort());
    }
  });

  it('every pending notice has a drafted short line, and no draft repeats its page', () => {
    for (const code of CARD_LINE_PENDING) expect(CARD_LINE_DRAFTS[code], code).toBeTypeOf('function');
    for (const s of SAMPLES) {
      for (const [code, draft] of Object.entries(CARD_LINE_DRAFTS)) {
        const page = NOTICE_PARTS[code as keyof typeof NOTICE_PARTS].page(s);
        expect(repeats(draft!(s), page), `${code}: ${draft!(s)}`).toBe(false);
        expect(draft!(s).length, code).toBeLessThan(NOTICE_PARTS[code as keyof typeof NOTICE_PARTS].card(s).length);
      }
    }
  });

  it('the Learn more panel builds its leads from the page parts, never from a card line', () => {
    const panel = readFileSync(resolve(__dirname, '../components/InfoPanel.tsx'), 'utf8');
    for (const card of ['expiredFeedNotice', 'officialDataOnlyNotice', 'NO_ROUTE_SHAPE_NOTICE', 'FIRST_LAST_TRIP_ALLOWANCE_HINT', 'WEEKDAY_VARIATION_NOTICE', 'listingEndedNotice', 'NEW_SCHEDULE_DATA_NOTICE', 'CORRECTED_DATA_NOTICE']) {
      expect(panel, card).not.toMatch(new RegExp(`\\b${card}\\b`));
    }
  });

  it('the route card opens Route rating with the full sentence, not its card line', () => {
    const card = readFileSync(resolve(__dirname, '../components/Interval/panels/RouteCardHeadway.tsx'), 'utf8');
    expect(card).toMatch(/filterNotice: notices\.filter!\.pageText/);
  });
});
