"""Custom template renderer — user-supplied background PNG + field-position JSON."""
from __future__ import annotations

import io
import logging
import re
from datetime import datetime, timezone
from functools import lru_cache

from PIL import Image, ImageDraw, ImageFont

from ..shared import _bbox_shapes, _fmt_time, _mercator_y

logger = logging.getLogger(__name__)

_INTER_REGULAR = "/usr/share/fonts/opentype/inter/Inter-Regular.otf"
_INTER_BOLD    = "/usr/share/fonts/opentype/inter/Inter-Bold.otf"
_FALLBACK_REG  = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
_FALLBACK_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


@lru_cache(maxsize=128)
def _load_font(family: str, weight: str, size: int) -> ImageFont.FreeTypeFont:
    if family == "Inter":
        path = _INTER_BOLD if weight == "bold" else _INTER_REGULAR
    else:
        path = _FALLBACK_BOLD if weight == "bold" else _FALLBACK_REG
    try:
        return ImageFont.truetype(path, size)
    except Exception:
        return ImageFont.load_default()


def _resolve(bind: str, data: dict) -> str:
    now_local  = datetime.now().astimezone()
    updated_at = data.get("updated_at") or datetime.now(timezone.utc)

    if bind == "stop_name":
        return str(data.get("stop_name", ""))
    if bind == "current_time":
        return now_local.strftime("%H:%M")
    if bind == "current_date":
        return now_local.strftime("%d.%m.%Y")

    parts = bind.split(".", 1)
    if len(parts) == 2:
        field, idx_str = parts
        m = re.match(r"\d+", idx_str)
        if not m:
            return ""
        idx = int(m.group())
        arrivals = data.get("arrivals", [])
        if idx >= len(arrivals):
            return ""
        arr = arrivals[idx]
        if field == "line":
            return str(arr.get("line", ""))
        if field == "dest":
            return arr.get("destination") or ""
        if field == "time":
            return _fmt_time(arr.get("time", ""), updated_at)

    return ""


def _fit(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, max_px: int) -> str:
    """Truncate text with ellipsis to fit within max_px. Returns '' if even '…' doesn't fit."""
    if max_px <= 0 or draw.textlength(text, font=font) <= max_px:
        return text
    while text and draw.textlength(text + "…", font=font) > max_px:
        text = text[:-1]
    return (text + "…") if text else ""


def _fit_font(draw: ImageDraw.ImageDraw, text: str, family: str, weight: str,
              size: int, max_px: int, min_size: int) -> tuple[str, ImageFont.FreeTypeFont]:
    """Return (text, font) scaled down to fit within max_px, truncating only as last resort."""
    font = _load_font(family, weight, size)
    if max_px <= 0 or draw.textlength(text, font=font) <= max_px:
        return text, font
    for candidate in range(size - 1, min_size - 1, -1):
        font = _load_font(family, weight, candidate)
        if draw.textlength(text, font=font) <= max_px:
            return text, font
    truncated = _fit(draw, text, font, max_px)
    return truncated, font


def _parse_color(c, default=(0, 0, 0)) -> tuple[int, int, int]:
    # Layout JSON is user-supplied — anything malformed falls back to default.
    try:
        if isinstance(c, str) and len(c) >= 7 and c.startswith("#"):
            return (int(c[1:3], 16), int(c[3:5], 16), int(c[5:7], 16))
        if isinstance(c, (list, tuple)) and len(c) >= 3:
            return tuple(max(0, min(255, int(v))) for v in c[:3])
    except (ValueError, TypeError):
        pass
    return default


def _draw_shapes_box(draw: ImageDraw.ImageDraw, shapes: dict, box: dict,
                     stop_coords: tuple[float, float] | None) -> None:
    if not shapes:
        return

    x0 = int(box.get("x", 0))
    y0 = int(box.get("y", 0))
    bw = int(box.get("width", 0))
    bh = int(box.get("height", 0))
    if bw <= 0 or bh <= 0:
        return

    stroke = _parse_color(box.get("stroke", "#000000"))
    line_w = int(box.get("width_px", 2))
    pad    = int(box.get("padding", 8))

    min_lat, max_lat, min_lon, max_lon = _bbox_shapes(shapes)
    if stop_coords:
        slat, slon = stop_coords
        min_lat = min(min_lat, slat); max_lat = max(max_lat, slat)
        min_lon = min(min_lon, slon); max_lon = max(max_lon, slon)

    min_my, max_my = _mercator_y(min_lat), _mercator_y(max_lat)
    inner_w = bw - 2 * pad
    inner_h = bh - 2 * pad
    lon_span = (max_lon - min_lon) or 1e-9
    my_span  = (max_my  - min_my)  or 1e-9

    def to_px(lat: float, lon: float) -> tuple[int, int]:
        x = x0 + pad + (lon - min_lon) / lon_span * inner_w
        y = y0 + pad + (1.0 - (_mercator_y(lat) - min_my) / my_span) * inner_h
        return int(x), int(y)

    for pts in shapes.values():
        if len(pts) < 2:
            continue
        px = [to_px(lat, lon) for lat, lon in pts]
        draw.line(px, fill=stroke, width=line_w)

    if stop_coords:
        sx, sy = to_px(*stop_coords)
        r = max(line_w * 3, 6)
        draw.ellipse((sx - r, sy - r, sx + r, sy + r), fill=stroke)


def render_custom(data: dict, bg_bytes: bytes, layout: dict) -> bytes:
    img  = Image.open(io.BytesIO(bg_bytes)).convert("RGBA")
    draw = ImageDraw.Draw(img)

    shapes_box = layout.get("shapes_box")
    if shapes_box:
        _draw_shapes_box(draw, data.get("shapes", {}), shapes_box,
                         data.get("stop_coords"))

    for f in layout.get("fields", []):
        if not f.get("width"):  # zero width = unused slot (truncation can't work without it)
            continue
        text = _resolve(f.get("bind", ""), data)
        if not text:
            continue

        family   = f.get("font_family", "Inter")
        weight   = f.get("font_weight", "regular")
        # clamp user-supplied sizes: huge values blow up glyph rasters and
        # churn the font LRU; non-ints would raise inside Pillow
        try:
            size = max(6, min(400, int(f.get("font_size", 16))))
        except (ValueError, TypeError):
            size = 16
        max_px   = f.get("width", 0)
        try:
            min_size = max(6, min(size, int(f.get("min_font_size", max(8, size // 2)))))
        except (ValueError, TypeError):
            min_size = max(8, size // 2)
        align    = f.get("align", "left")   # "left" | "center" | "right"

        text, font = _fit_font(draw, text, family, weight, size, max_px, min_size)
        if not text:
            continue

        x, y = f.get("x", 0), f.get("y", 0)
        if align == "center":
            x = x + max_px // 2
            anchor = "mt"
        elif align == "right":
            x = x + max_px
            anchor = "rt"
        else:
            anchor = "lt"

        r, g, b = _parse_color(f.get("color", [0, 0, 0]))
        draw.text((x, y), text, fill=(r, g, b, 255), font=font, anchor=anchor)

    buf = io.BytesIO()
    img.convert("RGB").save(buf, format="PNG")
    return buf.getvalue()
