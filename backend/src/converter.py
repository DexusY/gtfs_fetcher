"""Convert PNG bytes to other display formats.

Supported output formats:
  png  — pass-through (raw PNG bytes from renderer)
  jpg  — JPEG re-encode at quality 90
  epd  — 1-bit packed EPD payload (header + packed pixels) built by the C extension
  lz4  — LZ4-compressed EPD payload

EPD payload layout — see c_modules/include/epd.h.
"""
from __future__ import annotations

import io
import sys
from pathlib import Path

from PIL import Image

# c_modules/python lives outside backend/; expose it on sys.path once.
_C_PYTHON = Path(__file__).resolve().parents[2] / "c_modules" / "python"
if str(_C_PYTHON) not in sys.path:
    sys.path.insert(0, str(_C_PYTHON))
import gtfs_epd  # noqa: E402

FORMATS = ("png", "jpg", "epd", "lz4")


def _build_epd(png_bytes: bytes) -> bytes:
    img = Image.open(io.BytesIO(png_bytes)).convert("L")
    w, h = img.size
    return gtfs_epd.pack(img.tobytes(), w, h, threshold=128)


def convert(png_bytes: bytes, fmt: str) -> bytes:
    """Convert raw PNG bytes to the requested format. Returns output bytes."""
    fmt = fmt.lower().lstrip(".")

    if fmt == "png":
        return png_bytes

    if fmt == "jpg":
        img = Image.open(io.BytesIO(png_bytes)).convert("RGB")
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=90)
        return buf.getvalue()

    if fmt == "epd":
        return _build_epd(png_bytes)

    if fmt == "lz4":
        import lz4.block
        return lz4.block.compress(_build_epd(png_bytes), store_size=False)

    raise ValueError(f"Unknown format {fmt!r}. Choose from: {', '.join(FORMATS)}")
