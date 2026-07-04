"""board_graphic template.

Loads assets/template.png (1600×1200) and overlays departure data at
hardcoded pixel positions matching the pre-drawn layout zones:

  Header bar   y=0–100   → stop name (white)
  Col headers  y=110     → Line / Destination / Departs
  Rows         y=165+i*100 → up to 10 rows
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

_HDR_XY      = (50, 25)
_COL_HDR_Y   = 110
_COL_LINE_X  = 50
_COL_DEST_X  = 230
_COL_TIME_X  = 1350
_ROW_START_Y = 165
_ROW_HEIGHT  = 100
_MAX_ROWS    = 10
_FTR_Y       = 1162
_FTR_LEFT_X  = 50
_FTR_RIGHT_X = 1550

_SZ_HDR  = 58
_SZ_COL  = 28
_SZ_ROW  = 40
_SZ_TIME = 42
_SZ_FTR  = 26


def render_board_graphic(data: dict, options: dict) -> bytes:
    now = data.get("updated_at") or datetime.now(timezone.utc)

    img  = Image.open(_ASSET).convert("L")
    draw = ImageDraw.Draw(img)

    f_hdr  = _load_font(FONT_BOLD, _SZ_HDR)
    f_col  = _load_font(FONT_REG,  _SZ_COL)
    f_row  = _load_font(FONT_REG,  _SZ_ROW)
    f_time = _load_font(FONT_BOLD, _SZ_TIME)
    f_ftr  = _load_font(FONT_REG,  _SZ_FTR)

    draw.text(_HDR_XY, _truncate(data.get("stop_name", ""), 40), fill=_WHITE, font=f_hdr)

    draw.text((_COL_LINE_X, _COL_HDR_Y), "Linia",    fill=_GRAY, font=f_col)
    draw.text((_COL_DEST_X, _COL_HDR_Y), "Kierunek", fill=_GRAY, font=f_col)
    draw.text((_COL_TIME_X, _COL_HDR_Y), "Odjazd",   fill=_GRAY, font=f_col)

    arrivals = data.get("arrivals", [])[:_MAX_ROWS]
    for i, arr in enumerate(arrivals):
        y      = _ROW_START_Y + i * _ROW_HEIGHT
        text_y = y + (_ROW_HEIGHT - _SZ_ROW) // 2
        line   = str(arr.get("line", ""))
        dest   = _truncate(arr.get("destination") or "—", 28)
        t_str  = _fmt_time(arr.get("time", ""), now)

        draw.text((_COL_LINE_X, text_y), line, fill=_BLACK, font=f_row)
        draw.text((_COL_DEST_X, text_y), dest, fill=_BLACK, font=f_row)
        tw = int(draw.textlength(t_str, font=f_time))
        draw.text((_COL_TIME_X - tw, text_y - 1), t_str, fill=_BLACK, font=f_time)

    if not arrivals:
        draw.text((_COL_DEST_X, _ROW_START_Y + 20), "Brak odjazdów", fill=_GRAY, font=f_row)

    local_now = datetime.now().astimezone()
    stamp = local_now.strftime("%H:%M:%S")
    date  = local_now.strftime("%d.%m.%Y")
    draw.text((_FTR_LEFT_X, _FTR_Y), f"Aktualizacja: {stamp}", fill=_GRAY, font=f_ftr)
    dw = int(draw.textlength(date, font=f_ftr))
    draw.text((_FTR_RIGHT_X - dw, _FTR_Y), date, fill=_GRAY, font=f_ftr)

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    logger.info("board_graphic rendered")
    return buf.getvalue()
