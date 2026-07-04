"""Postgres-backed GTFS static store: streaming COPY ingest + sync read queries.

Replaces the unbounded in-RAM dict cache. Ingest streams CSV rows straight into
COPY, so peak RAM stays bounded regardless of feed size — no per-region dicts are
ever materialized. The per-region swap is one atomic transaction (DELETE old rows
+ COPY new rows + mark ready), so readers using MVCC never observe a partially
loaded region; a failed ingest rolls back, leaving the previous data intact.

Sync (psycopg3) on purpose: the render path runs in a thread pool, so reads must be
callable without an event loop. The async warmer invokes `ingest_region` via
asyncio.to_thread.
"""
from __future__ import annotations

import csv
import io
import logging
import os
import tempfile
import time
import zipfile
from datetime import date

import psycopg
import requests
from dotenv import load_dotenv
from psycopg_pool import ConnectionPool

logger = logging.getLogger(__name__)

load_dotenv()
_DSN = os.environ["DATABASE_URL"].replace("+asyncpg", "")  # asyncpg URL → libpq DSN

_CONNECT_TIMEOUT = 10
_READ_TIMEOUT    = 120
_session = requests.Session()

_TABLES = ("gtfs_stops", "gtfs_routes", "gtfs_trips", "gtfs_stop_times", "gtfs_shapes",
           "gtfs_calendar", "gtfs_calendar_dates")

_pool: ConnectionPool | None = None


def _get_pool() -> ConnectionPool:
    """Lazily open the read pool so importing this module never requires a live DB."""
    global _pool
    if _pool is None:
        _pool = ConnectionPool(_DSN, min_size=1, max_size=10,
                               kwargs={"autocommit": True}, open=True)
    return _pool


def close_pool() -> None:
    """Close the read pool (call on app shutdown)."""
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None


# --- ingest ----------------------------------------------------------------

def _download(static_url: str) -> tuple[str, str | None, int]:
    tmp_fd, tmp_path = tempfile.mkstemp(suffix=".zip")
    etag = None
    try:
        with _session.get(static_url, stream=True,
                          timeout=(_CONNECT_TIMEOUT, _READ_TIMEOUT)) as resp:
            resp.raise_for_status()
            etag = resp.headers.get("ETag") or resp.headers.get("Last-Modified")
            with os.fdopen(tmp_fd, "wb") as fout:
                tmp_fd = -1
                total = 0
                for chunk in resp.iter_content(chunk_size=1 << 20):
                    fout.write(chunk)
                    total += len(chunk)
    finally:
        if tmp_fd >= 0:
            os.close(tmp_fd)
    return tmp_path, etag, total


def _rows(zf: zipfile.ZipFile, name: str):
    with zf.open(name) as f:
        yield from csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig"))


def _copy_stops(cur, region_id, zf):
    n = 0
    with cur.copy("COPY gtfs_stops (region_id, stop_id, name, lat, lon) FROM STDIN") as cp:
        for row in _rows(zf, "stops.txt"):
            sid = row.get("stop_id")
            if not sid:
                continue
            try:
                lat, lon = float(row["stop_lat"]), float(row["stop_lon"])
            except (KeyError, ValueError):
                lat = lon = None
            cp.write_row((region_id, sid, row.get("stop_name") or sid, lat, lon))
            n += 1
    return n


def _copy_routes(cur, region_id, zf):
    n = 0
    with cur.copy("COPY gtfs_routes (region_id, route_id, short_name) FROM STDIN") as cp:
        for row in _rows(zf, "routes.txt"):
            rid = row.get("route_id")
            if not rid:
                continue
            cp.write_row((region_id, rid, row.get("route_short_name") or rid))
            n += 1
    return n


def _copy_trips(cur, region_id, zf):
    n = 0
    with cur.copy("COPY gtfs_trips (region_id, trip_id, route_id, headsign, shape_id, service_id) FROM STDIN") as cp:
        for row in _rows(zf, "trips.txt"):
            tid = row.get("trip_id")
            if not tid:
                continue
            cp.write_row((region_id, tid, row.get("route_id") or "",
                          row.get("trip_headsign") or "", row.get("shape_id") or "",
                          row.get("service_id") or ""))
            n += 1
    return n


