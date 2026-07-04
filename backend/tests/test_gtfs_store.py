"""Tests for src/gtfs_store.py — read queries via a mocked psycopg3 pool.

The store opens a ConnectionPool at first call (_get_pool is lazy). All tests here
replace _get_pool with a fake that sequences prepared result rows, so no real
Postgres instance is required.
"""
from __future__ import annotations

import logging
from datetime import date

import pytest
from unittest.mock import patch

import src.gtfs_store as gtfs_store
from src.gtfs_store import (
    _gtfs_date,
    get_all_stops,
    get_departures,
    get_shapes,
    get_trip_lines,
    resolve_stop,
)


# ---------------------------------------------------------------------------
# Fake psycopg3 pool/connection/cursor stack
# ---------------------------------------------------------------------------

class FakeCursor:
    """Sequences through (fetchone, fetchall, iter_rows) on each execute() call.

    The tuple pattern mirrors the three ways gtfs_store reads results:
    - fetchone() → used by resolve_stop for the exact-match lookup
    - fetchall() → used by get_departures, get_trip_lines, get_shapes (2nd execute)
    - iteration  → used by get_shapes (1st execute) to stream shape rows
    """

    def __init__(self, result_seq: list[tuple]):
        self._seq = iter(result_seq)
        self._cur: tuple = (None, [], [])
        self.executed: list[str] = []

    def execute(self, sql: str, params=None) -> None:
        self.executed.append(sql)
        self._cur = next(self._seq, (None, [], []))

    def fetchone(self):
        return self._cur[0]

    def fetchall(self) -> list:
        return list(self._cur[1])

    def __iter__(self):
        return iter(self._cur[2])

    def __enter__(self): return self
    def __exit__(self, *args): pass


class FakeConn:
    def __init__(self, cursor: FakeCursor):
        self._cursor = cursor

    def cursor(self) -> FakeCursor:
        return self._cursor

    def __enter__(self): return self
    def __exit__(self, *args): pass


class FakePool:
    def __init__(self, cursor: FakeCursor):
        self._conn = FakeConn(cursor)

    def connection(self) -> FakeConn:
        return self._conn


def _pool(result_seq: list[tuple]) -> FakePool:
    return FakePool(FakeCursor(result_seq))


# ---------------------------------------------------------------------------
# resolve_stop
# ---------------------------------------------------------------------------

def test_resolve_stop_exact_match():
    """Exact stop_id hit → returns the stored name and coordinates."""
    pool = _pool([
        (("Central Station", 54.4, 18.5), [], []),  # exact-match execute hit
    ])
    with patch.object(gtfs_store, "_get_pool", return_value=pool):
        sid, name, lat, lon = resolve_stop(1, "S001")

    assert (sid, name, lat, lon) == ("S001", "Central Station", 54.4, 18.5)


def test_resolve_stop_falls_back_to_ilike():
    """No exact match → ILIKE name search is tried and its first result is returned."""
    pool = _pool([
        (None, [], []),                                        # exact miss
        (None, [("S042", "Main Station", 54.3, 18.4)], []),  # ILIKE hit
    ])
    with patch.object(gtfs_store, "_get_pool", return_value=pool):
        sid, name, lat, lon = resolve_stop(1, "main")

    assert sid == "S042"
    assert name == "Main Station"
    assert lat == 54.3


def test_resolve_stop_passthrough_on_total_miss():
    """When both lookups fail the input id is echoed back with None coordinates."""
    pool = _pool([
        (None, [], []),  # exact miss
        (None, [], []),  # ILIKE miss
    ])
    with patch.object(gtfs_store, "_get_pool", return_value=pool):
        result = resolve_stop(1, "UNKNOWN_ID")

    assert result == ("UNKNOWN_ID", "UNKNOWN_ID", None, None)


def test_resolve_stop_warns_on_multiple_ilike_matches(caplog):
    """Ambiguous name substring → warning logged, first match used."""
    pool = _pool([
        (None, [], []),
        (None, [
            ("S001", "Central Station", 54.0, 18.0),
            ("S002", "Central Park",    54.1, 18.1),
        ], []),
    ])
    with caplog.at_level(logging.WARNING, logger="src.gtfs_store"), \
         patch.object(gtfs_store, "_get_pool", return_value=pool):
        sid, *_ = resolve_stop(1, "central")

    assert sid == "S001"
    assert caplog.records, "expected a warning for ambiguous name match"


# ---------------------------------------------------------------------------
# get_departures
#
# First execute is the has-calendar EXISTS probe (fetchone), the second is the
# departures select (fetchall) — unfiltered when the probe is falsy, filtered
# by active service_ids when truthy.
# ---------------------------------------------------------------------------

_MONDAY = date(2026, 6, 29)


