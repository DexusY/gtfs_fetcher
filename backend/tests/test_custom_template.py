"""Tests for src/templates/custom_template/image.py — PIL rendering on user-supplied backgrounds.

These tests verify the custom template without a running DB or network. The only
external dependency is Pillow (which is always present in the dev environment).
"""
from __future__ import annotations

import io

import pytest
from PIL import Image, ImageDraw, ImageFont

from src.templates.custom_template.image import (
    _fit,
    _parse_color,
    _resolve,
    render_custom,
)


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _blank_png(width: int = 200, height: int = 100, color=(255, 255, 255)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (width, height), color).save(buf, format="PNG")
    return buf.getvalue()


def _data(**kwargs) -> dict:
    base = {"stop_name": "Test Stop", "arrivals": [], "updated_at": None, "shapes": {}}
    return {**base, **kwargs}


# ---------------------------------------------------------------------------
# render_custom — output validity and dimensions
# ---------------------------------------------------------------------------

def test_render_returns_valid_png():
    """Output must begin with the PNG magic bytes regardless of layout."""
    out = render_custom(_data(), _blank_png(), {"fields": []})
    assert out[:8] == b"\x89PNG\r\n\x1a\n"


def test_render_preserves_background_dimensions():
    """Canvas size must match the input background — renderer must not crop or scale."""
    bg = _blank_png(320, 240)
    out = render_custom(_data(), bg, {"fields": []})
    assert Image.open(io.BytesIO(out)).size == (320, 240)


def test_drawing_text_changes_output():
    """A field bound to stop_name must alter at least one pixel compared to a blank render."""
    bg = _blank_png(300, 60, color=(255, 255, 255))
    layout = {"fields": [{"bind": "stop_name", "x": 5, "y": 5, "width": 200, "font_size": 18}]}
    out_text = render_custom(_data(stop_name="Central"), bg, layout)
    out_none = render_custom(_data(stop_name=""),        bg, layout)
    # Empty stop_name → field skipped → output identical to a blank render
    assert out_text != out_none


def test_zero_width_field_silently_skipped():
    """width=0 means the field cannot be rendered — must not raise."""
    layout = {"fields": [{"bind": "stop_name", "x": 5, "y": 5, "width": 0, "font_size": 18}]}
    out = render_custom(_data(stop_name="X"), _blank_png(), layout)
    assert out[:8] == b"\x89PNG\r\n\x1a\n"


# ---------------------------------------------------------------------------
# _resolve — field binding
# ---------------------------------------------------------------------------

def test_resolve_stop_name():
    assert _resolve("stop_name", _data(stop_name="Main Station")) == "Main Station"


def test_resolve_current_time_is_hhmm():
    t = _resolve("current_time", _data())
    assert len(t) == 5 and t[2] == ":", f"expected HH:MM, got {t!r}"


def test_resolve_current_date_is_ddmmyyyy():
    d = _resolve("current_date", _data())
    parts = d.split(".")
    assert len(parts) == 3 and all(p.isdigit() for p in parts)


def test_resolve_arrival_line_by_index():
    arrivals = [{"line": "120", "destination": "Centrum", "time": ""},
                {"line": "S1",  "destination": "Wrzeszcz", "time": ""}]
    assert _resolve("line.0", _data(arrivals=arrivals)) == "120"
    assert _resolve("line.1", _data(arrivals=arrivals)) == "S1"


def test_resolve_arrival_index_beyond_list_is_empty():
    """Asking for departure N when fewer than N arrivals exist must return '' silently."""
    arrivals = [{"line": "1", "destination": "A", "time": ""}]
    assert _resolve("line.5", _data(arrivals=arrivals)) == ""
    assert _resolve("dest.5", _data(arrivals=arrivals)) == ""
    assert _resolve("time.5", _data(arrivals=arrivals)) == ""


def test_resolve_unknown_bind_is_empty():
    assert _resolve("made_up_field", _data()) == ""


# ---------------------------------------------------------------------------
# _parse_color
# ---------------------------------------------------------------------------

def test_parse_color_hex():
    assert _parse_color("#ff8800") == (255, 136, 0)


def test_parse_color_list():
    assert _parse_color([10, 20, 30]) == (10, 20, 30)


def test_parse_color_fallback_on_none():
    assert _parse_color(None) == (0, 0, 0)


@pytest.mark.parametrize("bad", ["#fff", "red", "#zzzzzz", "#", [1, 2], ["a", "b", "c"], 42])
def test_parse_color_malformed_input_falls_back(bad):
    """Layout JSON is user-supplied — malformed colors must not raise."""
    assert _parse_color(bad) == (0, 0, 0)


def test_parse_color_clamps_out_of_range_list():
    assert _parse_color([300, -5, 128]) == (255, 0, 128)


# ---------------------------------------------------------------------------
# hostile layout values
# ---------------------------------------------------------------------------

def test_huge_font_size_is_clamped_not_fatal():
    layout = {"fields": [{"bind": "stop_name", "x": 5, "y": 5,
                          "width": 100, "font_size": 100_000}]}
    out = render_custom(_data(stop_name="X"), _blank_png(), layout)
    assert out[:8] == b"\x89PNG\r\n\x1a\n"


def test_non_numeric_font_size_falls_back():
    layout = {"fields": [{"bind": "stop_name", "x": 5, "y": 5,
                          "width": 100, "font_size": "huge"}]}
    out = render_custom(_data(stop_name="X"), _blank_png(), layout)
    assert out[:8] == b"\x89PNG\r\n\x1a\n"


# ---------------------------------------------------------------------------
# _fit — text truncation
# ---------------------------------------------------------------------------

def test_fit_short_text_unchanged():
    """Text that already fits must be returned verbatim."""
    img  = Image.new("RGB", (500, 50))
    draw = ImageDraw.Draw(img)
    font = ImageFont.load_default()
    assert _fit(draw, "Hi", font, max_px=400) == "Hi"


def test_fit_truncates_with_ellipsis():
    """Text wider than max_px must be truncated and end with the ellipsis character."""
    img  = Image.new("RGB", (500, 50))
    draw = ImageDraw.Draw(img)
    font = ImageFont.load_default()
    # Force a very tight budget so even a short text must be trimmed.
    result = _fit(draw, "ABCDEFGHIJKLMNOPQRSTUVWXYZ", font, max_px=5)
    assert result == "" or result.endswith("…")
