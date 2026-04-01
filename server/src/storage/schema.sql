-- Atlas NextGen database schema
-- Run once against a fresh Postgres database:
--   psql $DATABASE_URL -f src/storage/schema.sql

-- Vehicle position snapshots.
-- Every GTFS-RT poll writes one row per active vehicle.
-- This is the raw historical record Atlas NextGen mines for OTP analysis.
CREATE TABLE IF NOT EXISTS vehicle_positions (
  id              BIGSERIAL    PRIMARY KEY,
  agency_id       TEXT         NOT NULL,
  vehicle_id      TEXT         NOT NULL,
  trip_id         TEXT         NOT NULL,
  route_id        TEXT         NOT NULL,
  lat             DOUBLE PRECISION NOT NULL,
  lon             DOUBLE PRECISION NOT NULL,
  speed           REAL,
  bearing         REAL,
  stop_id         TEXT,
  stop_sequence   INTEGER,
  current_status  SMALLINT,
  delay_seconds   INTEGER,       -- Difference vs. scheduled time (positive = delayed, negative = early)
  match_confidence REAL,         -- 0.0–1.0 score for spatial matches
  is_detour       BOOLEAN      NOT NULL DEFAULT FALSE,
  dist_from_shape REAL,          -- Distance in meters from assigned shape
  observed_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Index for the most common query pattern: "give me all positions for agency X
-- on route Y over a time range, ordered by time"
CREATE INDEX IF NOT EXISTS idx_vp_agency_route_time
  ON vehicle_positions (agency_id, route_id, observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_vp_trip
  ON vehicle_positions (trip_id, observed_at DESC);

-- Index for the all-vehicles query: latest position per vehicle across an agency
CREATE INDEX IF NOT EXISTS idx_vp_agency_vehicle_time
  ON vehicle_positions (agency_id, vehicle_id, observed_at DESC);

-- Ingestion health log.
-- One row per poll attempt — tracks success/failure for monitoring.
-- NOTE: This table should be pruned periodically. Delete rows older than 90 days:
--   DELETE FROM ingestion_log WHERE polled_at < NOW() - INTERVAL '90 days';
CREATE TABLE IF NOT EXISTS ingestion_log (
  id           BIGSERIAL   PRIMARY KEY,
  agency_id    TEXT        NOT NULL,
  polled_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  success      BOOLEAN     NOT NULL,
  vehicle_count INTEGER,
  error_msg    TEXT,
  notion_sync_at TIMESTAMPTZ,
  notion_sync_status TEXT
);

CREATE INDEX IF NOT EXISTS idx_ingestion_agency_time
  ON ingestion_log (agency_id, polled_at DESC);

-- Segment Performance Metrics (Phase 2 Intelligence)
-- Tracks actual vs. scheduled travel time between specific stop sequences.
-- This is the data source for bottleneck and dwell-time analysis.
CREATE TABLE IF NOT EXISTS segment_metrics (
  id                     BIGSERIAL    PRIMARY KEY,
  agency_id              TEXT         NOT NULL,
  trip_id                TEXT         NOT NULL,
  route_id               TEXT         NOT NULL,
  from_stop_id           TEXT         NOT NULL,
  to_stop_id             TEXT         NOT NULL,
  observed_seconds       INTEGER      NOT NULL, -- Actual travel time A->B
  scheduled_seconds      INTEGER      NOT NULL, -- Scheduled travel time A->B
  delay_delta_seconds    INTEGER      NOT NULL, -- Net delay added in this segment
  observed_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sm_route_stops
  ON segment_metrics (route_id, from_stop_id, to_stop_id, observed_at DESC);

-- Stop Dwell Metrics (Phase 2 Intelligence)
-- Tracks how long a vehicle remains at a "AT_STOP" status.
-- Pinpoints bottlenecks like fare-payment delays or heavy boarding zones.
CREATE TABLE IF NOT EXISTS stop_dwell_metrics (
  id                     BIGSERIAL    PRIMARY KEY,
  agency_id              TEXT         NOT NULL,
  trip_id                TEXT         NOT NULL,
  route_id               TEXT         NOT NULL,
  stop_id                TEXT         NOT NULL,
  dwell_seconds          INTEGER      NOT NULL,
  observed_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sd_route_stop
  ON stop_dwell_metrics (route_id, stop_id, observed_at DESC);
