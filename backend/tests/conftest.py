"""Pytest fixtures."""
from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace

import pytest


@pytest.fixture
def region():
    return SimpleNamespace(
        id=1,
        static_url="http://example.com/gtfs.zip",
        rt_url="http://example.com/gtfs-rt",
    )


@pytest.fixture
def region_static_only():
    return SimpleNamespace(
        id=2,
        static_url="http://example.com/gtfs.zip",
        rt_url=None,
    )


@pytest.fixture
def sample_arrivals():
    now = datetime.now(timezone.utc)
    return [
        {
            "line": "120",
            "destination": "Gdańsk Główny",
            "time": now.isoformat(),
            "_time_dt": now,
            "delay": 0,
        }
    ]
