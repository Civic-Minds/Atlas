# Adding an Agency

## 1. Process the feed

```bash
# add R2_* credentials to .env.local (see pipeline/r2.ts)
npm run process -- /path/to/feed.zip slug "Display Name" "lat,lon"
```

Then ensure the agency's stable `feedUrl` (and `mdbFeedUrl` if using Mobility Database mirror) is in `public/data/index.json`. Artifact URLs are derived automatically — you usually don't need to edit the `url`/`stopsUrl`/`corridorsUrl` fields.

If an agency's official URL is dead or unreliable, use the Mobility Database stable mirror: find the feed at github.com/MobilityData/mobility-database-catalogs, then `https://storage.googleapis.com/storage/v1/b/mdb-latest/o/{feed-id}.zip?alt=media` (GRT and Niagara already use this).

**bbox vs. center**: if an agency's service area is larger than ±0.4/0.5° from its center (e.g. statewide or regional services like Bustang), add an explicit `bbox: [s, w, n, e]` in index.json. Without it, the GeoJSON won't load into the sidebar for viewports that are outside the ±0.5° window — route cards won't appear even though PMTiles renders the routes.

## 2. Rebuild and upload PMTiles — do not skip this

The per-agency GeoJSON (from step 1) is what powers search and the sidebar route cards. It is **not** what renders routes on the map — that's a single aggregate `atlas.pmtiles` file built from *every* agency's current GeoJSON, and it only updates when you explicitly rebuild and upload it:

```bash
npm run build-pmtiles
npm run upload-pmtiles
```

**This step has been skipped before and shipped silently broken agencies** — the route exists in search results and the sidebar card, with real headway data, but nothing draws on the map, because the aggregate tile file was never rebuilt to include it. It doesn't error; it just quietly renders nothing for that agency. Confirmed twice: a newly-added agency (GTrans) that never got its first PMTiles build, and an existing agency (LA Metro) whose rail lines were added to the feed but the PMTiles rebuild step was missed on that change.

Verify the rebuild actually picked up the new/changed agency:

```bash
npm run verify-pmtiles-coverage
```

This compares every agency slug in `index.json` against which slugs actually have route features in the deployed PMTiles and fails loudly on any gap. Run it after every `build-pmtiles` + `upload-pmtiles`, not just when adding a brand-new agency — it also catches an existing agency whose feed changed (new routes, new mode) without a rebuild.

## 3. Commit and deploy

Commit `index.json`. PMTiles upload is a separate live action (goes straight to R2, not part of the git history) — see `docs/ARCHITECTURE.md` for the R2 bucket layout if you need it.

## Gotchas

**Mid-week data fix cache bust**: the browser caches agency GeoJSON in IndexedDB keyed by `${slug}-${weekVersion}`. If you re-process an agency mid-week (e.g. fixing a wrong feed), the IDB cache won't update automatically. Bump `CACHE_BUILD` in `src/lib/agencyGeo.ts` to invalidate the old entries and force a fresh fetch from R2.

---

[Back to Data](./DATA.md)
