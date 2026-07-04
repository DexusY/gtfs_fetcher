"""Integration test — verifies every static_url in the DB returns HTTP 200.

Run with:  pytest tests/test_feed_urls.py -v
Skipped automatically when the DB is not reachable.
"""
from __future__ import annotations

import asyncio

import pytest
import requests
from sqlalchemy.future import select

from db.database import AsyncSessionLocal
from db.models import GtfsRegions

pytestmark = pytest.mark.integration


async def _fetch_regions() -> list[tuple[int, str, str]]:
    async with AsyncSessionLocal() as session:
        rows = (await session.execute(select(GtfsRegions))).scalars().all()
    return [(r.id, r.name, r.static_url) for r in rows]


def test_all_static_urls_reachable():
    try:
        regions = asyncio.run(_fetch_regions())
    except Exception as exc:
        pytest.skip(f"DB not available: {exc}")

    if not regions:
        pytest.skip("No regions in DB")

    failed: list[str] = []
    for region_id, name, url in regions:
        try:
            resp = requests.get(url, stream=True, timeout=(10, 10))
            resp.close()
            if resp.status_code != 200:
                failed.append(f"  region {region_id} ({name}): {url}  →  HTTP {resp.status_code}")
        except requests.exceptions.RequestException as exc:
            failed.append(f"  region {region_id} ({name}): {url}  →  {exc}")

    assert not failed, "Broken GTFS static URLs:\n" + "\n".join(failed)