def _gtfs_date(s: str | None):
    """Parse a GTFS YYYYMMDD date; None on anything malformed."""
    if not s or len(s) != 8 or not s.isdigit():
        return None
    try:
        return date(int(s[:4]), int(s[4:6]), int(s[6:8]))
    except ValueError:
        return None


def _copy_calendar(cur, region_id, zf):
    n = 0
    cols = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")
    with cur.copy("COPY gtfs_calendar (region_id, service_id, monday, tuesday, wednesday, "
                  "thursday, friday, saturday, sunday, start_date, end_date) FROM STDIN") as cp:
        for row in _rows(zf, "calendar.txt"):
            sid = row.get("service_id")
            start, end = _gtfs_date(row.get("start_date")), _gtfs_date(row.get("end_date"))
            if not (sid and start and end):
                continue
            days = tuple(1 if (row.get(c) or "").strip() == "1" else 0 for c in cols)
            cp.write_row((region_id, sid, *days, start, end))
            n += 1
    return n


def _copy_calendar_dates(cur, region_id, zf):
    n = 0
    with cur.copy("COPY gtfs_calendar_dates (region_id, service_id, date, exception_type) FROM STDIN") as cp:
        for row in _rows(zf, "calendar_dates.txt"):
            sid, d = row.get("service_id"), _gtfs_date(row.get("date"))
            try:
                exc = int(row.get("exception_type") or 0)
            except ValueError:
                continue
            if not (sid and d and exc in (1, 2)):
                continue
            cp.write_row((region_id, sid, d, exc))
            n += 1
    return n


def _copy_stop_times(cur, region_id, zf):
    n = 0
    with cur.copy("COPY gtfs_stop_times (region_id, trip_id, stop_id, seq, dep_time) FROM STDIN") as cp:
        for row in _rows(zf, "stop_times.txt"):
            tid, sid = row.get("trip_id"), row.get("stop_id")
            dep = (row.get("departure_time") or row.get("arrival_time") or "").strip()
            if not (tid and sid and dep):
                continue
            try:
                seq = int(row["stop_sequence"])
            except (KeyError, ValueError):
                seq = 0
            cp.write_row((region_id, tid, sid, seq, dep))
            n += 1
    return n


def _copy_shapes(cur, region_id, zf):
    n = 0
    with cur.copy("COPY gtfs_shapes (region_id, shape_id, seq, lat, lon) FROM STDIN") as cp:
        for row in _rows(zf, "shapes.txt"):
            sid = row.get("shape_id")
            if not sid:
                continue
            try:
                seq = int(row.get("shape_pt_sequence") or 0)
                lat, lon = float(row["shape_pt_lat"]), float(row["shape_pt_lon"])
            except (KeyError, ValueError):
                continue
            cp.write_row((region_id, sid, seq, lat, lon))
            n += 1
    return n


