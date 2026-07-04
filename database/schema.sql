CREATE TABLE IF NOT EXISTS gtfs_regions (
    id                SERIAL PRIMARY KEY,
    name              VARCHAR NOT NULL,
    country           VARCHAR,
    city              VARCHAR,
    static_url        VARCHAR NOT NULL,
    rt_url            VARCHAR
);

CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    email         VARCHAR UNIQUE NOT NULL,
    password_hash VARCHAR NOT NULL,
    role          VARCHAR NOT NULL DEFAULT 'user'
);

-- =============================================================================
-- GTFS static data — normalized tables, bulk-loaded via COPY with atomic
-- per-region swap (see backend/src/gtfs_store.py). Replaces the in-RAM cache.
-- =============================================================================

CREATE TABLE IF NOT EXISTS gtfs_stops (
    region_id INTEGER NOT NULL REFERENCES gtfs_regions(id) ON DELETE CASCADE,
    stop_id   TEXT NOT NULL,
    name      TEXT,
    lat       DOUBLE PRECISION,
    lon       DOUBLE PRECISION,
    PRIMARY KEY (region_id, stop_id)
);

CREATE TABLE IF NOT EXISTS gtfs_routes (
    region_id  INTEGER NOT NULL REFERENCES gtfs_regions(id) ON DELETE CASCADE,
    route_id   TEXT NOT NULL,
    short_name TEXT,
    PRIMARY KEY (region_id, route_id)
);

CREATE TABLE IF NOT EXISTS gtfs_trips (
    region_id INTEGER NOT NULL REFERENCES gtfs_regions(id) ON DELETE CASCADE,
    trip_id   TEXT NOT NULL,
    route_id  TEXT,
    headsign  TEXT,
    shape_id  TEXT,
    PRIMARY KEY (region_id, trip_id)
);

CREATE TABLE IF NOT EXISTS gtfs_stop_times (
    region_id INTEGER NOT NULL REFERENCES gtfs_regions(id) ON DELETE CASCADE,
    trip_id   TEXT NOT NULL,
    stop_id   TEXT NOT NULL,
    seq       INTEGER,
    dep_time  TEXT
);
CREATE INDEX IF NOT EXISTS ix_stop_times_lookup ON gtfs_stop_times (region_id, stop_id);

CREATE TABLE IF NOT EXISTS gtfs_shapes (
    region_id INTEGER NOT NULL REFERENCES gtfs_regions(id) ON DELETE CASCADE,
    shape_id  TEXT NOT NULL,
    seq       INTEGER,
    lat       DOUBLE PRECISION,
    lon       DOUBLE PRECISION
);
CREATE INDEX IF NOT EXISTS ix_shapes_region ON gtfs_shapes (region_id, shape_id, seq);

-- Service calendars — used to filter the static-schedule fallback to trips that
-- actually run on the requested day.
CREATE TABLE IF NOT EXISTS gtfs_calendar (
    region_id  INTEGER NOT NULL REFERENCES gtfs_regions(id) ON DELETE CASCADE,
    service_id TEXT NOT NULL,
    monday     INTEGER NOT NULL DEFAULT 0,
    tuesday    INTEGER NOT NULL DEFAULT 0,
    wednesday  INTEGER NOT NULL DEFAULT 0,
    thursday   INTEGER NOT NULL DEFAULT 0,
    friday     INTEGER NOT NULL DEFAULT 0,
    saturday   INTEGER NOT NULL DEFAULT 0,
    sunday     INTEGER NOT NULL DEFAULT 0,
    start_date DATE NOT NULL,
    end_date   DATE NOT NULL,
    PRIMARY KEY (region_id, service_id)
);

CREATE TABLE IF NOT EXISTS gtfs_calendar_dates (
    region_id      INTEGER NOT NULL REFERENCES gtfs_regions(id) ON DELETE CASCADE,
    service_id     TEXT NOT NULL,
    date           DATE NOT NULL,
    exception_type INTEGER NOT NULL,          -- 1 = added, 2 = removed
    PRIMARY KEY (region_id, service_id, date)
);

-- Ingest tracking: drives the startup warmer (skip fresh regions on restart),
-- the warming/ready status endpoints, and staleness-based re-ingest.
CREATE TABLE IF NOT EXISTS gtfs_ingest (
    region_id  INTEGER PRIMARY KEY REFERENCES gtfs_regions(id) ON DELETE CASCADE,
    status     TEXT NOT NULL,                 -- 'warming' | 'ready' | 'failed'
    loaded_at  TIMESTAMPTZ,
    etag       TEXT,
    error      TEXT,
    has_shapes BOOLEAN NOT NULL DEFAULT FALSE
);

-- Idempotent migrations for databases created before these columns existed;
-- re-running this whole file against an existing DB is safe.
ALTER TABLE gtfs_trips  ADD COLUMN IF NOT EXISTS service_id TEXT NOT NULL DEFAULT '';
ALTER TABLE gtfs_ingest ADD COLUMN IF NOT EXISTS has_shapes BOOLEAN NOT NULL DEFAULT FALSE;
