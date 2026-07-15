# Agency configuration

These files are the canonical source for Atlas agency metadata and feed configuration.
`order.json` preserves the stable display order used by the runtime index.

Run `npm run build:agency-index` after changing them. That generates the runtime
bundle at `public/data/index.json`; the app still loads one index at runtime.
