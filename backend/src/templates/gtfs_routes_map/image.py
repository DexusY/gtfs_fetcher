"""gtfs_routes_map template.

Loads assets/template.png (1600×1200) as background, then draws all GTFS
shapes as polylines over it. Station pin and label drawn on top.
Falls back to a "no shapes.txt" notice when shapes are absent.
"""
from __future__ import annotations

import io
import logging
from pathlib import Path

from PIL import Image, ImageDraw

from ..shared import (
    FONT_BOLD, FONT_REG, _BLACK, _WHITE,
    _bbox_shapes, _load_font, _mercator_y,
)

logger = logging.getLogger(__name__)

_ASSET   = Path(__file__).parent / "assets" / "template.png"
_PADDING = 0.05
_HDR_XY  = (30, 10)
_SZ_HDR  = 38
_SZ_MSG  = 60


def _project(shapes, stop_coords, canvas_w, canvas_h):
    min_lat, max_lat, min_lon, max_lon = _bbox_shapes(shapes)
    if stop_coords:
        slat, slon = stop_coords
        min_lat = min(min_lat, slat); max_lat = max(max_lat, slat)
        min_lon = min(min_lon, slon); max_lon = max(max_lon, slon)

    min_my, max_my = _mercator_y(min_lat), _mercator_y(max_lat)
    pad_x = canvas_w * _PADDING
    pad_y = canvas_h * _PADDING
    dw = canvas_w - 2 * pad_x
    dh = canvas_h - 2 * pad_y
    lon_span = max_lon - min_lon or 1e-9
    my_span  = max_my  - min_my  or 1e-9

    def to_px(lat, lon):
        x = pad_x + (lon - min_lon) / lon_span * dw
        y = pad_y + (1.0 - (_mercator_y(lat) - min_my) / my_span) * dh
        return int(x), int(y)

    return to_px


def render_gtfs_routes_map(data: dict, options: dict) -> bytes:
    width  = options.get("width", 1600)
    height = options.get("height", 1200)
    orientation = options.get("orientation", "landscape")

    is_portrait = orientation == "portrait"
    canvas_w, canvas_h = (height, width) if is_portrait else (width, height)

    shapes     = data.get("shapes", {})
    stop_name  = data.get("stop_name", "")
    stop_coords = data.get("stop_coords")

    img  = Image.open(_ASSET).convert("L").resize((canvas_w, canvas_h), Image.BILINEAR)
    draw = ImageDraw.Draw(img)

    f_hdr = _load_font(FONT_BOLD, _SZ_HDR)
    draw.text(_HDR_XY, stop_name, fill=_WHITE, font=f_hdr)

    if not shapes:
        f_msg = _load_font(FONT_BOLD, _SZ_MSG)
        msg = "no shapes.txt"
        tb = draw.textbbox((0, 0), msg, font=f_msg)
        draw.text(((canvas_w - (tb[2]-tb[0])) // 2, (canvas_h - (tb[3]-tb[1])) // 2),
                  msg, fill=_BLACK, font=f_msg)
        buf = io.BytesIO(); img.save(buf, format="PNG"); return buf.getvalue()

    to_px = _project(shapes, stop_coords, canvas_w, canvas_h)
    line_w = max(1, canvas_h // 600)

    for pts in shapes.values():
        if len(pts) >= 2:
            draw.line([to_px(lat, lon) for lat, lon in pts], fill=160, width=line_w)

    if stop_coords:
        px, py = to_px(*stop_coords)
        r = max(8, canvas_h // 150)
        draw.ellipse([px-r-3, py-r-3, px+r+3, py+r+3], fill=_BLACK)
        draw.ellipse([px-r,   py-r,   px+r,   py+r],   fill=_WHITE)
        f_lbl = _load_font(FONT_BOLD, max(20, canvas_h // 60))
        lb = draw.textbbox((0, 0), stop_name, font=f_lbl)
        lw, lh = lb[2]-lb[0], lb[3]-lb[1]
        lx = max(4, min(px - lw//2, canvas_w - lw - 4))
        ly = max(4, py - r - 3 - lh - 6)
        draw.text((lx, ly), stop_name, fill=_BLACK, font=f_lbl, stroke_width=2, stroke_fill=_WHITE)

    if is_portrait:
        img = img.rotate(90, expand=True)

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    logger.info(f"[gtfs_routes_map] {len(shapes)} shapes for '{stop_name}'")
    return buf.getvalue()
