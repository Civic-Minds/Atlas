-- =============================================================================
-- Atlas Static Database Schema
-- Version: 1.0.0
-- =============================================================================
--
-- PURPOSE
-- -------
-- This is the "static" Postgres database for the Atlas transit intelligence
-- platform. It stores everything derived from GTFS static feeds:
--   - Agency accounts (multi-tenant, subscription-aware)
--   - Feed versions (immutable snapshots, full history preserved forever)
--   - All GTFS entities (routes, stops, trips, stop times, calendar) tied to
--     a specific feed version
--   - Computed analysis results (headway stats, frequency tier classification)
--   - Route shape geometry (PostGIS LineString)
--
-- SEPARATION FROM REALTIME DB
-- ----------------------------
-- This database has NO foreign keys that reference the realtime database.
-- Cross-database joins happen at the application layer, joined on
-- (agency_id, route_id, feed_version_id) as stable shared keys.
--
-- FEED VERSIONING MODEL
-- ---------------------
-- Every GTFS upload creates a new feed_version row. Old versions are NEVER
-- deleted — full history is preserved. All routes, stops, trips, and analysis
-- results are scoped to a feed_version_id (UUID), not just an agency_id.
-- The "current" version for an agency is the one with is_current = TRUE.
--
-- MULTI-TENANCY
-- -------------
-- The top-level entity is an "agency_account" (a paying customer or internal
-- workspace). All data is partitioned by agency_account_id for isolation.
--
-- PREREQUISITES
-- -------------
-- PostGIS extension must be installed. Run once against a fresh database:
--   psql $STATIC_DATABASE_URL -f schema_static.sql
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS postgis;


-- =============================================================================
-- SECTION 1: ACCOUNT LAYER
-- =============================================================================

