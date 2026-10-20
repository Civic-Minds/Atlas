# Micromobility Prices

A source-backed catalogue of bike-share and scooter-share pricing plans.

## Current state

The canonical dataset is [`data/pricing.json`](data/pricing.json). It records official consumer plans, payment channels, included usage, extra fees, source URLs, effective dates, and check dates. The initial seed covers Toronto, Montreal, New York, London, and Paris.

## Commands

```sh
npm test
npm run build
npm run dev
```

The build validates the records, copies JSON to the viewer, and creates `data/micromobility-prices.sqlite`. Open `http://localhost:4173` after starting the viewer.

## Data rules

Add a new dated record when a price changes; do not overwrite historical records. Use official operator or city sources, keep local currencies, and record unavailable details as unknown rather than estimating them.
