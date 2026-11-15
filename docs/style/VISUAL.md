# How Atlas looks

Part of the [Atlas style guide](../STYLE.md). Read the two rules at the top of that page first. Wording rules are in [How Atlas talks](TEXT.md).

Rules marked "(checked)" fail `src/content/__tests__/styleGuard.test.ts` when broken.

Use the shared component for each job instead of building a one-off.
The shared components live in `src/components/ui/`.

## Pages and layout

- Docs-style pages (About, Docs, Terms, Privacy, Changelog, Research) use `DocsPageLayout` (`src/components/ui/DocsPageLayout.tsx`). Commit ce33bc90.
- Data pages (agency, area, agencies index) use its data-page form. Commit ce33bc90.
- The site header stays pinned on every docs-style page. Commit 15e232a9.
  - `DocsPageLayout` always uses `PageShell`'s sticky header.
- The "On this page" menu is `PageContents` (`src/components/PageContents.tsx`). Commit 49f72ada.
  - It highlights the section being read.
- Page and section headings use `PageTitle` and `SectionTitle` (`src/components/ui/PageTitle.tsx`), so the same kind of page looks the same.
- Floating cards over the map use `Panel` (`src/components/ui/Panel.tsx`).

## Tables, controls and labels

- Tables use `DataTable` (`src/components/ui/DataTable.tsx`) with one of its variants (compact, ruled, card). (checked: no `<table>` outside `DataTable`)
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
  - No solid near-black pills with white text.
- Nothing has a shadow. Keep the flat look. (checked)
- Sentence case for headings and labels ("Near you"). CIV-1160, CIV-1448.
- No all-caps text anywhere: no `uppercase` class, no `text-transform: uppercase`, no hard-coded capitals in labels, headers, badges or titles. (checked: `uppercase` and `textTransform`)
- Drop the wide letter spacing that usually comes with it. (checked: `tracking-wide*` and `letterSpacing`)
- An agency's own route code in capitals ("SSSF", "WCE") is the route's name and stays as written.
- An agency's short name is shown as the agency writes it ("MiWay", not "MIWAY").
- A clear (X) button inside a pill-shaped search box sits at least `right-2` in from the edge, never flush with the border.
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
- Our charts have "Show as a table". (Editorial strategy, 2026-10-30)
- Adding one source line under each chart would fit standard 3. (Editorial strategy, 2026-10-30; written as a proposal there)
- A caveat sits next to the chart it affects, such as "Not found yet", not only at the end. (Editorial strategy, 2026-10-30)

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
