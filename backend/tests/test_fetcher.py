"""Tests for src/fetcher.py — realtime fetch + the bounded shapes LRU."""
from __future__ import annotations

from unittest.mock import patch

import pytest

import src.fetcher as fetcher
from src.fetcher import get_realtime, get_shapes, drop_shapes


@pytest.fixture(autouse=True)
def clear_caches():
    fetcher._rt_cache.clear()
    fetcher._shapes_cache.clear()
    yield
    fetcher._rt_cache.clear()
    fetcher._shapes_cache.clear()


# --- realtime --------------------------------------------------------------

def test_get_realtime_returns_empty_when_no_rt_url(region_static_only):
    assert get_realtime(region_static_only) == []


def test_get_realtime_returns_empty_on_network_error(region):
    with patch.object(fetcher._session, "get", side_effect=ConnectionError("timeout")):
        assert get_realtime(region) == []


def test_get_realtime_returns_empty_without_protobuf(region):
    with patch.object(fetcher, "_HAS_PROTOBUF", False):
        assert get_realtime(region) == []


# --- shapes LRU ------------------------------------------------------------

def test_get_shapes_queries_store_then_caches(region):
    payload = ({"SH1": [(54.4, 18.5)]}, {"SH1": "120"})
    with patch.object(fetcher.gtfs_store, "get_shapes", return_value=payload) as mock_store:
        first = get_shapes(region.id)
        second = get_shapes(region.id)

    assert first == payload
    assert second is first              # served from cache
    assert mock_store.call_count == 1   # store hit only once


def test_drop_shapes_forces_reload(region):
    payload = ({"SH1": [(54.4, 18.5)]}, {})
    with patch.object(fetcher.gtfs_store, "get_shapes", return_value=payload) as mock_store:
        get_shapes(region.id)
        drop_shapes(region.id)
        get_shapes(region.id)

    assert mock_store.call_count == 2   # reloaded after eviction


def test_shapes_lru_evicts_beyond_capacity():
    payload = ({}, {})
    with patch.object(fetcher.gtfs_store, "get_shapes", return_value=payload):
        for rid in range(fetcher._SHAPES_MAX + 3):
            get_shapes(rid)

    assert len(fetcher._shapes_cache) == fetcher._SHAPES_MAX
    # the oldest regions (0,1,2) were evicted; the most recent remain
    assert 0 not in fetcher._shapes_cache
    assert (fetcher._SHAPES_MAX + 2) in fetcher._shapes_cache
