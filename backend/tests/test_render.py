"""Tests for src/render.py and the rti_display template."""
from __future__ import annotations

from datetime import datetime, timezone, timedelta

import pytest
from PIL import Image
import io

from src.render import render


@pytest.fixture
def display_data():
    now = datetime.now(timezone.utc)
    return {
        "stop_name": "Gdańsk Oliwa PKP 02",
        "stop_id": "118",
        "region_id": 1,
        "updated_at": now,
        "arrivals": [
            {
                "line": "120",
                "destination": "Gdańsk Główny",
                "time": (now + timedelta(minutes=5)).isoformat(),
                "_time_dt": now + timedelta(minutes=5),
                "delay": 0,
                "past_stops": [],
                "future_stops": [],
            },
            {
                "line": "SKM S3",
                "destination": "Gdynia Główna",
                "time": (now + timedelta(minutes=10)).isoformat(),
                "_time_dt": now + timedelta(minutes=10),
                "delay": 120,
                "past_stops": [],
                "future_stops": [],
            },
        ],
    }


def test_render_returns_valid_png(display_data):
    png = render(display_data, template="rti_display", width=1600, height=1200)
    assert png[:8] == b"\x89PNG\r\n\x1a\n"  # PNG magic bytes


def test_render_correct_dimensions(display_data):
    png = render(display_data, template="rti_display", width=1600, height=1200)
    img = Image.open(io.BytesIO(png))
    assert img.size == (1600, 1200)


def test_render_grayscale(display_data):
    png = render(display_data, template="rti_display", width=1600, height=1200)
    img = Image.open(io.BytesIO(png))
    assert img.mode == "L"


def test_render_no_arrivals_does_not_crash(display_data):
    display_data["arrivals"] = []
    png = render(display_data, template="rti_display", width=1600, height=1200)
    assert len(png) > 0


def test_render_unknown_template_raises(display_data):
    """Unknown template must raise — the API layer turns this into a 400,
    silently falling back would mask caller typos."""
    with pytest.raises(ValueError, match="nonexistent_template"):
        render(display_data, template="nonexistent_template", width=1600, height=1200)


def test_render_long_stop_name_truncated(display_data):
    display_data["stop_name"] = "A" * 200
    png = render(display_data, template="rti_display", width=1600, height=1200)
    assert len(png) > 0


def test_render_many_arrivals_capped(display_data):
    """Template must not crash or overflow with more than MAX_ROWS arrivals."""
    now = datetime.now(timezone.utc)
    display_data["arrivals"] = [
        {
            "line": str(i),
            "destination": f"Stop {i}",
            "time": (now + timedelta(minutes=i)).isoformat(),
            "_time_dt": now + timedelta(minutes=i),
            "delay": 0,
            "past_stops": [],
            "future_stops": [],
        }
        for i in range(1, 20)
    ]
    png = render(display_data, template="rti_display", width=1600, height=1200)
    img = Image.open(io.BytesIO(png))
    assert img.size == (1600, 1200)