def ingest_region(region_id: int, static_url: str) -> str | None:
    """Download + load one region atomically. Returns the feed ETag (or None).

    Raises on failure; the transaction rolls back, leaving prior data intact.
    """
    t0 = time.monotonic()
    logger.info(f"[region {region_id}] ingest start — downloading {static_url}")
    tmp_path, etag, size = _download(static_url)
    dl_dt = time.monotonic() - t0
    logger.info(f"[region {region_id}] downloaded {size / 1e6:.1f} MB in {dl_dt:.1f}s "
                f"({size / 1e6 / dl_dt:.1f} MB/s)" if dl_dt else
                f"[region {region_id}] downloaded {size / 1e6:.1f} MB")
    try:
        if not zipfile.is_zipfile(tmp_path):
            with open(tmp_path, "rb") as f:
                head = f.read(200)
            raise ValueError(
                f"URL did not return a valid GTFS zip (got {head[:60]!r}…); "
                f"the feed at {static_url} may have moved or be unavailable"
            )
        _copiers = (
            ("stops.txt",          _copy_stops),
            ("routes.txt",         _copy_routes),
            ("trips.txt",          _copy_trips),
            ("stop_times.txt",     _copy_stop_times),
            ("shapes.txt",         _copy_shapes),
            ("calendar.txt",       _copy_calendar),
            ("calendar_dates.txt", _copy_calendar_dates),
        )
        with zipfile.ZipFile(tmp_path) as zf:
            names = set(zf.namelist())
            t1 = time.monotonic()
            has_shapes = False
            with psycopg.connect(_DSN) as conn:          # single atomic transaction
                with conn.cursor() as cur:
                    for tbl in _TABLES:
                        cur.execute(f"DELETE FROM {tbl} WHERE region_id = %s", (region_id,))
                    for fname, copier in _copiers:
                        if fname not in names:
                            logger.info(f"[region {region_id}] {fname} absent — skipped")
                            continue
                        ts = time.monotonic()
                        rows = copier(cur, region_id, zf)
                        if fname == "shapes.txt":
                            has_shapes = rows > 0
                        logger.info(f"[region {region_id}] COPY {fname}: "
                                    f"{rows:,} rows in {time.monotonic() - ts:.1f}s")
                    cur.execute(
                        """INSERT INTO gtfs_ingest (region_id, status, loaded_at, etag, error, has_shapes)
                           VALUES (%s, 'ready', now(), %s, NULL, %s)
                           ON CONFLICT (region_id) DO UPDATE
                             SET status='ready', loaded_at=now(),
                                 etag=EXCLUDED.etag, error=NULL,
                                 has_shapes=EXCLUDED.has_shapes""",
                        (region_id, etag, has_shapes),
                    )
        logger.info(f"[region {region_id}] committed in {time.monotonic() - t1:.1f}s — "
                    f"ingest done in {time.monotonic() - t0:.1f}s total (etag={etag})")
        return etag
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


# --- read queries ----------------------------------------------------------

def resolve_stop(region_id: int, stop_id: str) -> tuple[str, str, float | None, float | None]:
    """Resolve an exact stop_id or a case-insensitive name substring.

    Returns (real_stop_id, name, lat, lon); passthrough (id, id, None, None) on miss.
    """
    ident = str(stop_id)
    with _get_pool().connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT name, lat, lon FROM gtfs_stops WHERE region_id=%s AND stop_id=%s",
                    (region_id, ident))
        row = cur.fetchone()
        if row:
            return ident, row[0] or ident, row[1], row[2]
        cur.execute("SELECT stop_id, name, lat, lon FROM gtfs_stops "
                    "WHERE region_id=%s AND name ILIKE %s", (region_id, f"%{ident}%"))
        matches = cur.fetchall()
    if not matches:
        return ident, ident, None, None
    if len(matches) > 1:
        logger.warning(
            f"stop_id {ident!r} matched {len(matches)} stops by name substring "
            f"({[m[1] for m in matches[:5]]}); using first. Use exact stop_id to disambiguate."
        )
    sid, name, lat, lon = matches[0]
    return sid, name or sid, lat, lon


_DOW_COLS = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")

_DEPARTURES_SELECT = """
    SELECT st.dep_time,
           COALESCE(r.short_name, t.route_id, '') AS line,
           COALESCE(t.headsign, '')               AS headsign
    FROM gtfs_stop_times st
    JOIN gtfs_trips t  ON t.region_id=st.region_id AND t.trip_id=st.trip_id
    LEFT JOIN gtfs_routes r ON r.region_id=t.region_id AND r.route_id=t.route_id
    WHERE st.region_id=%(rid)s AND st.stop_id=%(sid)s"""


