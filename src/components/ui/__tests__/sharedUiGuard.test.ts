import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Tables, pills, list rows and panel shells come from src/components/ui/. This fails when a screen
// hand-rolls one again, so the look cannot drift screen by screen. To fix a failure, use the shared
// component (DataTable, Pill, ListRow, Panel, LinkCard, Tag, ArrowLink, PanelEmpty, AgencyName, PageTitle, SectionTitle, EmptyPage). If a new variant is needed, add it to the shared component.
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
  { name: 'hand-rolled frequency picker', pattern: /HEADWAY_TIERS\.map\(\(\{ max/, use: 'FrequencyPicker or useFrequencyOptions (Interval/pickers.tsx)' },
  { name: 'hand-rolled day buttons', pattern: /flex-1 h-7 flex items-center justify-center/, use: 'DayPicker' },
  { name: 'hand-rolled arrow link', pattern: /<ArrowRight\b/, use: 'ArrowLink' },
  { name: 'arrow link style constants', pattern: /\b(PAGE_ACTION|TAG|CHIP|CARD_NOTICE_ACTION)\b/, use: 'ArrowLink, Tag' },
  { name: 'hand-rolled page frame', pattern: /<main className="min-h-screen bg-\[var\(--bg-app\)\] px-/, use: 'PageShell' },
];

// Files that still own a style on purpose: the glass app tabs and the filter option list share the
// control styles with Pill but are not pills.
const ALLOWED: Record<string, string[]> = {
  'components/Interval/FilterChips.tsx': ['option pill classes'],
  'components/Interval/pickers.tsx': ['hand-rolled frequency picker'],
  'apps/History.tsx': ['option pill classes'],
  // Maintainer-only diagnostics, the story page's own opening layout, and a dialog title (panel headers are a later step).
  'DiagnosticsPerformancePage.tsx': ['hand-rolled page heading'],
  'components/Interval/HeadwaySparkline.tsx': ['hand-rolled section heading'],
  // A filled call-to-action button (not a link) that ends in an arrow.
  'apps/FrequentServiceStory.tsx': ['hand-rolled arrow link', 'hand-rolled page heading'],
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
