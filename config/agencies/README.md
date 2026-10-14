# Agency configuration

These files are the canonical source for Atlas agency metadata and feed configuration.
`order.json` preserves the stable display order used by the runtime index.

Run `npm run build:agency-index` after changing them. That generates the runtime
bundle at `public/data/index.json`; the app still loads one index at runtime.

## Mode overrides

`modeOverrides` (optional) corrects a route whose feed route_type gives the wrong mode. Each entry:
`routeType` (the type the feed publishes; the override stops applying if the feed changes it),
`routeShortName` and/or `routeLongName` (exact match), `mode` (0 streetcar, 1 subway/metro, 2 commuter
rail, 3 bus, 4 ferry, 5 cable car, 6 gondola, 11 trolleybus, 12 monorail, 100 light rail) and `reason`.
Run `npm run build:agency-index`; it writes `shared/data/mode-overrides.json`, which CI checks.
