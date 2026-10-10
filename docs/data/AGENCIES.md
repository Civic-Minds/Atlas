# Agencies

Reference for Atlas's static agency coverage — regions covered and agency count.

For display naming rules, see [`DISPLAY_NAMING.md`](DISPLAY_NAMING.md). For live GTFS-RT polling status and history archiving, see [`LIVE_POLLING.md`](../operations/LIVE_POLLING.md).

---

## Static coverage

The current counts are generated from the registry and mode-specific catalogs; do not maintain a separate hand-count here. Run `npm run report:agency-count` for the current totals.

Source of truth: [`public/data/index.json`](../../public/data/index.json)
Generated public catalog: [`catalog-public.json`](../../public/data/catalog-public.json)

**Expansion backlog:** [`AGENCY_BACKLOG.md`](AGENCY_BACKLOG.md) — prioritized agencies to add. Gap discovery: `npm run discover-gaps`.

Regions with at least one agency in the public catalog:

Canada: Ontario, Quebec, British Columbia, Alberta, Saskatchewan, Manitoba, Nova Scotia, New Brunswick, Prince Edward Island, Newfoundland, Yukon, Northwest Territories

US: Washington, Oregon, California, Arizona, Nevada, Idaho, Utah, Colorado, Wyoming, New Mexico, Texas, Oklahoma, Arkansas, Nebraska, South Dakota, Iowa, Missouri, Kansas, Minnesota, Wisconsin, Illinois, Indiana, Michigan, Ohio, Kentucky, Tennessee, Louisiana, Alabama, Alaska, Mississippi, Georgia, Florida, North Carolina, South Carolina, Vermont, Virginia, West Virginia, Maryland, Washington DC, Pennsylvania, New Hampshire, New Jersey, New York, North Dakota, Connecticut, Rhode Island, Massachusetts, Maine, Delaware, Hawaii, Montana

Mexico: Ciudad de México

---

[Back to Data](../DATA.md)
