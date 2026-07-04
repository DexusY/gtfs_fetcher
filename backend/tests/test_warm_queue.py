"""Tests for the warmer's duplicate-ingest guard in main._ingest_one.

Duplicate region ids can land in the queue (create + polling races); the guard
must skip re-ingest when the region's data is already fresh.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

import main


class _FakeResult:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class _FakeSession:
    """Returns queued values for successive session.execute() calls."""

    def __init__(self, values: list):
        self._values = iter(values)

    async def execute(self, stmt):
        return _FakeResult(next(self._values))

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        pass


def _wire(monkeypatch, region, ingest_row):
    calls = SimpleNamespace(ingested=[], statuses=[])

    monkeypatch.setattr(main, "AsyncSessionLocal",
                        lambda: _FakeSession([region, ingest_row]))

    async def fake_set_status(region_id, status, error=None):
        calls.statuses.append((region_id, status, error))

    monkeypatch.setattr(main, "_set_status", fake_set_status)
    monkeypatch.setattr(main.gtfs_store, "ingest_region",
                        lambda rid, url: calls.ingested.append((rid, url)))
    monkeypatch.setattr(main, "drop_shapes", lambda rid: None)
    return calls


def test_fresh_region_is_skipped(monkeypatch):
    region = SimpleNamespace(id=1, static_url="http://x/gtfs.zip")
    fresh = SimpleNamespace(loaded_at=datetime.now(timezone.utc) - timedelta(hours=1))
    calls = _wire(monkeypatch, region, fresh)

    asyncio.run(main._ingest_one(1))

    assert calls.ingested == []
    assert calls.statuses == []


def test_stale_region_is_reingested(monkeypatch):
    region = SimpleNamespace(id=1, static_url="http://x/gtfs.zip")
    stale = SimpleNamespace(loaded_at=datetime.now(timezone.utc) - main._STATIC_TTL * 2)
    calls = _wire(monkeypatch, region, stale)

    asyncio.run(main._ingest_one(1))

    assert calls.ingested == [(1, "http://x/gtfs.zip")]
    assert (1, "warming", None) in calls.statuses


def test_never_ingested_region_is_ingested(monkeypatch):
    region = SimpleNamespace(id=1, static_url="http://x/gtfs.zip")
    calls = _wire(monkeypatch, region, None)   # no gtfs_ingest row at all

    asyncio.run(main._ingest_one(1))

    assert calls.ingested == [(1, "http://x/gtfs.zip")]


def test_deleted_region_is_ignored(monkeypatch):
    calls = _wire(monkeypatch, None, None)

    asyncio.run(main._ingest_one(42))

    assert calls.ingested == []
    assert calls.statuses == []


def test_failed_ingest_records_error(monkeypatch):
    region = SimpleNamespace(id=1, static_url="http://x/gtfs.zip")
    calls = _wire(monkeypatch, region, None)

    def boom(rid, url):
        raise RuntimeError("download exploded")

    monkeypatch.setattr(main.gtfs_store, "ingest_region", boom)

    asyncio.run(main._ingest_one(1))

    assert calls.ingested == []
    assert calls.statuses[-1][1] == "failed"
    assert "download exploded" in calls.statuses[-1][2]