CREATE TABLE agency_accounts (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                  TEXT          NOT NULL UNIQUE,
  display_name          TEXT          NOT NULL,
  contact_email         TEXT          NOT NULL,
  tier                  TEXT          NOT NULL DEFAULT 'trial'
                                      CHECK (tier IN ('trial', 'starter', 'pro', 'enterprise', 'internal')),
  subscription_status   TEXT          NOT NULL DEFAULT 'active'
                                      CHECK (subscription_status IN ('active', 'past_due', 'cancelled', 'paused')),
  trial_ends_at         TIMESTAMPTZ,
  subscription_started_at TIMESTAMPTZ,
  billing_customer_id   TEXT,
  max_feed_versions     INTEGER,
  max_agencies          INTEGER,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agency_accounts_slug ON agency_accounts (slug);
CREATE INDEX idx_agency_accounts_tier ON agency_accounts (tier);


CREATE TABLE account_users (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_account_id     UUID          NOT NULL REFERENCES agency_accounts (id) ON DELETE CASCADE,
  auth_provider_id      TEXT          NOT NULL,
  email                 TEXT          NOT NULL,
  display_name          TEXT,
  role                  TEXT          NOT NULL DEFAULT 'viewer'
                                      CHECK (role IN ('owner', 'admin', 'analyst', 'viewer')),
  is_active             BOOLEAN       NOT NULL DEFAULT TRUE,
  invited_at            TIMESTAMPTZ,
  accepted_at           TIMESTAMPTZ,
  last_seen_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (agency_account_id, auth_provider_id),
  UNIQUE (agency_account_id, email)
);

CREATE INDEX idx_account_users_account ON account_users (agency_account_id);
CREATE INDEX idx_account_users_auth    ON account_users (auth_provider_id);


-- =============================================================================
-- SECTION 2: FEED VERSION LAYER
-- =============================================================================

-- Stable identity for a GTFS agency across all feed versions.
-- One agency_account may have multiple gtfs_agencies (e.g. a regional authority).
CREATE TABLE gtfs_agencies (
  id                        UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_account_id         UUID          NOT NULL REFERENCES agency_accounts (id) ON DELETE CASCADE,
  agency_slug               TEXT          NOT NULL, -- stable across versions, never changes
  display_name              TEXT          NOT NULL,
  canonical_gtfs_agency_id  TEXT,
  timezone                  TEXT,
  agency_url                TEXT,
  country_code              CHAR(2),
  region                    TEXT,
  created_at                TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (agency_account_id, agency_slug)
);

CREATE INDEX idx_gtfs_agencies_account ON gtfs_agencies (agency_account_id);
CREATE INDEX idx_gtfs_agencies_slug    ON gtfs_agencies (agency_account_id, agency_slug);


-- Every GTFS ZIP upload = one immutable feed_version row.
-- Old versions are NEVER deleted. Everything else hangs off feed_version_id.
CREATE TABLE feed_versions (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  gtfs_agency_id        UUID          NOT NULL REFERENCES gtfs_agencies (id) ON DELETE RESTRICT,
  agency_account_id     UUID          NOT NULL REFERENCES agency_accounts (id) ON DELETE RESTRICT,
  label                 TEXT,
  feed_info_version     TEXT,
  effective_from        DATE,
  effective_to          DATE,
  original_filename     TEXT          NOT NULL,
  file_size_bytes       BIGINT,
  content_hash          TEXT,         -- SHA-256 of ZIP for deduplication
  status                TEXT          NOT NULL DEFAULT 'pending'
                                      CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
  processing_error      TEXT,
  processed_at          TIMESTAMPTZ,
  route_count           INTEGER,
  stop_count            INTEGER,
  trip_count            INTEGER,
  is_current            BOOLEAN       NOT NULL DEFAULT FALSE,
  uploaded_by_user_id   UUID          REFERENCES account_users (id) ON DELETE SET NULL,
  uploaded_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  -- Summary of changes vs previous version (populated post-processing)
  changes_vs_previous   JSONB,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Exactly one current version per agency at a time
CREATE UNIQUE INDEX idx_feed_versions_current
  ON feed_versions (gtfs_agency_id)
  WHERE is_current = TRUE;

CREATE INDEX idx_feed_versions_agency  ON feed_versions (gtfs_agency_id);
CREATE INDEX idx_feed_versions_account ON feed_versions (agency_account_id);
CREATE INDEX idx_feed_versions_status  ON feed_versions (status);
CREATE INDEX idx_feed_versions_dates   ON feed_versions (effective_from, effective_to);
CREATE INDEX idx_feed_versions_hash    ON feed_versions (content_hash) WHERE content_hash IS NOT NULL;


-- =============================================================================
-- SECTION 3: GTFS ENTITIES
-- All scoped to feed_version_id. Written once, never mutated.
-- NOTE: stop_times are NOT stored — too large (millions of rows per feed).
-- Analysis results are stored in route_frequency_results instead.
-- =============================================================================

CREATE TABLE routes (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_version_id   UUID          NOT NULL REFERENCES feed_versions (id) ON DELETE CASCADE,
  agency_account_id UUID          NOT NULL REFERENCES agency_accounts (id) ON DELETE CASCADE,
  gtfs_route_id     TEXT          NOT NULL,
  gtfs_agency_id    TEXT,
  route_short_name  TEXT,
  route_long_name   TEXT,
  route_type        SMALLINT      NOT NULL,
  route_color       CHAR(6),
  route_text_color  CHAR(6),
  route_desc        TEXT,
  route_url         TEXT,
  mode_category     TEXT,         -- 'rail' | 'surface' | 'ferry'
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (feed_version_id, gtfs_route_id)
);

CREATE INDEX idx_routes_feed_version ON routes (feed_version_id);
CREATE INDEX idx_routes_account      ON routes (agency_account_id);
CREATE INDEX idx_routes_gtfs_id      ON routes (feed_version_id, gtfs_route_id);
CREATE INDEX idx_routes_short_name   ON routes (feed_version_id, route_short_name);


CREATE TABLE stops (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_version_id   UUID          NOT NULL REFERENCES feed_versions (id) ON DELETE CASCADE,
  agency_account_id UUID          NOT NULL REFERENCES agency_accounts (id) ON DELETE CASCADE,
  gtfs_stop_id      TEXT          NOT NULL,
  stop_code         TEXT,
  stop_name         TEXT          NOT NULL,
  stop_desc         TEXT,
  stop_lat          DOUBLE PRECISION NOT NULL,
  stop_lon          DOUBLE PRECISION NOT NULL,
  geom              GEOMETRY(Point, 4326),
  zone_id           TEXT,
  location_type     SMALLINT      DEFAULT 0,
  parent_station    TEXT,
  stop_url          TEXT,
  wheelchair_boarding SMALLINT,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (feed_version_id, gtfs_stop_id)
);

CREATE INDEX idx_stops_feed_version ON stops (feed_version_id);
CREATE INDEX idx_stops_account      ON stops (agency_account_id);
CREATE INDEX idx_stops_gtfs_id      ON stops (feed_version_id, gtfs_stop_id);
CREATE INDEX idx_stops_geom         ON stops USING GIST (geom);


CREATE TABLE trips (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_version_id   UUID          NOT NULL REFERENCES feed_versions (id) ON DELETE CASCADE,
  agency_account_id UUID          NOT NULL REFERENCES agency_accounts (id) ON DELETE CASCADE,
  gtfs_trip_id      TEXT          NOT NULL,
  gtfs_route_id     TEXT          NOT NULL,
  service_id        TEXT          NOT NULL,
  trip_headsign     TEXT,
  trip_short_name   TEXT,
  direction_id      SMALLINT,
  block_id          TEXT,
  shape_id          TEXT,
  wheelchair_accessible SMALLINT,
  bikes_allowed     SMALLINT,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (feed_version_id, gtfs_trip_id)
);

CREATE INDEX idx_trips_feed_version ON trips (feed_version_id);
CREATE INDEX idx_trips_account      ON trips (agency_account_id);
CREATE INDEX idx_trips_route        ON trips (feed_version_id, gtfs_route_id);
CREATE INDEX idx_trips_service      ON trips (feed_version_id, service_id);
CREATE INDEX idx_trips_shape        ON trips (feed_version_id, shape_id) WHERE shape_id IS NOT NULL;


-- Service patterns from calendar.txt
CREATE TABLE calendar_services (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_version_id   UUID          NOT NULL REFERENCES feed_versions (id) ON DELETE CASCADE,
  agency_account_id UUID          NOT NULL REFERENCES agency_accounts (id) ON DELETE CASCADE,
  service_id        TEXT          NOT NULL,
  -- Bit 0=Monday ... Bit 6=Sunday. Weekdays=31, Weekend=96
  days_bitmask      SMALLINT      NOT NULL DEFAULT 0,
  monday            BOOLEAN       NOT NULL DEFAULT FALSE,
  tuesday           BOOLEAN       NOT NULL DEFAULT FALSE,
  wednesday         BOOLEAN       NOT NULL DEFAULT FALSE,
  thursday          BOOLEAN       NOT NULL DEFAULT FALSE,
  friday            BOOLEAN       NOT NULL DEFAULT FALSE,
  saturday          BOOLEAN       NOT NULL DEFAULT FALSE,
  sunday            BOOLEAN       NOT NULL DEFAULT FALSE,
  start_date        DATE          NOT NULL,
  end_date          DATE          NOT NULL,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (feed_version_id, service_id)
);

CREATE INDEX idx_calendar_services_feed  ON calendar_services (feed_version_id);
CREATE INDEX idx_calendar_services_dates ON calendar_services (feed_version_id, start_date, end_date);


-- Exceptions from calendar_dates.txt (1=added, 2=removed)
CREATE TABLE calendar_exceptions (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_version_id   UUID          NOT NULL REFERENCES feed_versions (id) ON DELETE CASCADE,
  agency_account_id UUID          NOT NULL REFERENCES agency_accounts (id) ON DELETE CASCADE,
  service_id        TEXT          NOT NULL,
  exception_date    DATE          NOT NULL,
  exception_type    SMALLINT      NOT NULL CHECK (exception_type IN (1, 2)),
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (feed_version_id, service_id, exception_date)
);

CREATE INDEX idx_calendar_exceptions_feed    ON calendar_exceptions (feed_version_id);
CREATE INDEX idx_calendar_exceptions_date    ON calendar_exceptions (feed_version_id, exception_date);
CREATE INDEX idx_calendar_exceptions_service ON calendar_exceptions (feed_version_id, service_id);


-- =============================================================================
-- SECTION 4: GEOMETRY
-- =============================================================================

-- One canonical LineString per route + direction per feed version.
-- Selected as the most-common shape_id among all trips on that route+direction.
CREATE TABLE route_shapes (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_version_id   UUID          NOT NULL REFERENCES feed_versions (id) ON DELETE CASCADE,
  agency_account_id UUID          NOT NULL REFERENCES agency_accounts (id) ON DELETE CASCADE,
  gtfs_route_id     TEXT          NOT NULL,
  direction_id      SMALLINT      NOT NULL DEFAULT 0,
  source_shape_id   TEXT,
  geom              GEOMETRY(LineString, 4326) NOT NULL,
  bbox_min_lat      DOUBLE PRECISION,
  bbox_max_lat      DOUBLE PRECISION,
  bbox_min_lon      DOUBLE PRECISION,
  bbox_max_lon      DOUBLE PRECISION,
  trip_vote_count   INTEGER,
  is_synthesised    BOOLEAN       NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (feed_version_id, gtfs_route_id, direction_id)
);

CREATE INDEX idx_route_shapes_feed_version ON route_shapes (feed_version_id);
CREATE INDEX idx_route_shapes_route        ON route_shapes (feed_version_id, gtfs_route_id);
CREATE INDEX idx_route_shapes_geom         ON route_shapes USING GIST (geom);


-- =============================================================================
-- SECTION 5: ANALYSIS RESULTS
-- =============================================================================

-- Named analysis criteria configurations. Mirrors AnalysisCriteria in gtfs.ts.
-- NULL agency_account_id = system-wide default shared across all accounts.
CREATE TABLE analysis_criteria (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_account_id     UUID          REFERENCES agency_accounts (id) ON DELETE CASCADE,
  slug                  TEXT          NOT NULL,
  display_name          TEXT          NOT NULL,
  is_default            BOOLEAN       NOT NULL DEFAULT FALSE,
  is_system             BOOLEAN       NOT NULL DEFAULT FALSE,
  config                JSONB         NOT NULL,
  created_by_user_id    UUID          REFERENCES account_users (id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (agency_account_id, slug)
);

CREATE UNIQUE INDEX idx_analysis_criteria_default_system
  ON analysis_criteria (is_default)
  WHERE is_default = TRUE AND agency_account_id IS NULL;

CREATE INDEX idx_analysis_criteria_account ON analysis_criteria (agency_account_id);


-- One run = one (feed_version, analysis_criteria) pair.
CREATE TABLE analysis_runs (
  id                        UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_version_id           UUID          NOT NULL REFERENCES feed_versions (id) ON DELETE CASCADE,
  agency_account_id         UUID          NOT NULL REFERENCES agency_accounts (id) ON DELETE CASCADE,
  analysis_criteria_id      UUID          NOT NULL REFERENCES analysis_criteria (id) ON DELETE RESTRICT,
  status                    TEXT          NOT NULL DEFAULT 'pending'
                                          CHECK (status IN ('pending', 'running', 'complete', 'failed')),
  error_message             TEXT,
  reference_date            DATE,
  started_at                TIMESTAMPTZ,
  completed_at              TIMESTAMPTZ,
  routes_analysed           INTEGER,
  routes_frequent           INTEGER,
  routes_limited            INTEGER,
  routes_infrequent         INTEGER,
  triggered_by_user_id      UUID          REFERENCES account_users (id) ON DELETE SET NULL,
  created_at                TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (feed_version_id, analysis_criteria_id)
);

CREATE INDEX idx_analysis_runs_feed_version ON analysis_runs (feed_version_id);
CREATE INDEX idx_analysis_runs_account      ON analysis_runs (agency_account_id);
CREATE INDEX idx_analysis_runs_status       ON analysis_runs (status);


-- Primary analysis output. One row per route + direction + day_type per run.
-- Join to route_shapes on (feed_version_id, gtfs_route_id, direction_id) for map.
-- Query across feed versions for schedule change comparison.
CREATE TABLE route_frequency_results (
  id                        UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_run_id           UUID          NOT NULL REFERENCES analysis_runs (id) ON DELETE CASCADE,
  feed_version_id           UUID          NOT NULL REFERENCES feed_versions (id) ON DELETE CASCADE,
  agency_account_id         UUID          NOT NULL REFERENCES agency_accounts (id) ON DELETE CASCADE,
  gtfs_route_id             TEXT          NOT NULL,
  route_short_name          TEXT,
  route_long_name           TEXT,
  route_type                SMALLINT,
  mode_category             TEXT,
  direction_id              SMALLINT      NOT NULL DEFAULT 0,
  day_type                  TEXT          NOT NULL CHECK (day_type IN ('Weekday', 'Saturday', 'Sunday')),
  days_included             TEXT[]        NOT NULL DEFAULT '{}',
  tier                      TEXT          NOT NULL,
  avg_headway               NUMERIC(10,2),
  median_headway            NUMERIC(10,2),
  peak_headway              NUMERIC(10,2),
  base_headway              NUMERIC(10,2),
  headway_variance          NUMERIC(12,2),
  service_span_start        INTEGER,      -- minutes from midnight
  service_span_end          INTEGER,
  trip_count                INTEGER,
  reliability_score         NUMERIC(6,2),
  consistency_score         NUMERIC(6,2),
  bunching_factor           NUMERIC(6,4),
  bunching_penalty          NUMERIC(6,2),
  outlier_penalty           NUMERIC(6,2),
  peak_window_start         INTEGER,
  peak_window_end           INTEGER,
  contributing_service_ids  TEXT[],
  warnings                  TEXT[],
  verification_status       TEXT          NOT NULL DEFAULT 'unreviewed'
                                          CHECK (verification_status IN
                                            ('unreviewed', 'verified', 'flagged', 'skipped')),
  verified_at               TIMESTAMPTZ,
  verified_by_user_id       UUID          REFERENCES account_users (id) ON DELETE SET NULL,
  verification_notes        TEXT,
  created_at                TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (analysis_run_id, gtfs_route_id, direction_id, day_type)
);

CREATE INDEX idx_rfr_analysis_run      ON route_frequency_results (analysis_run_id);
CREATE INDEX idx_rfr_feed_version      ON route_frequency_results (feed_version_id);
CREATE INDEX idx_rfr_account           ON route_frequency_results (agency_account_id);
CREATE INDEX idx_rfr_route             ON route_frequency_results (feed_version_id, gtfs_route_id);
CREATE INDEX idx_rfr_tier              ON route_frequency_results (agency_account_id, tier);
CREATE INDEX idx_rfr_day_type          ON route_frequency_results (feed_version_id, day_type);
CREATE INDEX idx_rfr_account_route_day ON route_frequency_results (agency_account_id, gtfs_route_id, day_type);
CREATE INDEX idx_rfr_verification      ON route_frequency_results (verification_status)
  WHERE verification_status = 'unreviewed';


-- =============================================================================
-- SECTION 6: FEED COMPARISON
-- Pre-computed diffs between two feed versions. Cached on demand.
-- Answers: "did route 510 get more frequent after the September schedule change?"
-- =============================================================================

CREATE TABLE feed_version_comparisons (
  id                        UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_account_id         UUID          NOT NULL REFERENCES agency_accounts (id) ON DELETE CASCADE,
  base_feed_version_id      UUID          NOT NULL REFERENCES feed_versions (id) ON DELETE CASCADE,
  head_feed_version_id      UUID          NOT NULL REFERENCES feed_versions (id) ON DELETE CASCADE,
  analysis_criteria_id      UUID          NOT NULL REFERENCES analysis_criteria (id) ON DELETE RESTRICT,
  day_type                  TEXT          CHECK (day_type IN ('Weekday', 'Saturday', 'Sunday')),
  -- Array of per-route change objects:
  -- { gtfs_route_id, route_short_name, direction_id, day_type,
  --   base_tier, head_tier, base_avg_headway, head_avg_headway,
  --   change_type: 'improved'|'degraded'|'added'|'removed'|'unchanged' }
  results_json              JSONB         NOT NULL DEFAULT '[]',
  routes_improved           INTEGER       NOT NULL DEFAULT 0,
  routes_degraded           INTEGER       NOT NULL DEFAULT 0,
  routes_added              INTEGER       NOT NULL DEFAULT 0,
  routes_removed            INTEGER       NOT NULL DEFAULT 0,
  routes_unchanged          INTEGER       NOT NULL DEFAULT 0,
  computed_at               TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  computed_by_user_id       UUID          REFERENCES account_users (id) ON DELETE SET NULL,
  UNIQUE (base_feed_version_id, head_feed_version_id, analysis_criteria_id, day_type)
);

CREATE INDEX idx_fvc_account ON feed_version_comparisons (agency_account_id);
CREATE INDEX idx_fvc_base    ON feed_version_comparisons (base_feed_version_id);
CREATE INDEX idx_fvc_head    ON feed_version_comparisons (head_feed_version_id);


-- =============================================================================
-- SECTION 7: AUDIT LOG
-- Append-only. Never update or delete rows.
-- =============================================================================

CREATE TABLE audit_log (
  id                BIGSERIAL     PRIMARY KEY,
  agency_account_id UUID          REFERENCES agency_accounts (id) ON DELETE SET NULL,
  user_id           UUID          REFERENCES account_users (id) ON DELETE SET NULL,
  action            TEXT          NOT NULL,
  entity_type       TEXT,
  entity_id         TEXT,
  metadata          JSONB,
  ip_address        INET,
  user_agent        TEXT,
  occurred_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_account ON audit_log (agency_account_id, occurred_at DESC);
CREATE INDEX idx_audit_user    ON audit_log (user_id, occurred_at DESC);
CREATE INDEX idx_audit_action  ON audit_log (action, occurred_at DESC);
CREATE INDEX idx_audit_entity  ON audit_log (entity_type, entity_id);


-- =============================================================================
-- SECTION 8: SEED DATA
-- =============================================================================

INSERT INTO analysis_criteria (
  id, agency_account_id, slug, display_name, is_default, is_system, config
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  NULL,
  'default',
  'Default',
  TRUE,
  TRUE,
  '{
    "dayTypes": {
      "Weekday":  { "timeWindow": {"start": 420, "end": 1320}, "tiers": [10, 15, 20, 30, 60] },
      "Saturday": { "timeWindow": {"start": 420, "end": 1320}, "tiers": [10, 15, 20, 30, 60] },
      "Sunday":   { "timeWindow": {"start": 540, "end": 1260}, "tiers": [10, 15, 20, 30, 60] }
    },
    "graceMinutes": 5,
    "maxGraceViolations": 2,
    "modeTierOverrides": {
      "rail":    [5, 8, 10, 15, 30],
      "surface": [10, 15, 20, 30, 60]
    }
  }'::jsonb
) ON CONFLICT DO NOTHING;
