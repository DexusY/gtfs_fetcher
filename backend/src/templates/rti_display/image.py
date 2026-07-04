"""RTI display template.

Loads assets/template.png (1600×1200 grayscale) and overlays live GTFS data:

  Header bar   y=0–110  → stop name (left) + update time HH:MM (right, smaller)
  Date row     y=88     → current date in small text below stop name
  Col headers  y=120    → Line / Destination / Departs labels
  Rows         y=175+   → departure rows
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

_HDR_X       = 50
_HDR_Y       = 18
_TIME_RIGHT_X = 1550   # right-align anchor for update time in header
_DATE_Y      = 82
_COL_HDR_Y   = 120
_COL_LINE_X  = 50
_COL_DEST_X  = 220
_COL_TIME_X  = 1350
_ROW_START_Y = 175
_ROW_HEIGHT  = 90
_MAX_ROWS    = 10

_SZ_HDR      = 52
_SZ_HDR_TIME = 34
_SZ_DATE     = 24
_SZ_COL      = 28
_SZ_ROW      = 38
_SZ_TIME     = 40


def render_rti_display(data: dict, options: dict) -> bytes:
    now = data.get("updated_at") or datetime.now(timezone.utc)

    img  = Image.open(_ASSET).convert("L")
    draw = ImageDraw.Draw(img)

    f_hdr      = _load_font(FONT_BOLD, _SZ_HDR)
    f_hdr_time = _load_font(FONT_REG,  _SZ_HDR_TIME)
    f_date     = _load_font(FONT_REG,  _SZ_DATE)
    f_col      = _load_font(FONT_REG,  _SZ_COL)
    f_row      = _load_font(FONT_REG,  _SZ_ROW)
    f_dep_time = _load_font(FONT_BOLD, _SZ_TIME)

    local_now = datetime.now().astimezone()

    # Header: stop name left, update time right
    draw.text((_HDR_X, _HDR_Y), _truncate(data.get("stop_name", ""), 42), fill=_WHITE, font=f_hdr)
    time_str = local_now.strftime("%H:%M")
    tw = int(draw.textlength(time_str, font=f_hdr_time))
    draw.text((_TIME_RIGHT_X - tw, _HDR_Y + (_SZ_HDR - _SZ_HDR_TIME) // 2), time_str, fill=_WHITE, font=f_hdr_time)

    # Date row
    draw.text((_HDR_X, _DATE_Y), local_now.strftime("%d.%m.%Y"), fill=_WHITE, font=f_date)

    # Column headers
    draw.text((_COL_LINE_X, _COL_HDR_Y), "Linia",    fill=_GRAY, font=f_col)
    draw.text((_COL_DEST_X, _COL_HDR_Y), "Kierunek", fill=_GRAY, font=f_col)
    draw.text((_COL_TIME_X, _COL_HDR_Y), "Odjazd",   fill=_GRAY, font=f_col)

    arrivals = data.get("arrivals", [])[:_MAX_ROWS]
    for i, arr in enumerate(arrivals):
        y      = _ROW_START_Y + i * _ROW_HEIGHT
        text_y = y + (_ROW_HEIGHT - _SZ_ROW) // 2
        line   = str(arr.get("line", ""))
        dest   = _truncate(arr.get("destination") or "—", 28)
        dep    = _fmt_time(arr.get("time", ""), now)

        draw.text((_COL_LINE_X, text_y), line, fill=_BLACK, font=f_row)
        draw.text((_COL_DEST_X, text_y), dest, fill=_BLACK, font=f_row)
        dw = int(draw.textlength(dep, font=f_dep_time))
        draw.text((_COL_TIME_X - dw, text_y - 1), dep, fill=_BLACK, font=f_dep_time)

    if not arrivals:
        draw.text((_COL_DEST_X, _ROW_START_Y + 20), "Brak odjazdów", fill=_GRAY, font=f_row)

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()
