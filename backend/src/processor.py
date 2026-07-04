"""Merges static GTFS schedule (Postgres store) with realtime updates for a stop.

build_display_data returns a dict with a fixed shape consumed by every template:
    stop_name, stop_id, region_id,
    arrivals: [{line, destination, time, _time_dt, delay}],
    updated_at, stop_coords (tuple|None),
    shapes {shape_id: [(lat,lon)...]}, shape_to_route {shape_id: line}, has_shapes
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from . import gtfs_store as store
from .fetcher import get_realtime, get_shapes

logger = logging.getLogger(__name__)


def _build_from_rt(region_id: int, rt_entities: list, target_stop_id: str) -> list[dict]:
    # Collect entities that touch the target stop, then resolve their lines in one query.
    hits: list[tuple] = []  # (trip_id, fallback_route_id, epoch, delay)
    for entity in rt_entities:
        tu = entity.trip_update
        stop_updates = list(tu.stop_time_update)
        stu = next((s for s in stop_updates if str(s.stop_id) == target_stop_id), None)
        if stu is None:
            continue
        dep = stu.departure if stu.HasField("departure") else None
        arr = stu.arrival if stu.HasField("arrival") else None
        epoch, delay = 0, 0
        if dep and dep.time:
            epoch, delay = dep.time, dep.delay or 0
        elif arr and arr.time:
            epoch, delay = arr.time, arr.delay or 0
        if not epoch:
            continue
        hits.append((tu.trip.trip_id, tu.trip.route_id, epoch, delay))

    if not hits:
        return []

    lines = store.get_trip_lines(region_id, [h[0] for h in hits])

    arrivals: list[dict] = []
    for trip_id, fallback_route, epoch, delay in hits:
        line, headsign = lines.get(trip_id, (fallback_route or trip_id, ""))
        dep_dt = datetime.fromtimestamp(epoch, tz=timezone.utc)
        arrivals.append({
            "line": line,
            "destination": headsign or "",
            "time": dep_dt.isoformat(),
            "_time_dt": dep_dt,
            "delay": delay,
        })
    return arrivals


def _build_from_static(region_id: int, target_stop_id: str, now_utc: datetime) -> list[dict]:
    from datetime import time as dtime, timedelta

    departures = store.get_departures(region_id, target_stop_id, now_utc.date())
    if not departures:
        logger.warning(
            f"No scheduled departures for stop {target_stop_id!r} in region {region_id}. "
            "Static schedule fallback unavailable."
        )
        return []

    today = now_utc.date()
    arrivals: list[dict] = []
    for time_str, line, headsign in departures:
        if not time_str:
            continue
        try:
            parts = time_str.split(":")
            h, m, s = int(parts[0]), int(parts[1]), int(parts[2]) if len(parts) > 2 else 0
        except (ValueError, IndexError):
            continue

        # GTFS allows hours >= 24 for trips past midnight
        day_offset = h // 24
        dep_dt = datetime.combine(today + timedelta(days=day_offset), dtime(h % 24, m, s),
                                  tzinfo=timezone.utc)
        if (dep_dt - now_utc).total_seconds() < -60:
            continue
        arrivals.append({
            "line": line,
            "destination": headsign or "",
            "time": dep_dt.isoformat(),
            "_time_dt": dep_dt,
            "delay": 0,
        })

    # deduplicate by (line, minute) — multiple trip_ids can map to the same departure
    seen: set[tuple[str, str]] = set()
    unique: list[dict] = []
    for a in arrivals:
        key = (a["line"], a["_time_dt"].strftime("%H:%M"))
        if key not in seen:
            seen.add(key)
            unique.append(a)
    unique.sort(key=lambda x: x["_time_dt"])
    return unique[:50]


def build_display_data(region, stop_id: str, limit: int = 10) -> dict:
    real_stop_id, stop_name, lat, lon = store.resolve_stop(region.id, stop_id)
    stop_coords = (lat, lon) if lat is not None and lon is not None else None

    arrivals = _build_from_rt(region.id, get_realtime(region), real_stop_id)
    if not arrivals:
        arrivals = _build_from_static(region.id, real_stop_id, datetime.now(timezone.utc))

    now_utc = datetime.now(timezone.utc)
    valid: list[dict] = []
    for a in arrivals:
        t = a.get("_time_dt")
        if t is None:
            try:
                t = datetime.fromisoformat(a["time"].strip().replace("Z", "+00:00"))
                if t.tzinfo is None:
                    t = t.replace(tzinfo=timezone.utc)
                a["_time_dt"] = t
            except Exception:
                logger.debug(f"Skipping unparseable time: {a.get('time')!r}")
                continue
        if (t - now_utc).total_seconds() > -60:
            valid.append(a)
    valid.sort(key=lambda x: x["_time_dt"])

    shapes, shape_to_route = get_shapes(region.id)

    return {
        "stop_name": stop_name,
        "stop_id": real_stop_id,
        "region_id": region.id,
        "arrivals": valid[:limit],
        "updated_at": now_utc,
        "stop_coords": stop_coords,
        "shapes": shapes,
        "has_shapes": bool(shapes),
        "shape_to_route": shape_to_route,
    }
