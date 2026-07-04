"""line_scheme template.

Loads assets/template.png (1600×1200) and overlays grouped line-direction
tracks at hardcoded positions:

  Header banner  y=0–80    → stop name (white)
  Tracks         y=140+i*170 → up to 6 tracks, each 170px tall
  Footer         y=1162    → timestamp
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

_HDR_XY       = (20, 15)
_TRACK_START_Y = 140
_TRACK_HEIGHT  = 170
_MAX_TRACKS    = 6
_BADGE_X       = 20
_LINE_LEFT_X   = 170
_LINE_RIGHT_X  = 1200
_TIME_X        = 1230
_FTR_Y         = 1162
_FTR_LEFT_X    = 20
_FTR_RIGHT_X   = 1580

_SZ_HDR   = 52
_SZ_BADGE = 44
_SZ_DEST  = 32
_SZ_TIME  = 38
_SZ_FTR   = 24


def _group(arrivals: list[dict]) -> list[dict]:
    seen: dict[tuple, dict] = {}
    for a in arrivals:
        key = (str(a.get("line", "")), str(a.get("destination", "")))
        if key not in seen:
            seen[key] = a
    return list(seen.values())


def render_line_scheme(data: dict, options: dict) -> bytes:
    now = data.get("updated_at") or datetime.now(timezone.utc)

    img  = Image.open(_ASSET).convert("L")
    draw = ImageDraw.Draw(img)

    f_hdr   = _load_font(FONT_BOLD, _SZ_HDR)
    f_badge = _load_font(FONT_BOLD, _SZ_BADGE)
    f_dest  = _load_font(FONT_BOLD, _SZ_DEST)
    f_time  = _load_font(FONT_BOLD, _SZ_TIME)
    f_ftr   = _load_font(FONT_REG,  _SZ_FTR)

    draw.text(_HDR_XY, _truncate(data.get("stop_name", ""), 40), fill=_WHITE, font=f_hdr)

    tracks = _group(data.get("arrivals", []))[:_MAX_TRACKS]

    for i, arr in enumerate(tracks):
        cy = _TRACK_START_Y + i * _TRACK_HEIGHT + _TRACK_HEIGHT // 2

        # Line badge (black rounded rect)
        line = _truncate(str(arr.get("line", "?")), 6)
        bw = int(draw.textlength(line, font=f_badge)) + 20
        bh = _SZ_BADGE + 12
        by = cy - bh // 2
        draw.rounded_rectangle([_BADGE_X, by, _BADGE_X + bw, by + bh], radius=8, fill=_BLACK)
        draw.text((_BADGE_X + 10, by + 6), line, fill=_WHITE, font=f_badge)

        # Horizontal track line
        line_y = cy
        draw.line([(_LINE_LEFT_X, line_y), (_LINE_RIGHT_X, line_y)], fill=_BLACK, width=6)

        # Origin node (filled circle)
        r = 14
        draw.ellipse([_LINE_LEFT_X - r, cy - r, _LINE_LEFT_X + r, cy + r], fill=_BLACK)

        # Destination node (ring)
        draw.ellipse([_LINE_RIGHT_X - r - 3, cy - r - 3, _LINE_RIGHT_X + r + 3, cy + r + 3],
                     outline=_BLACK, width=5, fill=_WHITE)

        # Destination label above line
        dest = _truncate(arr.get("destination") or "—", 26)
        draw.text((_LINE_LEFT_X + 20, cy - _SZ_DEST - 8), dest, fill=_BLACK, font=f_dest)

        # Time column
        t_str = _fmt_time(arr.get("time", ""), now)
        draw.text((_TIME_X, cy - _SZ_TIME // 2), t_str, fill=_BLACK, font=f_time)

        # Row separator
        sep_y = _TRACK_START_Y + (i + 1) * _TRACK_HEIGHT - 1
        draw.line([(20, sep_y), (1580, sep_y)], fill=180, width=1)

    if not tracks:
        draw.text((_LINE_LEFT_X, _TRACK_START_Y + 40), "Brak odjazdów", fill=_GRAY, font=f_dest)

    local_now = datetime.now().astimezone()
    stamp = local_now.strftime("%H:%M:%S")
    date  = local_now.strftime("%d.%m.%Y")
    draw.text((_FTR_LEFT_X, _FTR_Y), f"Aktualizacja: {stamp}", fill=_GRAY, font=f_ftr)
    dw = int(draw.textlength(date, font=f_ftr))
    draw.text((_FTR_RIGHT_X - dw, _FTR_Y), date, fill=_GRAY, font=f_ftr)

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    logger.info(f"line_scheme rendered ({len(tracks)} tracks)")
    return buf.getvalue()
