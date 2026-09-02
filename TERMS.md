# Terms of Service

Last updated: September 2026.

## What this is

Atlas is a free, public transit frequency map. It has no accounts, no login, and no personal data collection beyond one optional feature (see below). It processes public GTFS feeds published by transit agencies into map data.

## Acceptable use

You agree not to:
- Scrape, bulk-download, or hammer the public R2 data endpoints or the site itself in a way that degrades service for other users or drives up hosting costs unreasonably
- Use Atlas's data or map in a way that misrepresents it as official transit agency information
- Attempt to disrupt, reverse-engineer for malicious purposes, or abuse the service

Excessive automated use may be rate-limited or blocked without notice.

## What data is collected

**Location**: Atlas has one optional "locate me" map button. If you click it, your browser's geolocation API is used to center the map on your position — this happens entirely in your browser and is never sent to, stored on, or logged by any Atlas server. Atlas does not collect, log, or store your IP address or location through any other means.

**Everything else on the map** (route shapes, stop locations, headway/frequency data) is public transit schedule data published by transit agencies via GTFS, not personal data.

Atlas uses Google Analytics 4, Vercel Web Analytics, and Vercel Speed Insights to understand feature usage and real-user performance. These services may collect page views, device type, approximate location, referrer, and performance measurements. Atlas does not use this information for advertising or account profiling. No Atlas account is required, and Atlas does not collect precise location data or ask for personal information through analytics.

## Data accuracy

Route, stop, and frequency data is derived from transit agencies' own published GTFS feeds and may be outdated, incomplete, or wrong — feeds change without notice, and some data on the map is corrected via manual overrides when an agency's feed is known to be bad (see in-app "We corrected this data" links where applicable). **Do not rely on Atlas as your sole source for real-time trip planning** — always check the transit agency's own tools for anything time-sensitive.

## No warranty

Atlas is provided "as is," free of charge, with no guarantee of uptime, accuracy, or continued availability of any given agency's data.

## Changes

These terms may change at any time.

## Contact

For general questions or feedback, email [hey@ryanisnota.pro](mailto:hey@ryanisnota.pro?subject=Atlas%20Contact). Use the in-app report action for a specific schedule or data problem; technical issue tracking remains on [GitHub Issues](https://github.com/Civic-Minds/Atlas/issues).
