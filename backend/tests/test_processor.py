"""Tests for src/processor.py — store-backed display data assembly."""
from __future__ import annotations

from datetime import datetime, timezone, timedelta
from unittest.mock import patch

import pytest

from src.processor import build_display_data, _build_from_static


def _patch_store(resolve, *, rt=None, departures=None, shapes=None):
    """Patch the store/fetcher seams used by build_display_data."""
    return (
        patch("src.processor.store.resolve_stop", return_value=resolve),
        patch("src.processor.get_realtime", return_value=rt or []),
        patch("src.processor.store.get_departures", return_value=departures or []),
        patch("src.processor.get_shapes", return_value=(shapes or {}, {})),
    )


def _run(region, *patches):
    import contextlib
    with contextlib.ExitStack() as stack:
        for p in patches:
            stack.enter_context(p)
        return build_display_data(region, "118", limit=10)


# --- stop resolution flows through to the result ---------------------------

def test_resolved_stop_name_and_coords(region):
    resolve = ("118", "Gdańsk Oliwa PKP", 54.4, 18.5)
    data = _run(region, *_patch_store(resolve))
    assert data["stop_id"] == "118"
    assert data["stop_name"] == "Gdańsk Oliwa PKP"
    assert data["stop_coords"] == (54.4, 18.5)


def test_missing_coords_yield_none(region):
    resolve = ("UNKNOWN", "UNKNOWN", None, None)
    data = _run(region, *_patch_store(resolve))
    assert data["stop_coords"] is None


def test_result_has_full_key_set(region):
    data = _run(region, *_patch_store(("118", "X", 1.0, 2.0)))
    assert set(data) == {
        "stop_name", "stop_id", "region_id", "arrivals", "updated_at",
        "stop_coords", "shapes", "has_shapes", "shape_to_route",
    }


# --- RT vs static fallback -------------------------------------------------

def test_rt_arrivals_used_when_available(region):
    """When RT yields arrivals, the static fallback must not run."""
    future = datetime.now(timezone.utc) + timedelta(minutes=5)
    rt_arrival = {"line": "120", "destination": "Gdańsk Główny",
                  "time": future.isoformat(), "_time_dt": future, "delay": 0}
    with (
        patch("src.processor.store.resolve_stop", return_value=("118", "Oliwa", 1.0, 2.0)),
        patch("src.processor.get_realtime", return_value=[object()]),
        patch("src.processor.get_shapes", return_value=({}, {})),
        patch("src.processor._build_from_rt", return_value=[rt_arrival]),
        patch("src.processor._build_from_static") as mock_static,
    ):
        data = build_display_data(region, "118", limit=10)

    mock_static.assert_not_called()
    assert [a["line"] for a in data["arrivals"]] == ["120"]


def test_static_fallback_used_when_rt_empty(region):
    """When RT yields nothing, the static schedule fallback must be tried."""
    future = datetime.now(timezone.utc) + timedelta(minutes=3)
    static_arrival = {"line": "120", "destination": "Centrum",
                      "time": future.isoformat(), "_time_dt": future, "delay": 0}
    with (
        patch("src.processor.store.resolve_stop", return_value=("118", "Oliwa", 1.0, 2.0)),
        patch("src.processor.get_realtime", return_value=[]),
        patch("src.processor.get_shapes", return_value=({}, {})),
        patch("src.processor._build_from_rt", return_value=[]),
        patch("src.processor._build_from_static", return_value=[static_arrival]) as mock_static,
    ):
        data = build_display_data(region, "118", limit=10)

    mock_static.assert_called_once()
    assert len(data["arrivals"]) == 1


def test_static_only_region_no_crash(region_static_only):
    data = _run(region_static_only, *_patch_store(("118", "Oliwa", 1.0, 2.0)))
    assert isinstance(data["arrivals"], list)


def test_stale_arrivals_filtered(region):
    """Arrivals more than 60s in the past must be dropped."""
    past = datetime.now(timezone.utc) - timedelta(seconds=120)
    stale = {"line": "120", "destination": "X",
             "time": past.isoformat(), "_time_dt": past, "delay": 0}
    with (
        patch("src.processor.store.resolve_stop", return_value=("118", "Oliwa", 1.0, 2.0)),
        patch("src.processor.get_realtime", return_value=[]),
        patch("src.processor.get_shapes", return_value=({}, {})),
        patch("src.processor._build_from_rt", return_value=[stale]),
    ):
        data = build_display_data(region, "118", limit=10)

    assert data["arrivals"] == []


def test_has_shapes_reflects_shape_presence(region):
    data = _run(region, *_patch_store(("118", "Oliwa", 1.0, 2.0),
                                      shapes={"SH1": [(1.0, 2.0)]}))
    assert data["has_shapes"] is True


# --- _build_from_static querying the store ---------------------------------

def test_build_from_static_dedupes_and_parses(region):
    now = datetime(2026, 5, 30, 9, 0, tzinfo=timezone.utc)
    departures = [
        ("10:00:00", "120", "Centrum"),
        ("10:00:30", "120", "Centrum"),   # same (line, minute) → deduped
        ("10:05:00", "S1", "Wrzeszcz"),
    ]
    with patch("src.processor.store.get_departures", return_value=departures):
        arrivals = _build_from_static(region.id, "118", now)

    assert [a["line"] for a in arrivals] == ["120", "S1"]


def test_build_from_static_past_midnight(region):
    """GTFS hours >= 24 roll over to the next day."""
    now = datetime(2026, 5, 30, 23, 0, tzinfo=timezone.utc)
    with patch("src.processor.store.get_departures", return_value=[("25:30:00", "S1", "X")]):
        arrivals = _build_from_static(region.id, "118", now)

    assert len(arrivals) == 1
    assert arrivals[0]["_time_dt"].date() == now.date() + timedelta(days=1)
    assert arrivals[0]["_time_dt"].hour == 1


def test_build_from_static_empty_returns_empty(region):
    now = datetime.now(timezone.utc)
    with patch("src.processor.store.get_departures", return_value=[]):
        assert _build_from_static(region.id, "118", now) == []


def test_build_from_static_queries_todays_service(region):
    """The store must be asked for the service date, not the whole schedule."""
    now = datetime(2026, 5, 30, 9, 0, tzinfo=timezone.utc)
    with patch("src.processor.store.get_departures", return_value=[]) as mock_deps:
        _build_from_static(region.id, "118", now)
    mock_deps.assert_called_once_with(region.id, "118", now.date())
