# Agencies

Reference for Atlas agency coverage: display naming rules and static data coverage.

For live GTFS-RT polling status and history archiving, see [`LIVE_POLLING.md`](LIVE_POLLING.md).

---

## Display Naming

Two rules, applied together wherever an agency name renders in the UI:

1. **Name**: use `shortenAgencyName()` (`src/utils/format.ts`) — never the raw `index.json` name directly. It collapses known long-form/legal names to the callsign riders actually use (e.g. "Bay Area Rapid Transit (BART)" → "BART").
2. **Secondary text**: if the (shortened) name doesn't already contain the city/place, show the city as secondary text next to it. If the name already contains it (e.g. "Edmonton Transit Service" → "ETS" — city's implied by the source name even after shortening), don't repeat it.

Prefer `agencyDisplayName(agencies, slug)` (`src/utils/format.ts`) over a raw `agencies.find(a => a.slug === slug)?.name` lookup — it's the lookup+shorten combined so rule 1 can't be forgotten at a new call site. Rule 2 (secondary text) still needs to be applied explicitly per component, since not every surface has room for a second line.

Known violations of these rules are tracked in [`KNOWN_ISSUES.md`](KNOWN_ISSUES.md) rather than here — this section is the ruleset, not a bug list.

---

## Static Coverage

468 agencies as of July 16, 2026.

Source of truth: [`public/data/index.json`](../public/data/index.json)

**Expansion backlog:** [`AGENCY_BACKLOG.md`](AGENCY_BACKLOG.md) — prioritized agencies to add. Gap discovery: `npm run discover-gaps`.

Canada: Ontario, Quebec, British Columbia, Alberta, Saskatchewan, Manitoba, Nova Scotia, New Brunswick, Prince Edward Island, Newfoundland, Yukon, Northwest Territories

US: Washington, Oregon, California, Arizona, Nevada, Idaho, Utah, Colorado, New Mexico, Texas, Arkansas, Nebraska, Missouri, Kansas, Minnesota, Wisconsin, Illinois, Indiana, Michigan, Ohio, Kentucky, Tennessee, Louisiana, Alabama, Alaska, Mississippi, Georgia, Florida, North Carolina, South Carolina, Vermont, Virginia, Maryland, Washington DC, Pennsylvania, New Hampshire, New Jersey, New York, North Dakota, Connecticut, Rhode Island, Massachusetts, Maine, Delaware, Hawaii, Montana

---

[Back to Data](./DATA.md)
