# Agency configuration

These files are the canonical source for Atlas agency metadata and feed configuration.
`order.json` preserves the stable display order used by the runtime index.

They generate the runtime bundle at `public/data/index.json` and the catalogs, which are not committed
(CIV-2975): `npm install`, every dev server, `npm run build`, the test run and the git hooks write them.
After editing these files by hand, `npm run build:agency-data` rewrites them at once.

## Mode overrides

`modeOverrides` (optional) corrects a route whose feed route_type gives the wrong mode. Each entry:
`routeType` (the type the feed publishes; the override stops applying if the feed changes it),
`routeShortName` and/or `routeLongName` (exact match), `mode` (0 streetcar, 1 subway/metro, 2 commuter
rail, 3 bus, 4 ferry, 5 cable car, 6 gondola, 11 trolleybus, 12 monorail, 100 light rail) and `reason`.
Run `npm run build:agency-index`; it writes `shared/data/mode-overrides.json`, which CI checks.
