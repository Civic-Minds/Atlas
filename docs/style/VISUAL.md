# How Atlas looks

Part of the [Atlas style guide](../STYLE.md). Read the two rules at the top of that page first. Wording rules are in [How Atlas talks](TEXT.md).

Rules marked "(checked)" fail `src/content/__tests__/styleGuard.test.ts` when broken.

Use the shared component for each job instead of building a one-off.
The shared components live in `src/components/ui/`.

## Pages and layout

- Docs-style pages (About, Docs, Terms, Privacy, What’s New, Research) use `DocsPageLayout` (`src/components/ui/DocsPageLayout.tsx`). Commit ce33bc90.
- Data pages (agency, area, agencies index) use its data-page form. Commit ce33bc90.
- The site header stays pinned on every page that uses `PageShell` (docs-style, data, Planners, Live report and not-found pages). Commit 15e232a9, CIV-1708.
- On every page with the shared header and footer, the Atlas logo opens the About home page and "Go to Atlas" opens the map (#1509).
  - Ryan, 2026-11-14: "like we already have the go to atlas button so confusing". Two links to the same place were confusing.
  - This replaces CIV-1312, where only the About page's logo stayed on /about.
  - Pages with their own header (the Live tool, diagnostics) keep the logo on the map.
  - The pin lives in `PageShell` only; no page imports `SiteHeader` itself (shared UI guard).
- The "On this page" menu is `PageContents` (`src/components/PageContents.tsx`). Commit 49f72ada.
  - It highlights the section being read.
- Page and section headings use `PageTitle` and `SectionTitle` (`src/components/ui/PageTitle.tsx`), so the same kind of page looks the same.
- The research stories share one heading, paragraph and chart-panel look (`STORY_HEADING`, `STORY_PARAGRAPH`, `STORY_CHART_PANEL` in `src/pageStyles.ts`). CIV-1804. (checked)
- Floating cards over the map use `Panel` (`src/components/ui/Panel.tsx`).

## Tables, controls and labels

- Digits are the font's normal (proportional) digits everywhere, charts and tables included. No fixed-width digits (`tabular-nums`, `font-variant-numeric`). Ryan, 2026-11-15: "1". (checked)
- Tables use `DataTable` (`src/components/ui/DataTable.tsx`) with one of its variants (compact, ruled, card). (checked: no `<table>` outside `DataTable`)
- Every card is `Card` (`src/components/ui/Card.tsx`): its corners, a pale frequency-colour tint or the panel surface, and one of its paddings; each card type keeps its own layout inside it. CIV-1789. (checked: no `rounded-2xl` with padding, surface or tint outside `Card`)
- Page tables (area and agency pages) keep their columns in place. CIV-958, CIV-973.
  - Every area page shows the same mode columns in the shared mode order (Subway/Metro, Light rail, Streetcar, Commuter rail, Bus, Ferry), with a dash where a mode is missing.
  - Monorail counts in Subway/Metro and trolleybus in Bus.
  - Every other mode (gondola/aerial tram, cable car, funicular) goes in one last "Other" column, shown only where an area has one.
  - A column that counts more than its own mode says what it counts on hover (`AREA_TABLE_MODES` and `areaTableColumn` in `shared/areaPages.ts`).
  - On desktop the columns sit against the right edge, right-aligned, with the spare space after the names.
  - On phones they start right after the names, left-aligned, so a column cut off at the edge shows there is more to scroll to (`DataTable` `endAligned`).
  - A header too long for its column breaks onto two lines.
- Pills and segmented buttons use `Pill` (`src/components/ui/Pill.tsx`).
- On/off switches use `Toggle`.
- Small labels such as "Live" or "New" use `Tag`.
- Legend entries use `LegendItem`.
- Colours come from the CSS tokens in `src/styles/index.css`, written as `var(--accent)`, `var(--text-muted)`, `var(--text-primary)`, `var(--border-primary)` and so on.
- Route names in lists and titles: the number in bold, then the name in a light weight, with no dash ("**504** King"). CIV-928, CIV-1128.
  - This holds on every screen: lists, card titles, the chart window and page titles.
  - A route with no number shows its name in bold alone.
  - Plain text keeps the dash ("504 — King"): tab titles, shared-link and preview text, copied text, report details and screen-reader names.
  - Use `RouteRowName` in lists and `RouteTitleName` for titles (both in `src/components/RouteRowName.tsx`).

## Colour and shape

- No dark fills.
  - Selected and "on" states use a flat, pale tonal tint with darker text (the `--control-active-*` and `--accent-selected-*` tokens, `CONTROL_ACTIVE` in `src/styles.ts`).
  - No solid near-black pills with white text. (checked: only the accent fill with white text)
- Nothing has a shadow. Keep the flat look. (checked)
- Case (Ryan, 2026-11-15; it replaces CIV-1160's sentence case everywhere):
  - Titles are title case: page headings, section headings, header nav links, footer column names and links, and browser tab titles ("What’s New", "All Agencies and Areas", "Terms of Service"). Section headings are cased by `SectionTitle` and `SubsectionTitle` themselves; page titles that aren't a proper name use `titleCase` (`shared/titleCase.ts`).
  - The standard for short words: articles, coordinating conjunctions and short prepositions stay lowercase (a, an, the, and, but, or, nor, for, as, at, by, in, of, on, per, to, via, vs), unless they start or end the title, follow a colon or begin a hyphenated word ("On-Demand"). Every other word is capitalized, including "up", "off" and "so" ("Free Up to a Set Age"). Words that already have a capital keep their spelling (TTC, GTFS-Flex); units after a number stay as written ("15 min").
  - A heading written as a sentence, ending in a full stop or question mark, stays a sentence ("Built for looking closer."), and so do the research stories' headlines and any "[Ryan’s wording: …]" placeholder.
  - Everything else is sentence case: sentences, buttons, notices, labels, map panel titles, chart text and map exports ("Near you", "Report a problem").
  - (checked: `src/content/__tests__/titleCase.test.ts`, both halves)
- No all-caps text anywhere: no `uppercase` class, no `text-transform: uppercase`, no hard-coded capitals in labels, headers, badges or titles. (checked: `uppercase` and `textTransform`)
- Drop the wide letter spacing that usually comes with it. (checked: `tracking-wide*` and `letterSpacing`)
- An agency's own route code in capitals ("SSSF", "WCE") is the route's name and stays as written.
- An agency's short name is shown as the agency writes it ("MiWay", not "MIWAY").
- A clear (X) button inside a pill-shaped search box sits at least `right-2` in from the edge, never flush with the border.
- Every search box has a clear X once it has text (Ryan, 2026-11-14: "Yes to clear x"). CIV-1607. (checked)
  - Pill search boxes are `SearchBox` (`src/components/ui/SearchBox.tsx`): magnifier, field, "Find …" hint and the X.
  - The top bar's box is built in `App.tsx` for its phone hint and results keys, and uses `SearchClearButton` too.
- Every search box's clear X is `SearchClearButton` (`src/components/ui/SearchClearButton.tsx`). CIV-1569. (checked: no X icon elsewhere)
- Every close X on a panel, card or dialog is `PanelCloseButton` (`src/components/ui/PanelHeader.tsx`). CIV-1569. (checked)
  - Each keeps its kind's look.
- Map overlays (the header row, footer pills, counts, map controls, notice and status pills, the analytics prompt) take their position from the "Map overlay slots" in `src/styles.ts`, never a hand-set `bottom-*`/`right-*`. CIV-1011.
  - Each carries `data-map-overlay`.
  - After moving one, run `npm run check:overlays -- <dev server URL>`.
  - It fails if any two overlap or one runs off the screen at 360, 640, 820, 1024 or 1440 wide.

## Live

- The "Along the route" strip (`src/components/Live/RouteStrip.tsx`) is the model for every Live visual:
  - stops as dots on a line
  - a three-step colour scale (the `--strip-delay-*` and `--strip-bunching-*` tokens)
  - the marked stretch drawn as a bracket
  - "less exact" stops hatched
  - and on phones a compact line with only the key stops named.
- Reach for this before bar charts or prose.
- Live pages offer no CSV downloads. Commit 697af467. (checked: no "CSV" in Live code)
- Live writes minutes in the map's shared minutes format (`shared/headwayText.ts`): "every 8–10 min", "7.5 min", "2 min late". CIV-1160.
- Added time keeps its plus sign: an increase reads "+0.5 min", as in "Where delays start": "starts at Broadview Ave (+0.5 min)" (Ryan, 2026-11-14). CIV-1470.
  - The no-plus rule above is for lateness ("2 min late").

## Agencies

- Agencies with an expired feed stay visible with the existing expired-feed notice.
- Switch to a newer feed if one exists; never hide the agency without Ryan's explicit yes.
- Every hidden agency shows the same one note, word for word (Ryan, 2026-11-13): "Schedules for this agency aren’t available yet." CIV-1060.
  - Its card adds no second message (no "couldn’t load" error, no no-routes text).
  - Changing the sentence needs Ryan's OK.
- A Live route card whose route has no Live analysis (its "Right now" section can't show) reads one grey line, word for word (Ryan, 2026-11-14): "Live figures for this route aren’t available yet." CIV-1413.
  - Nothing shows while the analysis is still loading.
  - Changing the sentence needs Ryan's OK.

## Charts, graphs and graphics

Every line here is copied from a rule already written down; the source is named on each line.

On the site:

- The "Along the route" strip is the model for every Live visual; reach for it before bar charts or prose. (Live, above)
- Info panels are data first: labelled figures, short rows, a small chart, at most one caption line. ([TEXT.md](TEXT.md), Less text)
- No text that explains what the UI already shows. For example, no "Paler bars are service outside..." line under a chart. ([TEXT.md](TEXT.md), Less text)
- Chart cells write "10 min" with no "every" (`headwayAmount`). ([TEXT.md](TEXT.md), Frequencies)
- Legends and keys write "≤10 min" and "16–30 min" (`headwayTierLabel`, `headwayBandLabel`). ([TEXT.md](TEXT.md), Frequencies)
- Colours come from the CSS tokens in `src/styles/index.css`. (Tables, controls and labels, above)
- The graphics desk builds charts and pages from the shared chart collection (CIV-1173). (Editorial strategy, 2026-10-30)
- Hand-drawn art doesn't fit Atlas's look. Our graphics come from the chart collection (CIV-1173). (Editorial strategy, 2026-10-30)
- A data story answers one question for every agency, as a chart with a table (Free child fares). (Editorial strategy, 2026-10-30)
- A chart's legend picks its series: hovering, focusing or tapping a legend item (or the part itself) highlights that series and fades the rest; tapping it again, leaving the chart or moving focus away clears it. Every chart with a legend uses `useActivePart` (`src/components/charts/useActivePart.ts`), the split bar's and the sparklines' way (`SplitBar`, `CategorySpark`). Ryan, 2026-11-15: "Like this should be part of the visual style guide right". (checked)
  - Keyboard: each legend item is focusable, and focus or Enter picks it.
  - Screen readers: each item names its series and its count, and the chart's numbers are also a table (below).
- A chart's numbers are also a table for screen readers only, with no visible "Show as a table" toggle (`ChartTableDetails`). CIV-1281 (Ryan), replacing the editorial strategy's visible toggle (2026-10-30).
- Adding one source line under each chart would fit standard 3. (Editorial strategy, 2026-10-30; written as a proposal there)
- A caveat sits next to the chart it affects, such as "Not found yet", not only at the end. (Editorial strategy, 2026-10-30)

Research chart defaults (Ryan, 2026-11-18, CIV-1173, picks 1A to 5A on the chart kit review page; decision in [DECISIONS.md](../product/DECISIONS.md)):

- Ranked bars for rankings.
- Columns for spreads along a scale.
- A split bar for shares of a whole.
- Dot pairs for two values compared.
- Empty steps stay on a fixed scale: a 60-min row at 0 is shown, not dropped.
- The A/B pairs on that page are different chart types for different jobs, so each kind keeps the design its page already uses.

For LinkedIn and other posts (Ryan, 2026-11-10, recorded in Claude's memory note on LinkedIn graphics). Make each graphic in this order:

1. Pick the form.
   - For place-based stories, use maps, not bar charts (Ryan: "Chart really doesn't do much here").
   - Otherwise a chart.
2. Build it from the data, never a screenshot of Atlas or another site (Ryan: "we didn't use the website itself").
3. Copy the model for its form.
   - Charts match the Bike Share chart (`~/Documents/LinkedIn/bike-share-chart/chart.html`).
   - Maps match the night-service maps (`~/Documents/LinkedIn/night-service-maps/`, `build.py`; Ryan: "Honestly that looks so good").
4. Chart style:
   - 1200 × 1200 image
   - #f0f0f0 background
   - one white rounded card
   - title in Inter, weight 900
   - grey subtitle in weight 700 that carries the key number
   - a small footer source line.
5. Map style:
   - the daytime network in grey
   - the data in one hue, in three shades.
6. Render it with headless Chrome.
7. Save each post's graphics under `~/Documents/LinkedIn/<post>/`.