def get_departures(region_id: int, stop_id: str,
                   service_date: date) -> list[tuple[str, str, str]]:
    """Departures at a stop scheduled to run on service_date: (dep_time, line, headsign).

    Filters by calendar/calendar_dates when the feed provides them; a feed with
    no calendar data at all falls back to the unfiltered schedule. Trips running
    past midnight (dep_time >= 24:00) belong to the *previous* service day and
    are not specially handled — acceptable for a departure board.
    """
    dow_col = _DOW_COLS[service_date.weekday()]  # column name from a fixed tuple, not user input
    with _get_pool().connection() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT EXISTS (SELECT 1 FROM gtfs_calendar WHERE region_id=%(rid)s)"
            "    OR EXISTS (SELECT 1 FROM gtfs_calendar_dates WHERE region_id=%(rid)s)",
            {"rid": region_id})
        has_calendar = cur.fetchone()[0]

        if not has_calendar:
            cur.execute(_DEPARTURES_SELECT, {"rid": region_id, "sid": stop_id})
            return cur.fetchall()

        cur.execute(
            f"""WITH active AS (
                    SELECT service_id FROM gtfs_calendar
                    WHERE region_id=%(rid)s AND {dow_col}=1
                      AND %(day)s BETWEEN start_date AND end_date
                    UNION
                    SELECT service_id FROM gtfs_calendar_dates
                    WHERE region_id=%(rid)s AND date=%(day)s AND exception_type=1
                    EXCEPT
                    SELECT service_id FROM gtfs_calendar_dates
                    WHERE region_id=%(rid)s AND date=%(day)s AND exception_type=2
                )
                {_DEPARTURES_SELECT}
                  AND (t.service_id = '' OR
                       t.service_id IN (SELECT service_id FROM active))""",
            {"rid": region_id, "sid": stop_id, "day": service_date})
        return cur.fetchall()


def get_trip_lines(region_id: int, trip_ids: list[str]) -> dict[str, tuple[str, str]]:
    """Map the given trip_ids → (line, headsign), for resolving realtime entities."""
    ids = list(trip_ids)
    if not ids:
        return {}
    with _get_pool().connection() as conn, conn.cursor() as cur:
        cur.execute(
            """SELECT t.trip_id,
                      COALESCE(r.short_name, t.route_id, '') AS line,
                      COALESCE(t.headsign, '')               AS headsign
               FROM gtfs_trips t
               LEFT JOIN gtfs_routes r ON r.region_id=t.region_id AND r.route_id=t.route_id
               WHERE t.region_id=%s AND t.trip_id = ANY(%s)""",
            (region_id, ids))
        return {tid: (line, hs) for tid, line, hs in cur.fetchall()}


def get_shapes(region_id: int) -> tuple[dict[str, list[tuple[float, float]]], dict[str, str]]:
    """Whole-region polylines {shape_id: [(lat,lon)...]} and {shape_id: route_short_name}.

    The one heavy read — callers should bound it with an LRU.
    """
    shapes: dict[str, list[tuple[float, float]]] = {}
    with _get_pool().connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT shape_id, lat, lon FROM gtfs_shapes "
                    "WHERE region_id=%s ORDER BY shape_id, seq", (region_id,))
        for sid, lat, lon in cur:
            shapes.setdefault(sid, []).append((lat, lon))
        cur.execute(
            """SELECT DISTINCT t.shape_id, COALESCE(r.short_name, t.route_id, '')
               FROM gtfs_trips t
               LEFT JOIN gtfs_routes r ON r.region_id=t.region_id AND r.route_id=t.route_id
               WHERE t.region_id=%s AND t.shape_id <> ''""",
            (region_id,))
        shape_to_route = {sid: route for sid, route in cur.fetchall() if sid}
    return shapes, shape_to_route


def get_all_stops(region_id: int) -> list[tuple[str, str, float, float]]:
    """Stops with coordinates for the /stops endpoint: (stop_id, name, lat, lon)."""
    with _get_pool().connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT stop_id, name, lat, lon FROM gtfs_stops "
                    "WHERE region_id=%s AND lat IS NOT NULL AND lon IS NOT NULL", (region_id,))
        return cur.fetchall()
