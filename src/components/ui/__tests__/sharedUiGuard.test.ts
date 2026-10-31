import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Tables, pills, list rows and panel shells come from src/components/ui/. This fails when a screen
// hand-rolls one again, so the look cannot drift screen by screen. To fix a failure, use the shared
// component (DataTable, Pill, ListRow, Panel, LinkCard, Tag, ArrowLink, PanelEmpty, AgencyName, PageTitle, SectionTitle, EmptyPage),
// or for a card the card pieces (HeadwayBadge, LimitedBadge, CardBackLink, CARD_TITLE, CARD_SUMMARY, reportDetails).
// If a new variant is needed, add it to the shared piece; a file that must differ goes in ALLOWED with its reason.
const SRC = resolve(__dirname, '../../..');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : files(path);
    return /\.tsx$/.test(name) ? [path] : [];
  });
}

const RULES: Array<{ name: string; pattern: RegExp; use: string }> = [
  { name: 'raw <table>', pattern: /<table[\s>]/, use: 'DataTable' },
  { name: 'row style constants', pattern: /\b(LIST_ROW|LIST_ROW_SPACED|AGENCY_LIST_ROW)\b/, use: 'ListRow' },
  { name: 'option pill classes', pattern: /\b(FILTER_OPTION|CONTROL_ACTIVE|CONTROL_INACTIVE)\b/, use: 'Pill' },
  { name: 'panel shell constants', pattern: /\b(PANEL_SHELL|PANEL_TITLE_BAR|PANEL_BODY)\b/, use: 'Panel, PanelTitleBar, PanelBody' },
  { name: 'hand-rolled option pill', pattern: /px-2(\.5)? py-0\.5 rounded-full/, use: 'Pill' },
  { name: 'hand-rolled switch', pattern: /role="switch"/, use: 'Toggle' },
  { name: 'hand-rolled spinner', pattern: /border-t-transparent rounded-full animate-spin/, use: 'Spinner' },
  { name: 'hand-rolled link card', pattern: /px-3 py-2 rounded-xl bg-\[var\(--bg-app\)\] border border-\[var\(--border-primary\)\] hover:border-\[var\(--accent\)\]/, use: 'LinkCard' },
  { name: 'hand-rolled tag', pattern: /px-1\.5 py-(0\.5|px)[^"`']*rounded-full|rounded-full[^"`']*px-1\.5 py-(0\.5|px)/, use: 'Tag' },
  { name: 'typed arrow in a link', pattern: />[^<>{}]*[^\s<>{}][^<>{}]* →\s*</, use: 'ArrowLink' },
  { name: 'panel empty style', pattern: /\bPANEL_EMPTY\b/, use: 'PanelEmpty' },
  { name: 'hand-rolled agency place', pattern: /· \{(secondary|agencyPlace|agency\.region)\}/, use: 'AgencyName' },
  { name: 'hand-rolled page heading', pattern: /<h1[ >]/, use: 'PageTitle' },
  { name: 'hand-rolled section heading', pattern: /<h2 [^>]*className="[^"]*text-(xl|base) font-black/, use: 'SectionTitle' },
  { name: 'route label written by hand', pattern: /\b(getRouteLabel|shouldHideNumericRouteShortName|routeListCompanionName)\(/, use: 'routeLabels (utils/format.ts, one helper in shared/routeDisplay.ts)' },
  // A short and a long name joined by hand for display ("${short} — ${long}", "{shortName} {longName}", [short, long].join(' ')).
  // Keys joined with '::' or '-' are not labels and do not match.
  { name: 'route label joined by hand', pattern: /\$\{[^}\n]*[sS]hortName[^}\n]*\}(?:\s*[—–·|]\s*|\s+-\s+|\s+)\$\{[^}\n]*[lL]ongName|[sS]hortName[^\n`]{0,40}\}\$\{[^}\n]*[lL]ongName[^}\n]*\?\s*`\s*[—–·|-]|\{[^{}\n]*[sS]hortName\}(?:\s*[—–·|]\s*|\s+-\s+|\s+)\{[^{}\n]*[lL]ongName\}|\[[^\]\n]*[sS]hortName[^\]\n]*[lL]ongName[^\]\n]*\]\s*\.filter\(Boolean\)\s*\.join\(\s*['"`](?!::)|[sS]hortName\s*\+\s*['"`][\s—–·|-]{1,5}['"`]\s*\+\s*[\w.?]*[lL]ongName/, use: 'routeLabels (utils/format.ts)' },
  { name: 'hand-rolled frequency picker', pattern: /HEADWAY_TIERS\.map\(\(\{ max/, use: 'FrequencyPicker or useFrequencyOptions (Interval/pickers.tsx)' },
  { name: 'hand-rolled day buttons', pattern: /flex-1 h-7 flex items-center justify-center/, use: 'DayPicker' },
  { name: 'hand-rolled legend swatch', pattern: /shrink-0 rounded(-full|-sm)?" style=\{\{ background/, use: 'LegendItem' },
  // Sidebar cards share one top and one tallest size (SIDEBAR_CARD, SIDEBAR_CARD_MAX_H in styles.ts).
  { name: 'hand-rolled sidebar card top or height', pattern: /\btop: 80\b|max-h-\[calc\(100vh-(104|132)px\)\]/, use: 'Panel sidebar, or SIDEBAR_CARD and SIDEBAR_CARD_MAX_H' },
  { name: 'legend reading the default palette', pattern: /import \{[^}]*\bHEADWAY_TIERS\b[^}]*\} from '[^']*shared\/config'/, use: 'useHeadwayTiers (colour-vision aware)' },
  { name: 'hand-rolled arrow link', pattern: /<ArrowRight\b/, use: 'ArrowLink' },
  { name: 'arrow link style constants', pattern: /\b(PAGE_ACTION|TAG|CHIP|CARD_NOTICE_ACTION)\b/, use: 'ArrowLink, Tag' },
  { name: 'hand-rolled page frame', pattern: /<main className="min-h-screen bg-\[var\(--bg-app\)\] px-/, use: 'PageShell' },
  // Card pieces (CIV-395, after the card refactor CIV-929…CIV-1000): a card uses the shared badge, back link, title,
  // facts line and report details, so a fix to one (#1128, #1102) reaches every card.
  { name: 'hand-drawn frequency dot', pattern: /w-2 h-2 rounded-full shrink-0" style=\{\{ background/, use: 'HeadwayBadge or LimitedBadge (Interval/cardUi.tsx)' },
  { name: 'hand-written back arrow', pattern: />\s*← |← \{/, use: 'CardBackLink (components/CardBack.tsx)' },
  { name: 'hand-rolled card title', pattern: /text-sm font-black text-\[var\(--text-primary\)\] leading-tight/, use: 'CARD_TITLE, CardTitle or AgencyCardTop (Interval/cardUi.tsx)' },
  { name: 'hand-rolled card facts line', pattern: /text-xs font-medium text-\[var\(--text-dim\)\] mt-1 leading-snug/, use: 'CARD_SUMMARY (Interval/cardUi.tsx)' },
  { name: 'report details written by hand', pattern: /details=\{`/, use: 'reportDetails (utils/reportIssue.ts)' },
  // One place names an agency (CIV-998, CIV-1023): a surface picks agencyNames(...).name / .backLink / .full / .place / .list / .card (utils/agencyName.ts).
  // The shared grey note and section label (CIV-395 follow-up): CARD_NOTE and CARD_SECTION in styles.ts.
  { name: 'hand-rolled grey note', pattern: /text-xs font-bold text-\[var\(--text-dim\)\]/, use: 'CARD_NOTE (styles.ts)' },
  { name: 'hand-rolled section label', pattern: /text-xs font-black text-\[var\(--text-dim\)\]/, use: 'CARD_SECTION or CardSectionLabel' },
  // CIV-1011 #4: the outlined segmented group (Night 30/60, Frequent Service) and the active-filter corner dot.
  { name: 'hand-rolled segmented group', pattern: /rounded-full border border-\[var\(--border-primary\)\] p-0\.5/, use: 'PillGroup outlined' },
  { name: 'hand-rolled active-filter dot', pattern: /-top-0\.5 -right-0\.5 w-2 h-2 rounded-full bg-\[var\(--accent\)\]/, use: 'ActiveDot' },
  // CIV-1117: a shared style forced to another colour with !important; give the shared piece a tone instead.
  { name: 'shared style overridden with !important', pattern: /!text-\[/, use: 'a tone on the shared piece (e.g. CARD_CALLOUT_HEADLINE_TONE)' },
  { name: 'agency name helper called directly', pattern: /\b(shortenAgencyName|agencyBackLinkName|agencyDisplayParts|agencyListParts|agencyNameParts|agencyDisplayName)\(/, use: 'agencyNames (utils/agencyName.ts)' },
];

// Files that still own a style on purpose: the glass app tabs and the filter option list share the
// control styles with Pill but are not pills.
const ALLOWED: Record<string, string[]> = {
  'components/Interval/FilterChips.tsx': ['option pill classes'],
  'components/Interval/pickers.tsx': ['hand-rolled frequency picker'],
  // Live is local-only and its route groups carry no route type; it still names routes its own way (audit R8).
  // Maintainer-only diagnostics and the story page's own opening layout.
  'DiagnosticsPerformancePage.tsx': ['hand-rolled page heading'],
  // A filled call-to-action button (not a link) that ends in an arrow.
  'apps/FrequentServiceStory.tsx': ['hand-rolled arrow link'],
  // The card pieces' own homes (CIV-395): the badges and card text styles, the back link, and the route row's tier dot.
  'components/Interval/cardUi.tsx': ['hand-drawn frequency dot', 'hand-rolled card title', 'hand-rolled card facts line'],
  'components/CardBack.tsx': ['hand-written back arrow'],
  'components/RouteListRow.tsx': ['hand-drawn frequency dot'],
  // Live is its own app and team (CIV-899); its performance panel keeps its own title for now.
  'components/Live/LiveRoutePerformance.tsx': ['hand-rolled card title', 'hand-rolled grey note', 'hand-rolled section label'],
  'apps/LiveVehicles.tsx': ['route label written by hand', 'route label joined by hand', 'hand-rolled grey note'],
  'components/Interval/panels/LiveStopArrivals.tsx': ['hand-rolled grey note'],
};

describe('shared UI components', () => {
  for (const rule of RULES) {
    it(`no ${rule.name} outside src/components/ui (use ${rule.use})`, () => {
      const offenders = files(SRC)
        .map(f => relative(SRC, f))
        .filter(f => !f.startsWith('components/ui/'))
        .filter(f => !(ALLOWED[f] ?? []).includes(rule.name))
        .filter(f => rule.pattern.test(readFileSync(join(SRC, f), 'utf8')));
      expect(offenders).toEqual([]);
    });
  }
});

// The card rules must catch the copies they are for (CIV-395): a typical hand-built line for each.
describe('card piece rules catch hand-built copies', () => {
  const samples: Record<string, string> = {
    'hand-drawn frequency dot': '<span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />',
    'hand-written back arrow': '<button onClick={back}>← {agencyName}</button>',
    'hand-rolled card title': '<p className="text-sm font-black text-[var(--text-primary)] leading-tight">{name}</p>',
    'hand-rolled card facts line': '<p className="text-xs font-medium text-[var(--text-dim)] mt-1 leading-snug">12 routes</p>',
    'report details written by hand': 'details={`**Agency:** ${name}`}',
  };
  for (const [name, sample] of Object.entries(samples)) {
    it(name, () => {
      expect(RULES.find(rule => rule.name === name)?.pattern.test(sample)).toBe(true);
    });
  }
});
