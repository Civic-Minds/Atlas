import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// The style guide's checkable rules (docs/style/TEXT.md and docs/style/VISUAL.md, each marked "(checked)"), run over
// every file in src/ and shared/. CIV-1237 started it, CIV-1238 added the retired "no regular service" and "one-off",
// CIV-1569 added the one-source checks (close X, search hints, dates, days, dashes, route and direction names), and
// CIV-1578 moved those here and added the rest. Comments may quote the old forms; only code counts.
// Rules not checked here, and why:
// - Checked by their own test or script: back links (backLinks.test.ts), curly apostrophes (curlyApostrophes.test.ts),
//   card wording (cardWording.test.ts), map overlay positions (npm run check:overlays, needs a running page).
// - Judgment, not a pattern: plain words, sentence case, no dark fills, less text, notice wording, "the" before
//   agency names, which shared component fits a job, chart and graphic style.
// - Process, not code: new wording needs Ryan's yes, visual changes are shown on localhost first.
// - Too broad to match safely: colours from CSS tokens (hex colours are legitimate in map styles and exports).
const ROOT = resolve(__dirname, '../../..');
const SCANNED = ['src', 'shared'];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : files(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const MONTH = '(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)';

type Rule = {
  /** What the rule forbids, read as "no <name>". */
  name: string;
  /** Where the rule is written. */
  doc: 'TEXT.md' | 'VISUAL.md';
  /** A line that breaks the rule. */
  pattern: RegExp;
  /** An example the pattern must catch. */
  slip: string;
  /** Lines that match `pattern` but are fine (e.g. a string being split on a dash). */
  skipLine?: RegExp;
  /** Only files whose path matches (e.g. Live code). */
  only?: RegExp;
  /** Files allowed to match: the one source that writes the text, or code names that spell the word. */
  allowed?: string[];
};

const RULES: Rule[] = [
  // Words
  // A whole word only, so code names such as noTimetableTrip don't count.
  { name: '"timetable" (say "schedule")', doc: 'TEXT.md', pattern: /\b[Tt]imetabled?\b/, slip: '<Fact label="Gaps off the timetable" />' },
  { name: '"steady" (say "consistent")', doc: 'TEXT.md', pattern: /\b[Ss]teady\b/, slip: "const t = 'Steady service';",
    allowed: ['shared/worstDirection.ts'] }, // the all-day pool's `steady` field
  // CIV-211, #933. The data value 'time-limited' is a code name.
  { name: '"Time-limited" (say "Part-time")', doc: 'TEXT.md', pattern: /\bTime-limited\b|\btime-limited (routes?|service)\b/, slip: "label: 'Time-limited routes'" },
  // CIV-1238 (Ryan): it read as if nothing runs.
  { name: '"no regular service" (say "Irregular" or "Runs irregularly in this period")', doc: 'TEXT.md', pattern: /\b[Nn]o regular service\b/, slip: "const label = 'no regular service';" },
  // CIV-1238 (Ryan): "one-off sounds like it only runs once per day".
  { name: '"one-off" for the hidden route class (say "occasional")', doc: 'TEXT.md', pattern: /\b[Oo]ne-off (routes?|service)\b/, slip: "'Hide one-off routes'" },
  // CIV-1251: "Shared stretch" is the only name for the shared part.
  { name: '"the shared section" (say "Shared stretch")', doc: 'TEXT.md', pattern: /\bthe shared section\b/i, slip: "'Buses run on the shared section'" },
  // CIV-1097, CIV-1451. "All days" (Live's kinds of day) is a different thing.
  { name: '"All day" (the map has no All day option)', doc: 'TEXT.md', pattern: /\bAll day\b(?!s)/, slip: "const PERIOD = 'All day';" },

  // Times (shared/timeText.ts)
  { name: 'a lowercase am/pm or a.m./p.m. (write "7 AM")', doc: 'TEXT.md', pattern: /\d ?(am|pm)\b|\b[ap]\.m\./, slip: "'Daily 6 a.m.–9 pm'" },
  { name: '":00" on the hour (write "7 AM")', doc: 'TEXT.md', pattern: /\d:00 ?(AM|PM)\b/, slip: "'Weekdays 7:00 AM–7 PM'" },
  { name: '"to" between two times (write "6–9 AM")', doc: 'TEXT.md', pattern: /\d ?(AM|PM) to \d/, slip: "'6 AM to 9 AM'" },
  { name: 'a hyphen in a range of times or minutes (use an en dash)', doc: 'TEXT.md', pattern: /\d-\d+ ?(AM|PM|min)\b/, slip: "'6-9 AM'" },

  // Frequencies (shared/headwayText.ts)
  { name: '"every N min" written by hand (use shared/headwayText.ts)', doc: 'TEXT.md', pattern: /every (\$\{[^}]*\}|\d+) ?min\b/, slip: '`every ${headway} min`',
    allowed: ['shared/headwayText.ts'] },
  // "minutes" only in the exact approved texts in APPROVED_TEXT.
  { name: '"every N minutes" as a frequency (write "every N min")', doc: 'TEXT.md', pattern: /every (\$\{[^}]*\}|\d+|\d+[–-]\d+)(\\u00A0| | )?minutes\b/, slip: "'Buses come every 15 minutes or better.'" },
  // #938: a column never mixes units.
  { name: 'a frequency in hours (write "every 90 min")', doc: 'TEXT.md', pattern: /every (\$\{[^}]*\}|\d+|\d+[–-]\d+)(\\u00A0| | )?(hours?|hrs?)\b/, slip: '`every ${h} hours`' },

  // One source per text (CIV-1569)
  { name: 'a close or clear name typed by hand (use closeLabel / CLEAR_SEARCH_LABEL)', doc: 'TEXT.md', pattern: /(aria-label|closeLabel|label)=["'{`]*['"`]?(Close|Clear search)\b/, slip: '<button aria-label="Close filters">' },
  // The report form's text box is not a search box; the top bar's input shows its hint in a span and has an empty placeholder.
  { name: 'a search hint typed in place (use searchPlaceholder in noticeCopy.ts)', doc: 'TEXT.md',
    pattern: /placeholder=["'](?!Describe what you saw and what you expected\.["']|["'])[^"']*["']|['"`>](Search|Find)( [^'"`<]*)?…/,
    slip: '<input placeholder="Search stops" />', allowed: ['src/content/noticeCopy.ts'] },
  { name: 'a "Month D, YYYY" date typed into the code (use shared/dateText.ts)', doc: 'TEXT.md', pattern: new RegExp(`\\b${MONTH} \\d{1,2}, 20\\d\\d\\b`), slip: "'Updated October 12, 2026'" },
  { name: 'a date formatted outside shared/dateText.ts (toLocaleDateString or a month list)', doc: 'TEXT.md', pattern: /toLocaleDateString|\['Jan', 'Feb'/, slip: 'd.toLocaleDateString()',
    allowed: ['shared/dateText.ts'] },
  { name: 'a day plural built by hand (use dayPlural / dayInSentence)', doc: 'TEXT.md', pattern: /\$\{(day|d|dayType)\}s\b|Saturday: ['"]Saturdays['"]|['"]Weekday['"] \? ['"]weekdays['"]/, slip: '`on ${day}s`',
    allowed: ['shared/dayTypes.ts'] },
  { name: 'a lone dash typed for an empty value (use MISSING_VALUE)', doc: 'TEXT.md', pattern: /['"`][—–]['"`]|>[—–]<|=["'][—–]["']/, slip: "value ?? '—'",
    skipLine: /\.(split|join|replace)\(/, allowed: ['shared/missingValue.ts'] },
  // format.ts holds the builders; cleanRouteDisplayName rewrites "Route 01" inside a feed's own name.
  { name: 'a "Route " + number built by hand (use routeShortLabel / withRouteWord)', doc: 'TEXT.md', pattern: /Routes? \$\{|['"]Routes? ['"] *\+|>Routes? \$\{/, slip: '`Route ${r.shortName}`',
    allowed: ['src/utils/format.ts'] },
  { name: 'a "Direction N" built by hand (use directionBranchFallback)', doc: 'TEXT.md', pattern: /Direction \$\{|['"]Direction ['"] *\+/, slip: '`Direction ${id + 1}`',
    allowed: ['shared/headsignDisplay.ts'] },

  // How Atlas looks
  { name: 'text set in capitals (uppercase class or textTransform)', doc: 'VISUAL.md', pattern: /\buppercase\b|textTransform/, slip: '<span className="uppercase">' },
  { name: 'wide letter spacing (tracking-wide or letterSpacing)', doc: 'VISUAL.md', pattern: /\btracking-wide(r|st)?\b|letterSpacing|letter-spacing/, slip: '<span className="tracking-wider">' },
  { name: 'a <table> outside DataTable', doc: 'VISUAL.md', pattern: /<table\b/, slip: '<table className="w-full">',
    allowed: ['src/components/ui/DataTable.tsx'] },
  { name: 'a shadow (keep the flat look)', doc: 'VISUAL.md', pattern: /\bshadow-(sm|md|lg|xl|2xl|inner)\b|\bshadow\b(?=[\s"'`])|boxShadow|box-shadow/, slip: '<div className="rounded-lg shadow-md">' },
  // CIV-1569 part 3: every close X is PanelCloseButton, every search box's clear X is SearchClearButton.
  { name: 'an X icon outside PanelCloseButton and SearchClearButton', doc: 'VISUAL.md', pattern: /<X\b|\bX as \w+|import \{[^}]*\bX\b[^}]*\} from 'lucide-react'/, slip: "import { Search, X } from 'lucide-react';",
    allowed: ['src/components/ui/PanelHeader.tsx', 'src/components/ui/SearchClearButton.tsx'] },
  // Commit 697af467: Live pages offer no CSV downloads.
  { name: 'a CSV download in Live code', doc: 'VISUAL.md', pattern: /\bCSV\b|\.csv\b|text\/csv/i, slip: "'Download CSV'", only: /(^|\/)[Ll]ive[^/]*$|\/Live\// },
];

// Files with a known slip not fixed yet, by rule: new wording waiting on Ryan's word-for-word OK, or old code waiting
// on its own cleanup item. Every other file is still checked. Remove each entry once its file is fixed (a test below
// fails when an entry no longer has its slip).
const PENDING: Record<string, string[]> = {
  'a shadow (keep the flat look)': [
    'src/LiveToolPage.tsx',
    'src/components/Interval/map/useLiveVehiclesLayer.ts',
    'src/components/Live/MapCard.tsx',
    'src/components/Live/RouteStrip.tsx',
    'src/components/Live/tool/OverviewList.tsx',
    'src/components/charts/TileMap.tsx',
    'src/lib/mapHtml.ts',
  ],
};

// Exact texts Ryan approved word for word, or quotes of an agency's own words, that keep "minutes". Each is removed
// from its file before the rules run, so only that exact text passes.
const APPROVED_TEXT: Record<string, string[]> = {
  // The frequent-service story quoting agencies' definitions.
  'src/apps/FrequentServiceStory.tsx': ['“every 15 minutes or better”', '“every 15–20 minutes”'],
};

// Block comments, and line comments that don't start inside a string or a URL.
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\w])\/\/.*$/gm, '$1');

const breaks = (rule: Rule, line: string) => rule.pattern.test(line) && !rule.skipLine?.test(line);

describe('UI code follows the style guide (docs/style/TEXT.md, docs/style/VISUAL.md)', () => {
  const sources = SCANNED.flatMap(dir => files(join(ROOT, dir))).map(f => {
    const name = relative(ROOT, f);
    const text = (APPROVED_TEXT[name] ?? []).reduce((src, approved) => src.split(approved).join(''), readFileSync(f, 'utf8'));
    return [name, code(text).split('\n')] as const;
  });

  for (const rule of RULES) {
    it(`no ${rule.name} (${rule.doc})`, () => {
      const skip = new Set([...(PENDING[rule.name] ?? []), ...(rule.allowed ?? [])]);
      const offenders = sources
        .filter(([f]) => (!rule.only || rule.only.test(f)) && !skip.has(f))
        .flatMap(([f, lines]) => lines.filter(line => breaks(rule, line)).map(line => `${f}: ${line.trim().slice(0, 120)}`));
      expect(offenders).toEqual([]);
    });
  }

  it('every approved text is still in its file, word for word', () => {
    for (const [f, texts] of Object.entries(APPROVED_TEXT)) {
      const src = readFileSync(join(ROOT, f), 'utf8');
      for (const text of texts) expect([f, text, src.includes(text)]).toEqual([f, text, true]);
    }
  });

  it('every pending entry still has its slip (remove it once fixed)', () => {
    for (const [name, pending] of Object.entries(PENDING)) {
      const rule = RULES.find(r => r.name === name)!;
      for (const f of pending) {
        const lines = sources.find(([s]) => s === f)?.[1] ?? [];
        expect([f, lines.some(line => breaks(rule, line))]).toEqual([f, true]);
      }
    }
  });

  it('each rule catches its slip, and leaves code names and the right forms alone', () => {
    for (const rule of RULES) expect([rule.name, breaks(rule, rule.slip)]).toEqual([rule.name, true]);
    const fine = [
      'lo.noTimetableTrip', 'isSteadyInAnyPeriod', "'6–9 AM'", "'11 AM–3 PM'", 'headwayEvery(10)', "'15 minutes'",
      "'Mon–Fri 5:30 AM–8 PM'", "'Irregular'", "'Hide occasional routes'", 'isOneOffTrip', "'Part-time routes'",
      "serviceClass === 'time-limited'", "'Shared stretch'", "'90 min'", "'tracking-normal'", '<DataTable rows={r} />',
      "'All days'", 'closeLabel(CLOSE_PLACES.filters)', 'placeholder={SEARCH_ROUTES_PLACEHOLDER}', 'shortDate(iso)',
      'dayPlural(day)', "label.split('–')", 'routeShortLabel(route)', 'directionBranchFallback(dir)', '<PanelCloseButton />',
    ];
    for (const rule of RULES) for (const text of fine) expect([rule.name, text, breaks(rule, text)]).toEqual([rule.name, text, false]);
    const csv = RULES.find(r => r.name === 'a CSV download in Live code')!.only!;
    expect(['src/components/Live/RouteStrip.tsx', 'src/LiveToolPage.tsx', 'src/apps/Interval.tsx'].map(f => csv.test(f))).toEqual([true, true, false]);
  });
});

// TEXT.md, Docs: Markdown docs use plain text. A one-word heading in capitals is a name (GTHA, SEPTA), not all-caps.
describe('docs follow the style guide (docs/style/TEXT.md, Docs)', () => {
  const docs = (dir: string): string[] => readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? docs(path) : name.endsWith('.md') ? [path] : [];
  });
  const headings = docs(join(ROOT, 'docs')).flatMap(f => {
    let fenced = false;
    return readFileSync(f, 'utf8').split('\n').flatMap((line, i) => {
      if (line.startsWith('```')) fenced = !fenced;
      return !fenced && /^#{1,6} /.test(line) ? [{ at: `${relative(ROOT, f)}:${i + 1}`, text: line.replace(/^#+ /, '').trim() }] : [];
    });
  });
  const emoji = /\p{Extended_Pictographic}/u;
  const allCaps = (text: string) => !/[a-z]/.test(text) && (text.match(/[A-Z]{2,}/g) ?? []).length >= 2;

  it('no emoji in headings', () => {
    expect(headings.filter(h => emoji.test(h.text)).map(h => `${h.at}: ${h.text}`)).toEqual([]);
  });

  it('no all-caps headings', () => {
    expect(headings.filter(h => allCaps(h.text)).map(h => `${h.at}: ${h.text}`)).toEqual([]);
    expect([allCaps('HOW IT WORKS'), allCaps('GTHA'), allCaps('SEPTA pilot'), emoji.test('Setup 🚀')]).toEqual([true, false, false, true]);
  });
});
