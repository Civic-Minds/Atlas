# Manually maintained GTFS sources

This is the authoritative list of Atlas agencies whose currently published
GTFS artifact was received or maintained manually rather than downloaded from
the configured public `feedUrl`.

This list is intentionally separate from the [manual GTFS refresh
queue](MANUAL_GTFS_REFRESHES.md). The refresh queue tracks agencies that need
source recovery; this list tracks the provenance of feeds that Atlas has
actually accepted and published.

| Agency | Current source | Published artifact | Notes |
| --- | --- | --- | --- |
| `brantford` | Direct agency-provided GTFS file received by email | `2026-10-06` | `feedUrl` remains `null`; the file was processed, quality-checked, and published as Brantford Transit. |

## Maintenance rules

- Add an agency here when a GTFS file is received directly, uploaded manually,
  or otherwise maintained outside the configured public feed URL.
- Record the agency slug, how the file was received, the publication date, and
  any reason Atlas cannot use an automated source.
- Do not infer manual provenance only from `feedUrl: null`; some agencies have
  no currently usable source or are backed by an archived artifact for other
  reasons.
- Keep the raw file or archive reference in the internal pipeline records when
  available. Do not place credentials or private attachments in this public
  documentation file.
