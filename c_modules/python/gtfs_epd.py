"""ctypes binding for libgtfs_epd.so — threshold-pack grayscale into EPD payload."""
from __future__ import annotations

import ctypes
from pathlib import Path

_LIB_PATH = Path(__file__).resolve().parent.parent / "libgtfs_epd.so"
if not _LIB_PATH.exists():
    raise ImportError(f"{_LIB_PATH} not found — run `make` in c_modules/")

_lib = ctypes.CDLL(str(_LIB_PATH))

_lib.epd_payload_size.restype  = ctypes.c_size_t
_lib.epd_payload_size.argtypes = [ctypes.c_uint16, ctypes.c_uint16]

_lib.epd_pack.restype  = ctypes.c_ssize_t
_lib.epd_pack.argtypes = [
    ctypes.c_char_p,   # pixels: w*h grayscale bytes
    ctypes.c_uint16, ctypes.c_uint16,
    ctypes.c_uint8,    # threshold
    ctypes.c_char_p,   # out buffer
    ctypes.c_size_t,
]


def pack(pixels: bytes, width: int, height: int, threshold: int = 128) -> bytes:
    if len(pixels) != width * height:
        raise ValueError(f"pixels has {len(pixels)} bytes, expected {width * height}")
    cap = _lib.epd_payload_size(width, height)
    buf = ctypes.create_string_buffer(cap)
    n = _lib.epd_pack(pixels, width, height, threshold, buf, cap)
    if n < 0:
        raise RuntimeError("epd_pack: output buffer too small")
    return buf.raw[:n]
