# Population context research

**Status:** Exploratory; no product or implementation decision made.

## Research question

Which densely populated areas have poor frequent-transit coverage, and can
population context make that gap clearer than the route map alone?

## Sample

The brief compares candidate population datasets and geographies in Canada, the
United States, and France, with a first implementation geography still open.

## Method

Compare boundary formats, population vintages, licensing, uncertainty, and
join/tooling requirements before choosing a pilot geography.

## Results and interpretation

The original GTHA scope is no longer the only sensible starting point. A
comparable US metro or French region may better match Atlas's current footprint,
but each option has different precision and source tradeoffs.

## Recommendation

Keep the layer separate from the core route data and do not implement it until
one geography, source, and uncertainty treatment are selected.

## Limitations and next steps

The research does not yet select a geography or define how population estimates
with margins of error should appear to users.

## Supporting artifacts

- [Research brief](BRIEF.md)
