# How Atlas talks

Part of the [Atlas style guide](../STYLE.md). Read the two rules at the top of that page first. Look and layout rules are in [How Atlas looks](VISUAL.md).

Rules marked "(checked)" fail `src/content/__tests__/styleGuard.test.ts` (or the test named) when broken.

- Every back control says "Back to " + the place it returns to, from one source (`src/content/backLinks.ts`). CIV-1462. (checked: `backLinks.test.ts`)
  - A text link shows it after the arrow ("← Back to map", "← Back to TTC", "← Back to agencies").
  - An arrow-only control or the logo says the same words to screen readers ("Back to About Atlas").
  - Common places are lower case after "Back to"; agency, route and page names keep theirs (Ryan, 2026-11-14: History's link reads "Back to agencies").
- No "[Placeholder" text can reach a public or beta build. It is a stand-in for wording Ryan has not given yet, so it may only sit behind a dev-only flag (true only on the Vite dev server), and each file is listed with its flag in the test. CIV-1775. (checked: `placeholderGuard.test.ts`)
- A close X says "Close " + what it closes to screen readers ("Close filters"; `closeLabel`). CIV-1569. (checked)

## Frequencies

- Every frequency is written by `shared/headwayText.ts`. (checked)
- Never write "every N min" by hand. (checked)
- The forms:
  - "every 10 min" for a stated or scheduled spacing (`headwayEvery`)
  - "≤10 min" / "All" for the applied frequency limit, everywhere it is named: pickers, Compare captions, the export image (`headwayFilterLabel`)
  - "every 10 min or better" for a threshold inside a sentence or a screen-reader label (`headwayOrBetter`)
  - "every 16 min" for a measured or typical spacing (`headwayAbout`)
  - ranges with an en dash: "every 6–12 min", "every 30–60 min" (`headwayAboutRange`, `headwayEveryRange`)
  - "≤10 min" and "16–30 min" in legends and keys (`headwayTierLabel`, `headwayBandLabel`)
  - "10 min" with no "every" in tables and chart cells (`headwayAmount`)
  - "3 min" for a delay or gap that is not a headway (`delayAmount`)
- The frequency comes first, then its limit: "every 12 min until 9:40 PM", not "until 9:40 PM, every 12 min" (Ryan, 2026-10-30). #962.
- Frequencies are always in minutes, never hours ("every 90 min", "every 120 min"), so a column never mixes units. #938. (checked)
- Waits over 60 minutes print their exact minutes ("every 63 min"), never rounded to the half hour, so the words match the number the filter reads (Ryan, 2026-10-31). #1239.
- The frequency definition is written "every 15 min or better": "No stop on this route has a vehicle every 15 min or better at this time of day." CIV-1160.
- A route that starts slowly reads "every N from <time>", where N is the longest wait after that time. CIV-1411.
- Route lists and agency pages use the same words and range as the route card, from the same function. CIV-1300, CIV-1447.
  - They show the "Irregular" badge where the card shows no number.
  - A range's dot takes the slower number's colour.
- There is no "All day" option. Never describe one in any text. CIV-1097, CIV-1451. (checked)
  - The 07:00-22:00 all-day grade is internal; it reaches the screen only as "Infrequent" or "limited" ([FREQUENCY_RULES.md](../product/FREQUENCY_RULES.md)).
- Don't summarise agencies or areas by a fixed cutoff such as "every 15 min or better" (or 10, 30 or any other).
  - Many agencies have no routes that frequent.
  - Show the real waits for each period instead.
- Frequency filter work: read `docs/product/FREQUENCY_RULES.md` first.

## Numbers

- Every count, percent and decimal figure is written by `shared/numberText.ts`. CIV-1587. (checked)
- Counts have a comma every three digits, the same in every browser language: "1,234 trips" (`countText`).
- How many agencies Atlas covers is the exact count, never "about" (Ryan, CIV-1724: "it is exactly that many"): "Atlas covers 532 transit agencies".
  - How many agencies and which countries Atlas covers come from `shared/atlasCoverage.ts`, never typed by hand. CIV-1724. (checked)
- A share is a whole percent: "12%" (`percentText`). (checked)
- Service delivered is to a tenth of a percent, rounded down, always one decimal: "99.0%", "100%" (`percentTenthText`, #1472).
- A change in a share has a sign, and none when it rounds to 0: "+12%", "−4%", "0%" (`signedPercentText`).
- Negative numbers use a real minus sign (−), not a hyphen.
- Distances, speeds and densities are written by `shared/unitText.ts`. CIV-1590. (checked)
  - Distances in whole metres: "347 m away", "within 400 m" (`metresText`), so the words match the distance a filter uses.
  - Speeds in whole km/h: "25 km/h" (`speedText`).
  - People per square kilometre to a tenth under 10, whole from 10: "5.3", "1,234" (`densityText`).
  - Prose such as "about 1 km" stays as written.
- Minutes come from `shared/headwayText.ts` and `shared/liveFormat.ts`, not from here.
- Coordinates in links and report details are machine values and keep their own decimals.

## Words

- Plain words a non-expert understands at once.
- Canadian spelling: colour, centre, catalogue, analyse. Words ending in -ize keep the z (normalize). Ryan, CIV-1610. (checked)
- No comma before the "and" or "or" that ends a list: "morning, evening or overnight". Ryan, CIV-1610. (checked)
- No "what Atlas isn't" disclaimers (not a trip planner, live alerts, doesn't replace, can be wrong): say what Atlas does. Legal pages excepted. Ryan, CIV-1733, CIV-1792. (checked)
  - Status notes tied to specific data are fine and say so plainly (e.g. 'is still being verified'); the rule targets general 'Atlas isn't / can be wrong' lines, above all next to a sales or demo ask. Ryan, 2026-11-17.
- Feature card titles are about the same length, about five words (Ryan, CIV-1793: "The titles should be relatively the same amount of words"). (checked: at most 7, `featureCardCopy.test.tsx`)
- No "Atlas" in feature card body text (Ryan, CIV-1793). (checked: `featureCardCopy.test.tsx`)
- "Vehicles", not "buses", in page and card copy: the About, For Transit Planners and For Researchers pages and their cards (Ryan, CIV-1793: "it's not just buses"). (checked)
- Every page has one name, in `shared/pageNames.ts` (`PAGE_NAMES`): its heading, the header and footer links to it, back and close links, and the start of its browser tab all read it. Ryan, 2026-11-15. (checked)
  - "Docs" on every link to the Docs page, as its heading and in its tab (`DOCS_PAGE_TITLE`). CIV-1697 (Ryan, 2026-11-15: "Should we rename Documentation page back to Docs", then option 1, everywhere) reversed the page-names refactor's "Documentation". The URL stays /about/docs.
  - "What’s New" for the release notes: the footer link, the /changelog page and tab, and the map's panel. The URL stays /changelog.
  - The footer's Atlas column links "About" (link names are one word); the page is "About Atlas", as are the map's About panel and its buttons. The legal links read "Terms" and "Privacy"; the pages are "Terms of Service" and "Privacy Policy".
  - A research story's words (card title, text and link, page heading and intro, tab, preview description, share image alt) are one entry in `shared/researchStories.ts`; nothing else types them. Ryan, CIV-1629. (checked: `researchStories.test.ts`)
  - Browser tabs: "<page name> | Transit Atlas", with an optional detail after the name ("Docs: Data, Frequency and Methods | Transit Atlas"), at most 60 characters: the detail goes first, then the brand (`tabTitle`). Only the home page leads with the brand ("Transit Atlas: Scheduled Frequency Map"). Link previews name the site "Transit Atlas".
- No transit or technical jargon in labels, buttons or statuses.
- "Part-time", not "Time-limited", for service that runs part of the day. CIV-211, #933. (checked)
- "Irregular" for a period with no regular cadence where the route still runs. CIV-1238.
  - "Runs irregularly in this period" on cards.
  - "Irregular" in table cells and list values.
  - Never "no regular service", which reads as if nothing runs. (checked)
- "Report a problem" reasons are named once, in `REPORT_REASON` (`src/components/Interval/cardUi.tsx`); cards hide or pre-check them by that name. CIV-1591. (checked)
- "Area" is a metro area (the Calgary area, the Greater Toronto and Hamilton Area), in text and in /area/ links. "Region" is only a state or province (/region/ pages). An agency page reads "Calgary, Alberta" (the area's name without a trailing lowercase "area"; "Greater Toronto and Hamilton Area, Ontario" keeps its name). Ryan, CIV-1614. (checked)
- "Occasional", not "one-off" or "irregular", for the route class hidden by default (school runs, a few trips a day, on-demand). CIV-1238. (checked: "one-off")
- "Schedule", not "timetable", in all rider-facing text, on the map and in Live, including approved texts (Ryan, CIV-1079, CIV-1160). (checked)
  - Code names (`noTimetableTrip` and the like) stay.
- "Consistent", not "steady" (Ryan, 2026-10-27: "\"steady\" should not be used - consistent is better"). CIV-1059. (checked)
- Curly apostrophes (’) everywhere, site-wide, never straight ('). CIV-1160. (checked: `curlyApostrophes.test.ts`)
- One name each: "Report a problem", "Part-time routes", "Day / Time / Mode", "Trip time", "On-demand". CIV-1160.
- Counts with a noun ("1 route", "3 agencies", "its routes have") come from `plural` / `countOf` (`shared/overflowText.ts`), never a hand-built "=== 1 ?". CIV-1593. (checked)
- Every link that sends people to the map reads "Try Atlas" (`MAP_LINK`): page heroes, empty and not-found pages. Never "Open the map" or "Open the Atlas map". The shared header keeps "Go to Atlas" (#1509). (Ryan, 2026-11-15: "'Open the map' needs to be fixed too we need to refactor this bc this isnt good term", then "Try Atlas"). CIV-1594, CIV-1703. (checked)
- A label used in more than one place is one constant in `src/content/noticeCopy.ts` ("View on map", "See all agencies", "What’s New", "About Atlas", map export titles). CIV-1599. (checked)
- Every button, link, tag, heading, control label and table column is written in `src/content/noticeCopy.ts` (or `PAGE_NAMES`), never typed into its component, even when it is used once; Live's labels too (CIV-1781). Live's own terms ("Delays start", "Live vehicles") stay in `shared/liveWording.ts`; story and Docs headings are prose and stay with their page. CIV-1774. (checked)
- Small fixes, written exactly so: "consistent main pattern"; correct singulars ("1 match", "1 stop", "1 day"); "Zoomed out. Some less frequent routes are hidden."; "Find routes…" (it was "Search routes…"; see the next line). CIV-1160.
- Search box hints start with "Find": "Find routes…", "Find an agency…" (Ryan, 2026-11-14; `searchPlaceholder`). CIV-1569. (checked)
- A period with no service of one mode reads "No {period} buses / trains / ferries / streetcars / trolleybuses / monorail trains / people movers / cable cars / gondolas / funiculars", e.g. "No midday streetcars". CIV-471.
- Days in a sentence read "on weekdays", "on Saturdays", "weekday midday" (`dayPlural` / `dayInSentence`). CIV-1569. (checked)
- An empty cell, tile or figure reads "—" (`MISSING_VALUE`). CIV-1569. (checked)
- Dates come from `shared/dateText.ts`. CIV-1569. (checked)
  - "Oct 12, 2026" (`shortDate`).
  - "November 3, 2026" in method boxes (`longDate`).
  - "Oct 8–14" for ranges (`dateRange`).
- Times: "2–5 AM", "11 AM–3 PM", "6:30–9 AM" (Ryan, 2026-10-28). CIV-1095. (checked)
  - Uppercase AM/PM after a space.
  - An en dash between times (not "to").
  - No ":00" on the hour.
  - AM/PM once when both times share it.
- Route numbers keep the agency's own form ("1X", "SU 43", "99 B-Line", "SSSF").
- Route labels come from `routeLabels` in `src/utils/format.ts`, built on `shared/routeDisplay.ts`, so a route reads the same way on every surface.
- A route named by its number reads "Route 52A" (`routeShortLabel`), never built by hand. CIV-1569. (checked)
- A direction with no name reads "Direction 1" / "Direction 2" (`directionBranchFallback`). CIV-1569. (checked)
- "The" before agency names (CIV-1103):
  - Names ending in Authority, Commission, District, Agency, Company, Corporation, Department, Board, Railway, Railroad, System or Service take "the".
  - So do The Staten Island Ferry, The Cheyenne Transit Program, The Fayetteville Area System of Transit and The Yamhill County Transit Area.
  - Acronyms said letter by letter take "the" (the TTC, the MBTA, the CTA).
  - Acronyms said as a word (MARTA, SEPTA) and brands (MiWay) don't.
  - Possessives: a plural name takes only an apostrophe ("BC Ferries’ schedule").
  - A singular name ending in s takes ’s ("Cherriots’s schedule").
  - In sentences, use "Lawrence Transit", not the slash name.
- Internal terms and the UI words for them are listed in `docs/GLOSSARY.md`. Use the UI wording given there.

## Less text

- Info panels are data first: labelled figures, short rows, a small chart, at most one caption line.
- No paragraphs.
- On the main map's route card, evidence such as sample sizes and methods goes on a details screen, not the card.
- Live pages follow the Live rule instead: the math explanations stay visible.
- No text that explains what the UI already shows. For example, no "Paler bars are service outside..." line under a chart.

## Research pages

- Every research page ends with the "Method" section (`ResearchMethod`, `src/components/research/ResearchMethod.tsx`), in its fixed parts and order. CIV-1167.
- Don't say "in Canada and the US" in titles, cards or subtitles: Atlas only covers those two countries. State the countries only where a method box gives the sample. Ryan, 2026-11-15.
- New data is an update, not a correction: it only changes the page's "Date updated". CIV-1171.
- A "Corrections:" part is added to the method section only when we fix a mistake we published, saying what was wrong and when it was fixed (Ryan, 2026-11-13, asked "Is it a correction or just updated data though").

## Card notices

- Plain words: what the card shows and why. CIV-941.
- One sentence is preferred for short notices; a longer notice may use two.
- "Learn more →" runs on at the end of the last sentence, not on its own line (CIV-920).
- No "so" joining two clauses in a notice or error (Ryan, 2026-10-26).
  - State what happened, then what it means, as two short sentences if needed.
- One kind of notice, one place (Ryan, CIV-1202). A route card has three:
  1. Under the title: what the card is.
     - "Includes variants …", and data warnings about the schedule (expired or outdated, under review, corrected, map line missing or incomplete).
     - Small, regular weight, grey.
     - The data warnings end with "Learn more".
  2. On the rows: anything about one direction or row.
     - A direction with no service in the period is a row saying so ("Runs irregularly in this period"), not a note.
     - Row style: small, extra-bold, dark, fading with its row.
  3. Below the rows: the whole route in the period.
     - The filter line, "This route runs only from …", "no trips", uneven gaps, booking ahead and weekday variation, in that order.
     - Small, regular weight, grey.
- Each fact once: a notice shows only when it says something the rows don't.
  - When a row already names the gap, the hours or a longer wait, the notice that repeats it is left out.
  - `routeCardNotices` (src/utils/routeCardNotices.ts) decides every notice and its place.
  - The card decides nothing, and the stop card reads the same decision (`routeCardNoNumberWords`).
- "Each fact once: a notice shows only when it tells the rider something the rows don't" (Ryan, 2026-11-14, CIV-1199, #1221). Per notice:
  - Uneven gaps shows only when no row already names that gap (or a range reaching it), the gap is longer than every row's stated wait, and no row says "until" or "from".
  - "This route has no trips from …" shows once per card.
  - "This route doesn't run every N min or better for all of …" drops when every row already shows a longer wait, and beside a "no trips" or "runs only from" line.
    - Where every row meets the filter but the route doesn't run the whole period at it, the existing part-period line ("This route runs every N min, only from …") replaces it (Ryan, question 2).
  - "This route runs every N min, only from …" drops when a row already gives the same hours with "from" or "until".
  - "This route runs only from 7–9 AM." never adds "No frequency is shown".
    - It drops when a row already gives its hours, with or without a number.
    - Beside the part-period line naming the same hours it shows once.
  - Weekday variation, "no trips" alone and "Includes variants" are unchanged.
- One set of words per situation (Ryan, CIV-1251, 2026-11-01). `_review/card-wording` holds the approved table. (checked: `cardWording.test.ts`)
  - "Shared stretch" is the only name for the shared part (never "Combined" or "the shared section"). (checked: "the shared section")
  - A branch row shows only its own number.
  - Except a branch that is its direction's only row, which reads the range from the main stretch to itself ("every 15–54 min", NJ Transit 27 Sunday Midday toward Irvington; Ryan, CIV-1447).
    - Its dot is in the slower number's colour.
    - The route lists start their range at the same low number.
  - A period with no number reads "Runs irregularly in this period" on cards and "Irregular" in tight spots (never "limited").
  - The card has no All day row (CIV-1279: the map has no All day).
  - A route that doesn't run reads "no trips".
  - Part of a period reads "This route runs only from 7–9 AM." with the rest as a second sentence.
    - Several runs join with "and": "This route runs only from 9–10 AM and 2–3 PM." CIV-1251.

## New wording needs a yes

- No new UI wording, note or label without Ryan's explicit OK on that specific wording.
- This includes showing an existing note in a new situation.
- A Linear item or GitHub issue that proposes text is not approval.
- "You decide" on a data question covers the data, not what users see.
- Ask first with numbered options, and don't build ahead of the yes.

## Docs

- Markdown docs use plain text: no emoji, no all-caps headings. (checked)
- The contact address is typed once, in `shared/contact.ts`; links use `mailto()`. CIV-1790. (checked)
