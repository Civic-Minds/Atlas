# Atlas style guide

Read this before any UI work. It records decisions Ryan has already made about how Atlas looks and how it talks. It does not add new rules. When something here and the code disagree, ask before changing either.

Two rules come before everything else:

- Every change to what users see (styles, layout, wording, components, new pages) is shown to Ryan on a running localhost URL, with one line saying what to check, and gets his OK before it merges. A reviewer's approval is not design approval.
- A refactor onto shared components must look the same as `origin/main` unless the visual change was listed and approved. Check every touched page at desktop width and at 390px. Nothing may wrap to two lines or overflow a button.

## How Atlas looks

Use the shared component for each job instead of building a one-off. The shared components live in `src/components/ui/`.

Pages and layout

- Docs-style pages (About, Docs, Terms, Privacy, Changelog, Research) use `DocsPageLayout` (`src/components/ui/DocsPageLayout.tsx`). Data pages (agency, area, agencies index) use its data-page form. Commit ce33bc90.
- The site header stays pinned on every docs-style page; `DocsPageLayout` always uses `PageShell`'s sticky header. Commit 15e232a9.
- The "On this page" menu is `PageContents` (`src/components/PageContents.tsx`). It highlights the section being read. Commit 49f72ada.
- Page and section headings use `PageTitle` and `SectionTitle` (`src/components/ui/PageTitle.tsx`), so the same kind of page looks the same.
- Floating cards over the map use `Panel` (`src/components/ui/Panel.tsx`).

Tables, controls and labels

- Tables use `DataTable` (`src/components/ui/DataTable.tsx`) with one of its variants (compact, ruled, card).
- Pills and segmented buttons use `Pill` (`src/components/ui/Pill.tsx`). On/off switches use `Toggle`. Small labels such as "Live" or "New" use `Tag`. Legend entries use `LegendItem`.
- Colours come from the CSS tokens in `src/styles/index.css`, written as `var(--accent)`, `var(--text-muted)`, `var(--text-primary)`, `var(--border-primary)` and so on.

Colour and shape

- No dark fills. Selected and "on" states use a flat, pale tonal tint with darker text (the `--control-active-*` and `--accent-selected-*` tokens, `CONTROL_ACTIVE` in `src/styles.ts`). No solid near-black pills with white text.
- No raised or shadowed pills. Keep the flat look.
- No all-caps text anywhere: no `uppercase` class, no `text-transform: uppercase`, no hard-coded capitals in labels, headers, badges or titles. Drop the wide letter spacing that usually comes with it. An agency's own route code in capitals ("SSSF", "WCE") is the route's name and stays as written.
- A clear (X) button inside a pill-shaped search box sits at least `right-2` in from the edge, never flush with the border.

Live

- The "Along the route" strip (`src/components/Live/RouteStrip.tsx`) is the model for every Live visual: stops as dots on a line, a three-step colour scale (the `--strip-delay-*` and `--strip-bunching-*` tokens), the marked stretch drawn as a bracket, "less exact" stops hatched, and on phones a compact line with only the key stops named. Reach for this before bar charts or prose.
- Live pages offer no CSV downloads. Commit 697af467.

Agencies

- Agencies with an expired feed stay visible with the existing expired-feed notice. Switch to a newer feed if one exists; never hide the agency without Ryan's explicit yes.

## How Atlas talks

Frequencies

- Every frequency is written by `shared/headwayText.ts`. Never write "every N min" by hand. The forms:
  - "every 10 min" for a stated or scheduled spacing (`headwayEvery`)
  - "every 10 min or better" for what a filter or threshold means (`headwayOrBetter`)
  - "about every 16 min" for a measured or typical spacing (`headwayAbout`)
  - ranges with an en dash: "about every 6–12 min", "every 30–60 min" (`headwayAboutRange`, `headwayEveryRange`)
  - "≤10 min" and "16–30 min" in legends and keys (`headwayTierLabel`, `headwayBandLabel`)
  - "10 min" with no "every" in tables and chart cells (`headwayAmount`); "3 min" for a delay or gap that is not a headway (`delayAmount`)
- Frequencies are always in minutes, never hours ("every 90 min", "every 120 min"), so a column never mixes units. #938.
- Don't summarise agencies or areas by a fixed cutoff such as "every 15 min or better" (or 10, 30 or any other). Many agencies have no routes that frequent. Show the real waits for each period instead.
- Frequency filter work: read `docs/product/FREQUENCY_RULES.md` first.

Words

- Plain words a non-expert understands at once. No transit or technical jargon in labels, buttons or statuses.
- "Part-time", not "Time-limited", for service that runs part of the day. CIV-211, #933.
- Route numbers keep the agency's own form ("1X", "SU 43", "99 B-Line", "SSSF"). Route labels come from `routeLabels` in `src/utils/format.ts`, built on `shared/routeDisplay.ts`, so a route reads the same way on every surface.
- Internal terms and the UI words for them are listed in `docs/GLOSSARY.md`. Use the UI wording given there.

Less text

- Info panels are data first: labelled figures, short rows, a small chart, at most one caption line. No paragraphs. Evidence such as sample sizes and methods goes on a details screen, not the card.
- No text that explains what the UI already shows. For example, no "Paler bars are service outside..." line under a chart.

New wording needs a yes

- No new UI wording, note or label without Ryan's explicit OK on that specific wording. This includes showing an existing note in a new situation.
- A Linear item or GitHub issue that proposes text is not approval. "You decide" on a data question covers the data, not what users see. Ask first with numbered options, and don't build ahead of the yes.

Docs

- Markdown docs use plain text: no emoji, no all-caps headings.
