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
CREATE TABLE IF NOT EXISTS ingestion_log (
  id           BIGSERIAL   PRIMARY KEY,
  agency_id    TEXT        NOT NULL,
  polled_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  success      BOOLEAN     NOT NULL,
  vehicle_count INTEGER,
  error_msg    TEXT
);

CREATE INDEX IF NOT EXISTS idx_ingestion_agency_time
  ON ingestion_log (agency_id, polled_at DESC);
