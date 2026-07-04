"""GTFS-RT realtime feed fetcher + a small bounded cache for whole-region shapes.

Static GTFS now lives in Postgres (see src/gtfs_store.py); the old unbounded
per-region RAM dict cache is gone. The only static data still held in RAM is the
whole-region shape polyline set, which the map templates need in bulk — and that
is bounded by a tiny LRU so memory stays predictable.
"""
from __future__ import annotations

import logging
import threading
import time
from collections import OrderedDict

import requests

from . import gtfs_store

try:
    from google.transit import gtfs_realtime_pb2
    _HAS_PROTOBUF = True
except ImportError:
    _HAS_PROTOBUF = False

logger = logging.getLogger(__name__)

_CONNECT_TIMEOUT = 10
_RT_READ_TIMEOUT = 10
_RT_TTL          = 15.0

_session = requests.Session()

_rt_cache: dict[int, tuple[float, list]] = {}  # region_id -> (monotonic_ts, entities)
_rt_lock = threading.Lock()


# --- bounded shapes cache --------------------------------------------------

_SHAPES_MAX = 4  # number of regions whose full shape set we keep resident
_shapes_cache: "OrderedDict[int, tuple]" = OrderedDict()
_shapes_lock = threading.Lock()


def get_shapes(region_id: int) -> tuple[dict, dict]:
    """Return (shapes, shape_to_route) for a region, LRU-cached over the store."""
    with _shapes_lock:
        hit = _shapes_cache.get(region_id)
        if hit is not None:
            _shapes_cache.move_to_end(region_id)
            return hit
    result = gtfs_store.get_shapes(region_id)  # heavy read, done outside the lock
    with _shapes_lock:
        _shapes_cache[region_id] = result
        _shapes_cache.move_to_end(region_id)
        while len(_shapes_cache) > _SHAPES_MAX:
            _shapes_cache.popitem(last=False)
    return result


def drop_shapes(region_id: int) -> None:
    """Evict a region's cached shapes (call after re-ingest)."""
    with _shapes_lock:
        _shapes_cache.pop(region_id, None)


# --- realtime --------------------------------------------------------------

def get_realtime(region) -> list:
    """Return GTFS-RT trip_update entities for the region, cached for _RT_TTL seconds. Returns [] on failure."""
    if not _HAS_PROTOBUF or not region.rt_url:
        return []
    now = time.monotonic()
    with _rt_lock:
        cached = _rt_cache.get(region.id)
        if cached and now - cached[0] < _RT_TTL:
            return cached[1]
    try:
        resp = _session.get(region.rt_url, timeout=(_CONNECT_TIMEOUT, _RT_READ_TIMEOUT))
        resp.raise_for_status()
        feed = gtfs_realtime_pb2.FeedMessage()
        feed.ParseFromString(resp.content)
        entities = [e for e in feed.entity if e.HasField("trip_update")]
    except Exception as e:
        logger.warning(f"GTFS-RT fetch failed for region {region.id}: {e}")
        entities = []
    with _rt_lock:
        _rt_cache[region.id] = (time.monotonic(), entities)
    return entities
