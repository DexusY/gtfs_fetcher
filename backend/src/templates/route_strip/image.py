"""route_strip template.

Loads assets/template.png (1600×1200) and overlays up to 2 route strips
at hardcoded positions:

  Header bar   y=0–72    → stop name (white)
  Strip 1      y=76–636  → first arrival route strip
  Divider      y=636–638 (pre-drawn in asset)
  Strip 2      y=638–1160 → second arrival route strip
  Footer       y=1162    → timestamp
"""
from __future__ import annotations

import io
import logging
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageDraw

from ..shared import FONT_BOLD, FONT_REG, _BLACK, _WHITE, _GRAY, _load_font, _truncate, _fmt_time

logger = logging.getLogger(__name__)

_ASSET = Path(__file__).parent / "assets" / "template.png"

_HDR_XY      = (16, 14)
_STRIP_ZONES = [(76, 636), (638, 1160)]   # (y_top, y_bottom) for each strip
_FTR_Y       = 1162
_FTR_LEFT_X  = 20
_FTR_RIGHT_X = 1580

_SZ_HDR   = 46
_SZ_LINE  = 38
_SZ_DEST  = 28
_SZ_TIME  = 36
_SZ_STOP  = 18
_SZ_FTR   = 24

_BADGE_X     = 20
_BADGE_W     = 120
_TRACK_LEFT  = 160
_TRACK_RIGHT = 1260
_TIME_X      = 1280


def _draw_strip(draw: ImageDraw.ImageDraw, y_top: int, y_bot: int, arr: dict, now: datetime) -> None:
    h  = y_bot - y_top
    cy = y_top + h // 2

    line = _truncate(str(arr.get("line", "?")), 6)
    f_badge = _load_font(FONT_BOLD, _SZ_LINE)
    bh = _SZ_LINE + 12
    by = cy - bh // 2
    draw.rounded_rectangle([_BADGE_X, by, _BADGE_X + _BADGE_W, by + bh], radius=8, fill=_BLACK)
    bw_text = int(draw.textlength(line, font=f_badge))
    draw.text((_BADGE_X + (_BADGE_W - bw_text) // 2, by + 6), line, fill=_WHITE, font=f_badge)

    # Track line
    draw.line([(_TRACK_LEFT, cy), (_TRACK_RIGHT, cy)], fill=_BLACK, width=5)

    # Origin node
    r = 12
    draw.ellipse([_TRACK_LEFT - r, cy - r, _TRACK_LEFT + r, cy + r], fill=_BLACK)

    # Destination node (ring)
    draw.ellipse([_TRACK_RIGHT - r - 3, cy - r - 3, _TRACK_RIGHT + r + 3, cy + r + 3],
                 outline=_BLACK, width=4, fill=_WHITE)

    # Past/future stop nodes along the track
    past   = arr.get("past_stops", [])
    future = arr.get("future_stops", [])[:12]
    all_stops = past + future
    n = len(all_stops)
    if n:
        span = _TRACK_RIGHT - _TRACK_LEFT
        spacing = span // (n + 1)
        f_stop = _load_font(FONT_REG, _SZ_STOP)
        for j, sname in enumerate(all_stops):
            nx = _TRACK_LEFT + spacing * (j + 1)
            is_past = j < len(past)
            nr = 7
            if is_past:
                draw.ellipse([nx - nr, cy - nr, nx + nr, cy + nr], outline=_BLACK, width=2, fill=_WHITE)
            else:
                draw.ellipse([nx - nr, cy - nr, nx + nr, cy + nr], fill=_BLACK)
            # Vertical label (simple horizontal for now — replace with rotated if needed)
            label = _truncate(sname, 10)
            lw = int(draw.textlength(label, font=f_stop))
            draw.text((nx - lw // 2, cy + nr + 3), label, fill=_BLACK, font=f_stop)

    # Destination label
    dest = _truncate(arr.get("destination") or "—", 24)
    f_dest = _load_font(FONT_REG, _SZ_DEST)
    draw.text((_TRACK_LEFT + 10, cy - _SZ_DEST - 10), dest, fill=_BLACK, font=f_dest)

    # Time
    t_str = _fmt_time(arr.get("time", ""), now)
    f_time = _load_font(FONT_BOLD, _SZ_TIME)
    draw.text((_TIME_X, cy - _SZ_TIME // 2), t_str, fill=_BLACK, font=f_time)


def render_route_strip(data: dict, options: dict) -> bytes:
    now = data.get("updated_at") or datetime.now(timezone.utc)

    img  = Image.open(_ASSET).convert("L")
    draw = ImageDraw.Draw(img)

    f_hdr = _load_font(FONT_BOLD, _SZ_HDR)
    f_ftr = _load_font(FONT_REG,  _SZ_FTR)

    draw.text(_HDR_XY, _truncate(data.get("stop_name", ""), 42), fill=_WHITE, font=f_hdr)

    arrivals = data.get("arrivals", [])
    for i, zone in enumerate(_STRIP_ZONES):
        if i >= len(arrivals):
            break
        _draw_strip(draw, zone[0], zone[1], arrivals[i], now)

    if not arrivals:
        f_nd = _load_font(FONT_REG, 36)
        draw.text((160, _STRIP_ZONES[0][0] + 40), "Brak odjazdów", fill=_GRAY, font=f_nd)

    local_now = datetime.now().astimezone()
    stamp = local_now.strftime("%H:%M:%S")
    date  = local_now.strftime("%d.%m.%Y")
    draw.text((_FTR_LEFT_X, _FTR_Y), f"Aktualizacja: {stamp}", fill=_GRAY, font=f_ftr)
    dw = int(draw.textlength(date, font=f_ftr))
    draw.text((_FTR_RIGHT_X - dw, _FTR_Y), date, fill=_GRAY, font=f_ftr)

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    logger.info(f"route_strip rendered ({min(len(arrivals), 2)} strips)")
    return buf.getvalue()