def test_get_departures_no_calendar_returns_all_rows():
    rows = [("08:00:00", "120", "Centrum"), ("08:15:00", "120", "Centrum")]
    pool = _pool([
        ((False,), [], []),   # EXISTS probe: feed ships no calendar data
        (None, rows, []),
    ])
    with patch.object(gtfs_store, "_get_pool", return_value=pool):
        assert get_departures(1, "S001", _MONDAY) == rows
    assert "WITH active" not in pool._conn._cursor.executed[-1]


def test_get_departures_with_calendar_filters_by_service():
    rows = [("08:00:00", "120", "Centrum")]
    pool = _pool([
        ((True,), [], []),    # EXISTS probe: calendar present
        (None, rows, []),
    ])
    with patch.object(gtfs_store, "_get_pool", return_value=pool):
        assert get_departures(1, "S001", _MONDAY) == rows
    sql = pool._conn._cursor.executed[-1]
    assert "WITH active" in sql
    assert "monday=1" in sql        # 2026-06-29 is a Monday
    assert "exception_type=1" in sql and "exception_type=2" in sql


def test_get_departures_dow_column_tracks_service_date():
    pool = _pool([((True,), [], []), (None, [], [])])
    with patch.object(gtfs_store, "_get_pool", return_value=pool):
        get_departures(1, "S001", date(2026, 7, 4))   # a Saturday
    assert "saturday=1" in pool._conn._cursor.executed[-1]


def test_get_departures_empty_stop():
    pool = _pool([((False,), [], []), (None, [], [])])
    with patch.object(gtfs_store, "_get_pool", return_value=pool):
        assert get_departures(1, "NOSTOP", _MONDAY) == []


# ---------------------------------------------------------------------------
# get_trip_lines
# ---------------------------------------------------------------------------

def test_get_trip_lines_empty_input_never_hits_db():
    """The empty-ids short-circuit must prevent any pool/cursor allocation."""
    with patch.object(gtfs_store, "_get_pool",
                      side_effect=AssertionError("pool must not be touched")):
        assert get_trip_lines(1, []) == {}


def test_get_trip_lines_maps_trip_ids_to_line_and_headsign():
    rows = [("T01", "120", "Centrum"), ("T02", "S1", "Wrzeszcz")]
    with patch.object(gtfs_store, "_get_pool", return_value=_pool([(None, rows, [])])):
        result = get_trip_lines(1, ["T01", "T02"])

    assert result == {"T01": ("120", "Centrum"), "T02": ("S1", "Wrzeszcz")}


# ---------------------------------------------------------------------------
# get_shapes
# ---------------------------------------------------------------------------

def test_get_shapes_builds_polylines_from_streamed_rows():
    """Shape points come from cursor iteration; route mapping from a second fetchall."""
    shape_rows  = [("SH1", 54.4, 18.5), ("SH1", 54.5, 18.6), ("SH2", 54.3, 18.4)]
    route_rows  = [("SH1", "120"), ("SH2", "S1")]
    pool = _pool([
        (None, [], shape_rows),  # first execute: iterate shape points
        (None, route_rows, []),  # second execute: fetchall route mapping
    ])
    with patch.object(gtfs_store, "_get_pool", return_value=pool):
        shapes, shape_to_route = get_shapes(1)

    assert shapes == {
        "SH1": [(54.4, 18.5), (54.5, 18.6)],
        "SH2": [(54.3, 18.4)],
    }
    assert shape_to_route == {"SH1": "120", "SH2": "S1"}


def test_get_shapes_empty_region():
    pool = _pool([(None, [], []), (None, [], [])])
    with patch.object(gtfs_store, "_get_pool", return_value=pool):
        shapes, shape_to_route = get_shapes(99)

    assert shapes == {}
    assert shape_to_route == {}


# ---------------------------------------------------------------------------
# _gtfs_date — YYYYMMDD parsing for calendar ingest
# ---------------------------------------------------------------------------

def test_gtfs_date_parses_valid():
    assert _gtfs_date("20260704") == date(2026, 7, 4)


@pytest.mark.parametrize("raw", [None, "", "2026-07-04", "2026070", "202607040", "2026070x", "20261340"])
def test_gtfs_date_rejects_malformed(raw):
    assert _gtfs_date(raw) is None


# ---------------------------------------------------------------------------
# get_all_stops
# ---------------------------------------------------------------------------

def test_get_all_stops_returns_coordinate_list():
    rows = [("S001", "Central", 54.4, 18.5), ("S002", "North", 54.5, 18.6)]
    with patch.object(gtfs_store, "_get_pool", return_value=_pool([(None, rows, [])])):
        assert get_all_stops(1) == rows


def test_get_all_stops_empty_region():
    with patch.object(gtfs_store, "_get_pool", return_value=_pool([(None, [], [])])):
        assert get_all_stops(99) == []
