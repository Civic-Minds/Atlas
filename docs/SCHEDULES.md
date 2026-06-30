# Schedule Data & Feed Freshness

Atlas retrieves public schedule data directly from transit agencies' official General Transit Feed Specification (GTFS) feeds. 

## Feed Refresh Cycle
*   **Refresh Schedule**: The ingest pipeline automatically checks for and downloads updated GTFS feeds every **Monday** at 04:00 UTC.
*   **Processing**: Feeds are validated, filtered for frequency tiers, merged into corridors, and converted into PMTiles and metadata.

## "Schedule may be outdated" Notice
If you see a warning indicating that a schedule may be outdated, it means the last-ingested GTFS feed for that agency has expired (its `feed_end_date` has passed).

### Why do feeds expire?
1.  **Upstream Agency Delay**: Transit agencies publish schedule updates at different frequencies. Sometimes, an agency is late to publish their next GTFS feed, or they publish it under a temporary URL that our crawler cannot auto-detect.
2.  **Unpublished Temporary Schedules**: During construction, detours, or special events, agencies may run temporary schedules without publishing them to their primary GTFS feeds.
3.  **Pipeline Ingestion Failures**: Occasionally, a feed's URL changes or becomes rate-limited, causing the automated weekly refresh to fail for that specific agency.

If you suspect an agency's data is permanently broken or has a newer feed URL, please submit feedback or open a pull request on our GitHub repository.
