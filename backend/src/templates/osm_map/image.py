"""osm_map template — programmatic, no PNG asset.

Fetches OSM tiles, stitches them, draws a station pin and label.
Tiles cached in-process (LRU, 300 max).
Attribution: © OpenStreetMap contributors (required on every image).
"""
from __future__ import annotations

import io
import logging
import math
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests
from PIL import Image, ImageDraw

from ..shared import FONT_BOLD, FONT_REG, _BLACK, _WHITE, _load_font

logger = logging.getLogger(__name__)

_TILE_URL   = "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
_USER_AGENT = "gtfs-app-display/1.0 (personal e-paper display)"
_TILE_PX    = 256
_ATTRIBUTION = "© OpenStreetMap contributors"
_MAX_CACHED  = 300

_tile_executor = ThreadPoolExecutor(max_workers=2)
_tile_session  = requests.Session()
_tile_session.headers["User-Agent"] = _USER_AGENT


class _LRUCache:
    def __init__(self, max_size: int) -> None:
        self._store: OrderedDict = OrderedDict()
        self._max = max_size

    def get(self, key):
        if key in self._store:
            self._store.move_to_end(key)
            return self._store[key]
        return None

    def put(self, key, val) -> None:
        self._store[key] = val
        self._store.move_to_end(key)
        if len(self._store) > self._max:
            self._store.popitem(last=False)


_cache = _LRUCache(_MAX_CACHED)


def _tile_xy(lat: float, lon: float, zoom: int) -> tuple[float, float]:
    n = 2 ** zoom
    tx = (lon + 180.0) / 360.0 * n
    lat_r = math.radians(lat)
    ty = (1.0 - math.log(math.tan(lat_r) + 1.0 / math.cos(lat_r)) / math.pi) / 2.0 * n
    return tx, ty


def _fetch_tile(z: int, x: int, y: int) -> tuple[int, int, Image.Image | None]:
    key = (z, x, y)
    cached = _cache.get(key)
    if cached:
        return x, y, cached
    try:
        resp = _tile_session.get(_TILE_URL.format(z=z, x=x, y=y), timeout=10)
        resp.raise_for_status()
        img = Image.open(io.BytesIO(resp.content)).convert("RGB")
        _cache.put(key, img)
        return x, y, img
    except Exception as e:
        logger.warning(f"[osm_map] tile {z}/{x}/{y} failed: {e}")
        return x, y, None


def render_osm_map(data: dict, options: dict) -> bytes:
    width  = options.get("width", 1600)
    height = options.get("height", 1200)
    orientation = options.get("orientation", "landscape")

    stop_name = data.get("stop_name", "")
    coords    = data.get("stop_coords")

    is_portrait = orientation == "portrait"
    canvas_w, canvas_h = (height, width) if is_portrait else (width, height)

    if not coords:
        logger.warning(f"[osm_map] no coords for '{stop_name}' — blank image")
        img = Image.new("L", (canvas_w, canvas_h), color=_WHITE)
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return buf.getvalue()

    lat, lon = coords
    zoom = 15 if is_portrait else 14
    cols, rows = (5, 5) if is_portrait else (10, 4)

    fx, fy = _tile_xy(lat, lon, zoom)
    start_tx = int(fx) - cols // 2
    start_ty = int(fy) - rows // 2

    raw = Image.new("RGB", (cols * _TILE_PX, rows * _TILE_PX), color=(220, 220, 220))
    futures = {
        _tile_executor.submit(_fetch_tile, zoom, start_tx + c, start_ty + r): (c, r)
        for r in range(rows) for c in range(cols)
    }
    for fut in as_completed(futures):
        c, r = futures[fut]
        _, _, tile = fut.result()
        if tile:
            raw.paste(tile, (c * _TILE_PX, r * _TILE_PX))

    img  = raw.resize((canvas_w, canvas_h), Image.BILINEAR).convert("L")
    draw = ImageDraw.Draw(img)

    pin_x = int((fx - start_tx) * _TILE_PX * canvas_w / raw.width)
    pin_y = int((fy - start_ty) * _TILE_PX * canvas_h / raw.height)

    pin_r  = max(6, canvas_h // 170)
    ring_r = pin_r + 3
    draw.ellipse([pin_x - ring_r, pin_y - ring_r, pin_x + ring_r, pin_y + ring_r], fill=_WHITE)
    draw.ellipse([pin_x - pin_r,  pin_y - pin_r,  pin_x + pin_r,  pin_y + pin_r],  fill=_BLACK)

    f_lbl = _load_font(FONT_BOLD, max(18, canvas_h // 46))
    lb = draw.textbbox((0, 0), stop_name, font=f_lbl)
    lw, lh = lb[2] - lb[0], lb[3] - lb[1]
    lx = max(4, min(pin_x - lw // 2, canvas_w - lw - 4))
    ly = max(4, pin_y - ring_r - lh - 8)
    draw.text((lx, ly), stop_name, fill=_BLACK, font=f_lbl, stroke_width=2, stroke_fill=_WHITE)

    f_attr = _load_font(FONT_REG, max(14, canvas_h // 85))
    ab = draw.textbbox((0, 0), _ATTRIBUTION, font=f_attr)
    aw, ah = ab[2] - ab[0], ab[3] - ab[1]
    ax, ay = canvas_w - aw - 6, canvas_h - ah - 4
    draw.rectangle([ax - 2, ay - 2, canvas_w, canvas_h], fill=_WHITE)
    draw.text((ax, ay), _ATTRIBUTION, fill=_BLACK, font=f_attr)

    if is_portrait:
        img = img.rotate(90, expand=True)

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    logger.info(f"[osm_map] rendered z={zoom} {cols}×{rows} tiles for '{stop_name}'")
    return buf.getvalue()
