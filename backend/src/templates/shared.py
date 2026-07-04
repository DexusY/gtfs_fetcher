"""Drawing helpers shared by all templates."""
from __future__ import annotations

import math
from datetime import datetime, timezone
from functools import lru_cache
from math import ceil

from PIL import ImageDraw, ImageFont

FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_REG  = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

_BLACK = 0
_WHITE = 255
_GRAY  = 100


@lru_cache(maxsize=64)
def _load_font(path: str, size: int) -> ImageFont.FreeTypeFont:
    try:
        return ImageFont.truetype(path, size)
    except Exception:
        return ImageFont.load_default()


def _truncate(text: str, max_len: int) -> str:
    return text[: max_len - 1] + "…" if len(text) > max_len else text


def _fmt_time(time_str: str, now: datetime) -> str:
    if not time_str:
        return "--"
    try:
        t = datetime.fromisoformat(time_str.replace("Z", "+00:00"))
        mins = ceil((t - now).total_seconds() / 60)
        clock = t.astimezone().strftime("%H:%M")
        if mins < 0:
            return f"{clock}  odj."
        if mins == 0:
            return f"{clock}  <<<<"
        return f"{clock}  {mins} min"
    except Exception:
        return "--"


def _mercator_y(lat: float) -> float:
    lat_r = math.radians(lat)
    return math.log(math.tan(math.pi / 4 + lat_r / 2))


def _bbox_shapes(shapes: dict) -> tuple[float, float, float, float]:
    min_lat = min_lon = float("inf")
    max_lat = max_lon = float("-inf")
    for pts in shapes.values():
        for lat, lon in pts:
            if lat < min_lat: min_lat = lat
            elif lat > max_lat: max_lat = lat
            if lon < min_lon: min_lon = lon
            elif lon > max_lon: max_lon = lon
    return min_lat, max_lat, min_lon, max_lon
