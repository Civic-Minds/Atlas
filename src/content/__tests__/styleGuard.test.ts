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
  { name: '"no regular service" (say "Irregular" or "Runs irregularly in this period")', doc: 'TEXT.md', pattern: /\b[Nn]o regular\b/, slip: "const label = 'no regular service';" },
  // CIV-1238 (Ryan): "one-off sounds like it only runs once per day".
  { name: '"one-off" for the hidden route class (say "occasional")', doc: 'TEXT.md', pattern: /\b[Oo]ne-off (routes?|service)\b/, slip: "'Hide one-off routes'" },
  // CIV-1251: "Shared stretch" is the only name for the shared part.
  { name: '"the shared section" or "shared-section" (say "Shared stretch")', doc: 'TEXT.md', pattern: /\b(the shared section|shared-section)\b/i, slip: "'Buses run on the shared section'" },
  // CIV-1610 (Ryan): Canadian spelling. Only words that are never code names are checked ("color" is a CSS word).
  { name: 'US spelling (write analysed, coloured, labelled, cancelled, neighbour, favourite, catalogue)', doc: 'TEXT.md', pattern: /\b(analyz(ed|es|ing)|[Cc]olored|[Cc]oloring|[Ll]abeled|[Ll]abeling|[Cc]anceled|[Nn]eighbors?|[Nn]eighborhoods?|[Ff]avorites?)\b|(?<=[a-z] )catalogs?(?= [a-z]|[.,])/, slip: "'Routes are analyzed by period'" },
  // CIV-1610 (Ryan): no comma before the "and" or "or" that ends a list. "stop by stop" is an aside, not a list, and in
  // CIV-1733's intro (Ryan's exact text) ", and see" starts a second verb, not the end of a list.
  { name: 'a comma before the "and" or "or" that ends a list', doc: 'TEXT.md', pattern: /[a-z]+, [A-Za-z’-]+(?: [A-Za-z’-]+){0,3}, (and|or) [a-z]/, slip: "'See what runs in the morning, evening, or overnight.'", skipLine: /stop by stop, and|and modes, and see the patterns/ },
  // CIV-1697 (Ryan): "Docs" on links, heading and tab, from one constant.
  { name: 'the Docs page named by hand (use DOCS_PAGE_TITLE, from PAGE_NAMES)', doc: 'TEXT.md', pattern: />(Docs|Documentation)<\/|label: 'Docs'/, slip: '<a href="/about/docs">Docs</a>' },
  // CIV-1097, CIV-1451. "All days" (Live's kinds of day) is a different thing, and so is the code name 'all-day-summary'.
  // CIV-1613: lowercase and "all-day" too ("or else all day" slipped through); the Docs page says "across the day" (Ryan, CIV-1610).
  { name: '"All day" (the map has no All day option)', doc: 'TEXT.md', pattern: /\b[Aa]ll[-  ][Dd]ay\b(?![s-])/, slip: "'borrow an all-day average'" },
  // CIV-1614 (Ryan): a metro area is an "area"; "region" is only a state or province.
  { name: '"region" for a metro area (say "area")', doc: 'TEXT.md', pattern: /\b(city|metro) regions?\b|\b(agencies|transit agencies) and regions\b|\bRegions include\b/, slip: "'every agency in a city region'" },

  // CIV-1793 (Ryan): "vehicles", not "buses", on the About, For Transit Planners and For Researchers pages and their cards
  // ("it's not just buses"). Their noticeCopy strings are checked in featureCardCopy.test.tsx.
  { name: '"bus" or "buses" in page or card copy (say "vehicles")', doc: 'TEXT.md', pattern: /\bbus(es)?\b/i, slip: "<p>It shows how many buses a frequency needs.</p>",
    only: /^src\/(AboutPage|PlannersPage|ResearchersPage|components\/(FeatureCard|RequestDemoCard|FeaturePageSections))\.tsx$/ },
  // CIV-1792 (Ryan, CIV-1751, CIV-1733): no "what Atlas isn't" disclaimers. Say what Atlas does. Legal pages may.
  { name: 'a "what Atlas isn’t" disclaimer (say what Atlas does)', doc: 'TEXT.md', pattern: /\b(not a trip planner|trip planning|live alerts|not live arrivals|not real-time|can be wrong|does(?: not|n[’']t) (replace|do)\b|Atlas (is not|isn[’']t) an?\b)/i, slip: "'Atlas is not a trip planner.'",
    allowed: ['src/LegalPage.tsx'] },

  // Times (shared/timeText.ts)
  { name: 'a lowercase am/pm or a.m./p.m. (write "7 AM")', doc: 'TEXT.md', pattern: /\d ?(am|pm)\b|\b[ap]\.m\./, slip: "'Daily 6 a.m.–9 pm'" },
  { name: '":00" on the hour (write "7 AM")', doc: 'TEXT.md', pattern: /\d:00 ?(AM|PM)\b/, slip: "'Weekdays 7:00 AM–7 PM'" },
  { name: '"to" between two times (write "6–9 AM")', doc: 'TEXT.md', pattern: /\d ?(AM|PM) to \d/, slip: "'6 AM to 9 AM'" },
  { name: 'a hyphen in a range of times or minutes (use an en dash)', doc: 'TEXT.md', pattern: /\d-\d+ ?(AM|PM|min)\b/, slip: "'6-9 AM'" },

  // Frequencies (shared/headwayText.ts)
  { name: '"every N min" written by hand (use shared/headwayText.ts)', doc: 'TEXT.md', pattern: /every (\$\{[^}]*\}|\d+)([–-](\$\{[^}]*\}|\d+))? ?min\b/, slip: '“every 8–25 min”',
    allowed: ['shared/headwayText.ts'] },
  // "minutes" only in the exact approved texts in APPROVED_TEXT.
  // CIV-1613: also "Every", "every 10 or 15 minutes" and "15-minute"; the TTC's own "5-minute standard" is its name for a rule.
  { name: '"every N minutes" as a frequency (write "every N min")', doc: 'TEXT.md', pattern: /(\d|\})(-| | )minute\b(?! standard)|[Ee]very (\$\{[^}]*\}|\d+|\d+[–-]\d+|\d+ or \d+)(\\u00A0| | )?minutes\b/, slip: "'Buses come every 15 minutes or better.'" },
  // #938: a column never mixes units.
  { name: 'a frequency in hours (write "every 90 min")', doc: 'TEXT.md', pattern: /every (\$\{[^}]*\}|\d+|\d+[–-]\d+)(\\u00A0| | )?(hours?|hrs?)\b/, slip: '`every ${h} hours`' },

  // Numbers (shared/numberText.ts, CIV-1587). Coordinates in links and reports are machine values, not UI numbers.
  { name: 'a number formatted outside shared/numberText.ts (toLocaleString or Intl.NumberFormat)', doc: 'TEXT.md', pattern: /\.toLocaleString\(|Intl\.NumberFormat/, slip: '`${n.toLocaleString()} trips`',
    skipLine: /timeZone/, allowed: ['shared/numberText.ts'] }, // liveVehicleDelay reads a clock in a time zone, not a number
  { name: 'a decimal formatted outside shared/numberText.ts (toFixed)', doc: 'TEXT.md', pattern: /\.toFixed\(/, slip: '`${density.toFixed(1)} per km²`',
    skipLine: /\b(lat|lon|bounds|zoom)\b|\.[nsew]\.toFixed|key: 'z'/, allowed: ['shared/numberText.ts'] },
  // CIV-1590: distances, speeds and densities from shared/unitText.ts.
  { name: 'a distance or speed unit written by hand (use metresText / speedText)', doc: 'TEXT.md', pattern: /(\}|(?<![\w.])\d+)(\s|\\u00A0)?(m|km|km\/h|mph|mi|ft|km²|m²|miles?)(?=[\s'"`<,.)]|$)/, slip: "'No routes within 500 m.'",
    allowed: ['shared/unitText.ts'] },
  { name: 'a percent built by hand (use percentText)', doc: 'TEXT.md', pattern: /Math\.round\([^`]*\*\s*100\)\}?\s*%/, slip: '{Math.round((a / b) * 100)}%',
    allowed: ['shared/numberText.ts'] },

  // One source per text (CIV-1569)
  { name: 'a close or clear name typed by hand (use closeLabel / CLEAR_SEARCH_LABEL)', doc: 'TEXT.md', pattern: /(aria-label|closeLabel|label)=["'{`]*['"`]?(Close|Clear search)\b/, slip: '<button aria-label="Close filters">' },
  // The report form's text box is not a search box; the top bar's input shows its hint in a span and has an empty placeholder.
  { name: 'a search hint typed in place (use searchPlaceholder in noticeCopy.ts)', doc: 'TEXT.md',
    pattern: /placeholder=["'](?!Describe what you saw and what you expected\.["']|["'])[^"']*["']|['"`>](Search|Find)( [^'"`<]*)?…/,
    slip: '<input placeholder="Search stops" />', allowed: ['src/content/noticeCopy.ts'] },
  // CIV-1613: also "November 2026" and "October 30" with no year.
  { name: 'a "Month D, YYYY" date typed into the code (use shared/dateText.ts)', doc: 'TEXT.md', pattern: new RegExp(`\\b${MONTH} \\d{1,2}, 20\\d\\d\\b|\\b${MONTH} 20\\d\\d\\b|\\b${MONTH} \\d{1,2}\\b(?=,? |\\.| and)`), slip: "month: 'November 2026'" },
  { name: 'a date formatted outside shared/dateText.ts (toLocaleDateString or a month list)', doc: 'TEXT.md', pattern: /toLocaleDateString|\['Jan', 'Feb'/, slip: 'd.toLocaleDateString()',
    allowed: ['shared/dateText.ts'] },
  { name: 'a day plural built by hand (use dayPlural / dayInSentence)', doc: 'TEXT.md', pattern: /\$\{(day|d|dayType)\}s\b|Saturday: ['"]Saturdays['"]|['"]Weekday['"] \? ['"]weekdays['"]/, slip: '`on ${day}s`',
    allowed: ['shared/dayTypes.ts'] },
  { name: 'a lone dash typed for an empty value (use MISSING_VALUE)', doc: 'TEXT.md', pattern: /['"`][—–]['"`]|>[—–]<|=["'][—–]["']/, slip: "value ?? '—'",
    skipLine: /\.(split|join|replace)\(/, allowed: ['shared/missingValue.ts'] },
  // format.ts holds the builders; cleanRouteDisplayName rewrites "Route 01" inside a feed's own name.
  { name: 'a "Route " + number built by hand (use routeShortLabel / withRouteWord)', doc: 'TEXT.md', pattern: /[Rr]outes? \$\{(?!(ended|count|plural|headway))|['"][Rr]outes? ['"] *\+|>[Rr]outes? \$\{/, slip: '`Live has no route ${route}`',
    // CIV-1613: lowercase "route ${…}" too. A long-name comparison and a file-name slug aren't text.
    skipLine: /lowerLong ===|parts\.push\(`route/, allowed: ['src/utils/format.ts'] },
  // "One way" / "Other way" / "Pattern N" were the schedule pills' own unnamed-direction names (fixed with Live's made-up
  // "Outbound"/"Inbound"); an agency's real "Outbound" label is a name, so only the made-up pill words are flagged.
  { name: 'a "Direction N" or other unnamed-direction name built by hand (use directionBranchFallback)', doc: 'TEXT.md', pattern: /Direction \$\{|['"]Direction ['"] *\+|['"](One way|Other way)['"]|`Pattern \$\{/, slip: '`Direction ${id + 1}`',
    allowed: ['shared/headsignDisplay.ts'] },

  // CIV-1591: cards hide and pre-check report reasons by REPORT_REASON (src/components/Interval/cardUi.tsx), never a typed string.
  { name: 'a report reason typed as a string (use REPORT_REASON)', doc: 'TEXT.md', pattern: /excludeReasons=\{\[[^\]]*['"]|\breason=["']/, slip: '<FlaggableValue reason="Frequency is wrong" />' },
  // CIV-1592: one distance between two points (shared/geoDistance.ts). Not a style rule, but the same kind of one-source
  // check: the haversine sum, a metres-per-degree constant or the earth's radius anywhere else is a second distance function or
  // projection (CIV-1597).
  { name: 'a distance or projection of its own (use metresBetween / projectOntoSegment from shared/geoDistance.ts)', doc: 'TEXT.md',
    pattern: /\*\* 2 \+\s*Math\.cos|(?<![\d.])(111_?(000|111|195|320)|110_?540|40_?07[05]_?0\d\d|6_?371_?000|6_?378_?137)(?![\d])/, slip: 'const maxDLat = OPPOSITE_STOP_MAX_M / 111000;',
    allowed: ['shared/geoDistance.ts'] },
  // CIV-1593: "1 route" / "3 routes" come from plural / countOf (shared/overflowText.ts).
  { name: 'a plural built by hand (use plural / countOf)', doc: 'TEXT.md', pattern: /===\s*1\s*\?\s*(['"])[\w ’']*\1\s*:\s*(['"])[\w ’']*\2|===\s*1\s*\?\s*''\s*:\s*'s'/, slip: "`${n} ${n === 1 ? 'agency' : 'agencies'}`",
    allowed: ['shared/overflowText.ts'] },

  // CIV-1594, CIV-1703: every in-page link to the map reads MAP_LINK ("Try Atlas") from noticeCopy.ts; the old wordings are caught too.
  // The shared header keeps Ryan's own "Go to Atlas" (#1509).
  { name: 'a map link typed in place (use MAP_LINK)', doc: 'TEXT.md', pattern: /Try Atlas|Open the (Atlas )?map/, slip: '<ArrowLink href="/">Open the map</ArrowLink>',
    allowed: ['src/content/noticeCopy.ts'] },
  // CIV-1599: labels used in more than one place come from noticeCopy.ts (and report detail labels from reportIssue.ts).
  // CIV-1803: the Live week table's two columns too.
  { name: 'a shared label typed in place (use its noticeCopy.ts constant)', doc: 'TEXT.md',
    pattern: /['"`>](View on map|See all agencies|What’s [Nn]ew|Documentation|Atlas by Civic Minds|Export map image|Go to my location|Overnight service on part of the route|About Atlas|Transit frequency|Frequent service|Service history|Live transit|Agency slug|Agency data refreshed|Feed expiry|This week|Last week)['"`<]/,
    slip: '<ArrowLink href="/">View on map</ArrowLink>', allowed: ['src/content/noticeCopy.ts', 'src/content/backLinks.ts', 'src/utils/reportIssue.ts', 'shared/frequentService.ts', 'shared/pageNames.ts'] },

  // CIV-1790 (Ryan: "Did we refactor our contact info"): one address, one mailto builder.
  { name: 'the contact address typed by hand (use CONTACT_EMAIL or mailto from shared/contact.ts)', doc: 'TEXT.md', pattern: /ryanisnota\.pro/, slip: "href=\"mailto:hey@ryanisnota.pro\"",
    allowed: ['shared/contact.ts'] },
  // CIV-1615: each fixed page's path is one constant in shared/pagePaths.ts, read by its route, prerender, SEO entry and links.
  { name: 'a page path typed by hand (use shared/pagePaths.ts)', doc: 'TEXT.md',
    pattern: /['"`](\/about|\/about\/docs|\/agencies|\/changelog|\/terms|\/privacy|\/apps\/live|\/research)['"`]/, slip: '<a href="/about/docs">',
    allowed: ['shared/pagePaths.ts'] },
  // A research page's own path is one constant too: FEATURE_ROUTES in shared/config.ts (a draft story's in shared/researchStories.ts).
  { name: 'a research page path typed by hand (use FEATURE_ROUTES in shared/config.ts)', doc: 'TEXT.md',
    pattern: /['"`]\/research(\/[a-z][a-z-]*)+['"`]/, slip: '<Route path="/research/free-child-fares" />',
    allowed: ['shared/config.ts', 'shared/researchStories.ts'] },

  // How Atlas looks
  { name: 'text set in capitals (uppercase class or textTransform)', doc: 'VISUAL.md', pattern: /\buppercase\b|textTransform/, slip: '<span className="uppercase">' },
  { name: 'wide letter spacing (tracking-wide or letterSpacing)', doc: 'VISUAL.md', pattern: /\btracking-wide(r|st)?\b|letterSpacing|letter-spacing/, slip: '<span className="tracking-wider">' },
  { name: 'a <table> outside DataTable', doc: 'VISUAL.md', pattern: /<table\b/, slip: '<table className="w-full">',
    allowed: ['src/components/ui/DataTable.tsx'] },
  // Ryan, 2026-11-15: normal (proportional) digits everywhere, charts included.
  { name: 'fixed-width digits (tabular-nums or font-variant-numeric)', doc: 'VISUAL.md', pattern: /\btabular-nums\b|font-variant-numeric|fontVariantNumeric|['"]tnum['"]/, slip: '<span className="tabular-nums">' },
  { name: 'a shadow (keep the flat look)', doc: 'VISUAL.md', pattern: /\bshadow-(sm|md|lg|xl|2xl|inner)\b|\bshadow\b(?=[\s"'`])|boxShadow|box-shadow/, slip: '<div className="rounded-lg shadow-md">' },
  // CIV-1607: every pill search box is SearchBox, so each has the clear X; the top bar's box (App.tsx) is the one exception.
  { name: 'a search box built by hand (use SearchBox)', doc: 'VISUAL.md', pattern: /className=\{SEARCH_(FIELD|PILL)\}|<Search className=\{SEARCH_ICON\}/, slip: '<input className={SEARCH_FIELD} />',
    allowed: ['src/components/ui/SearchBox.tsx'] },
  // CIV-1569 part 3: every close X is PanelCloseButton, every search box's clear X is SearchClearButton.
  { name: 'an X icon outside PanelCloseButton and SearchClearButton', doc: 'VISUAL.md', pattern: /<X\b|\bX as \w+|import \{[^}]*\bX\b[^}]*\} from 'lucide-react'/, slip: "import { Search, X } from 'lucide-react';",
    allowed: ['src/components/ui/PanelHeader.tsx', 'src/components/ui/SearchClearButton.tsx'] },
  // CIV-1596, CIV-1601: Live's measure and section names, and its words used in more than one place, are written once, in shared/liveWording.ts.
  { name: 'a Live measure or section name typed by hand (use its constant in shared/liveWording.ts)', doc: 'TEXT.md',
    pattern: /(["'`])(Late|Extra wait|Bunching|Delivered|Service delivered|Trip time|Typical delay|Usually adds|Time lost|Stops most often late|This week compared with last week|Where bunching forms|Along the route|Trips where it grows|Stretch that adds the most|By time of day|Late departures by hour|Where delays start|Bunching forms|How this is measured|On time|Not measured|not measured|Delay not measured|Fewer location reports|1 in 10 leave|Open Live|View on Live map|Both directions|Direction|Time of day|Also measured in this stretch|High|Low|Short turn|Too close together|Too far apart|Too close or too far apart|Close to the cutoff|Agency figures)\1/,
    slip: '<Section title="Stops most often late">', only: /(^|\/)[Ll]ive[^/]*$|\/Live\//, allowed: ['shared/liveWording.ts'] },
  // CIV-1602: Ryan's picks, "Delays start" (never "Delay starts") and "Live vehicles" (never "Live transit"), written once in shared/liveWording.ts.
  { name: 'the Live delay-start or Live map name typed by hand (use DELAY_STARTS_LABEL or LIVE_VEHICLES_TITLE in shared/liveWording.ts)', doc: 'TEXT.md',
    pattern: /(["'`])(Delays? starts?|Live vehicles|Live transit)\1/, slip: "label: 'Delay starts'", allowed: ['shared/liveWording.ts'] },
  // CIV-1774 (Ryan, 2026-11-16: "in one place only for grammar reasons /branding"): a button, link, tag, heading, control
  // label or table column typed into a component. Its words go in noticeCopy (or PAGE_NAMES); Live's too since CIV-1781.
  // Long-form story and Docs headings are prose, not labels.
  { name: 'a UI label typed into a component (put its words in noticeCopy or PAGE_NAMES)', doc: 'TEXT.md',
    pattern: /<(button|a|ArrowLink|Pill|Tag|SectionTitle|SubsectionTitle)\b[^>{]*>\s*[A-Z][^<{}]*<\/|\b(label|aria-label|ariaLabel|linkLabel|title)=["'][A-Z]|\bheader: ['"][A-Z]/,
    slip: '<ArrowLink href="/">Go to Atlas</ArrowLink>',
    only: /^src\/(?!.*(Diagnostics|FrequentService|FreeChildFares|AirportStory|AboutDocsPage)).*\.tsx$/ },
  // CIV-1789: every card is the base Card (components/ui/Card.tsx): its corners with padding, the panel surface or a card
  // tint. Map overlays, the contents list and a dialog are panels, not cards. CIV-1800: a card kept as a style constant
  // (Live's old TILE) counts too; only the map's named panel constants in styles.ts are allowed.
  { name: 'a card built by hand (use Card in components/ui/Card.tsx)', doc: 'VISUAL.md',
    pattern: /rounded-2xl[^"'`]*\b(p|px|py)-\d|\b(p|px|py)-\d[^"'`]*rounded-2xl|\$\{SURFACE\}[^"'`]*rounded-2xl|rounded-2xl[^"'`]*\$\{SURFACE\}|featureTint\(|cardTint\(/,
    slip: '<div className="rounded-2xl p-6" style={{ background: featureTint(color) }}>',
    skipLine: /export const (FLOATING_CARD|SIDEBAR_CARD_SURFACE|DROPDOWN_PANEL|COMPARE_SIDE_GROUP) =/,
    allowed: ['src/components/ui/Card.tsx', 'src/components/AirportStoryMap.tsx', 'src/components/FrequentServiceStoryMap.tsx', 'src/components/PageContents.tsx', 'src/components/ui/ExpandDialog.tsx'] },
  // Commit 697af467: Live pages offer no CSV downloads.
  { name: 'a CSV download in Live code', doc: 'VISUAL.md', pattern: /\bCSV\b|\.csv\b|text\/csv/i, slip: "'Download CSV'", only: /(^|\/)[Ll]ive[^/]*$|\/Live\// },
];

// Files with a known slip not fixed yet, by rule: new wording waiting on Ryan's word-for-word OK, or old code waiting
// on its own cleanup item. Every other file is still checked. Remove each entry once its file is fixed (a test below
// fails when an entry no longer has its slip).
const PENDING: Record<string, string[]> = {};

// Exact texts Ryan approved word for word, or quotes of an agency's own words, that keep a form the rules ban. Each is
// removed from its file before the rules run, so only that exact text passes.
const APPROVED_TEXT: Record<string, string[]> = {
  // The frequent-service story: its approved prose, and agencies' own definitions (CIV-1613, manager 2026-11-14).
  'src/apps/FrequentServiceStory.tsx': [
    '“every 15 minutes or better”', '“every 15–20 minutes”', 'between October 30 and November 3', 'Between October 30 and November 3',
    'A 15-minute route', 'a 15-minute corridor', '15- and 30-minute service',
    // CIV-1179: the coverage section's prose as it shipped on main before the 2026-11-14 revert.
    'a 10-minute walk', 'The stricter 15-minute threshold', 'the broader 30-minute threshold', '30-minute service reaches', 'as 15-minute service',
    // Jarrett Walker's own words, quoted (Ryan approved, 2026-11-15).
    '“around every 15 minutes all day.”',
    // Ryan's CIV-1495 #6 wording, word for word (2026-11-15): the TTC's name for its network.
    'The TTC’s own 10-minute network',
  ],
  // The airport story: draft for Ryan's review (CIV-1550), dev only.
  'src/apps/AirportStory.tsx': [
    'Tuesday November 17, Saturday November 21 and Sunday November 22, 2026', 'nearby dates in November 2026',
    'about 5 AM to 11 PM', '311 km away', '83 km away',
  ],
  'src/components/FrequentServiceStoryMap.tsx': ['count on all day', 'every 10 or 15 minutes'],
  'src/data/frequentServiceStory.ts': ['10-minute peak, 12-minute off-peak', 'Every 15 minutes or better during weekday daytime hours'],
  // A round figure reads better as "about 1 km"; TriMet's own rule for its Sandy zone.
  'src/components/Live/sections/MethodSection.tsx': ['(about 1 km)'],
  'src/data/onDemandServiceAreas.ts': ['within 3 miles of Sandy'],
  // Live's notices, word for word (CIV-1045); Ryan's CIV-1160 answer 7 keeps "Live has no route 109 for MiWay."
  'src/content/noticeCopy.ts': ['`Live has no route ${route} for ${agency}.`', 'It covers ${agencyName} routes ${joinList(followed)}.'],
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
      'dayPlural(day)', "label.split('–')", 'countText(n)', 'percentText(share)', '`${metresText(d)} away`', '`${n} min`', '`${n} mins`', "params.set('lat', lat.toFixed(4))", '`${band.left * 100}%`', 'routeShortLabel(route)', 'directionBranchFallback(dir)', '<PanelCloseButton />',
    ];
    for (const rule of RULES) for (const text of fine) expect([rule.name, text, breaks(rule, text)]).toEqual([rule.name, text, false]);
    // CIV-1800: a card built as a style constant is caught too.
    const card = RULES.find(r => r.name.startsWith('a card built by hand'))!;
    expect(breaks(card, "export const TILE = `min-w-0 rounded-2xl p-4 ${SURFACE}`;")).toBe(true);
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
