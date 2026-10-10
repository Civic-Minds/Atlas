# Agency display naming

Definitions and display semantics for how an agency's name renders in the UI.

Two rules, applied together wherever an agency name renders:

1. **Name**: use `shortenAgencyName()` (`src/utils/format.ts`) — never the raw `index.json` name directly. It collapses known long-form/legal names to the callsign riders actually use (e.g. "Bay Area Rapid Transit (BART)" → "BART", "SFMTA - Muni" → "Muni").
2. **Secondary text**: if the (shortened) name doesn't already contain the city/place, show the city as secondary text next to it. If the name already contains it (e.g. "Edmonton Transit Service (ETS)" → "ETS" — city's implied by the source name even after shortening), don't repeat it.

Prefer `agencyDisplayName(agencies, slug)` (`src/utils/format.ts`) over a raw `agencies.find(a => a.slug === slug)?.name` lookup — it's the lookup+shorten combined so rule 1 can't be forgotten at a new call site. Rule 2 (secondary text) still needs to be applied explicitly per component, since not every surface has room for a second line; list rows that do can use `agencyDisplayParts()` (`src/utils/format.ts`), which returns the primary name plus place text only when the name doesn't already contain it.

Known violations of these rules are tracked in [`KNOWN_ISSUES.md`](../operations/KNOWN_ISSUES.md) rather than here — this doc is the ruleset, not a bug list.

---

[Back to Data](../DATA.md)
