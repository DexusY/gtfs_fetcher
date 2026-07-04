#include "epd.h"
#include "crc32.h"
#include "sha1.h"

#include <string.h>

static const char HEX[] = "0123456789abcdef";

static inline size_t row_stride(uint16_t w) {
    return (size_t)((w + 7u) >> 3);
}

static inline void put_le16(uint8_t *p, uint16_t v) {
    p[0] = (uint8_t)(v & 0xffu);
    p[1] = (uint8_t)(v >> 8);
}

static inline void put_le32(uint8_t *p, uint32_t v) {
    p[0] = (uint8_t)(v        & 0xffu);
    p[1] = (uint8_t)((v >> 8)  & 0xffu);
    p[2] = (uint8_t)((v >> 16) & 0xffu);
    p[3] = (uint8_t)(v  >> 24);
}

static void pack_row(const uint8_t *src, uint16_t w, uint8_t threshold,
                     uint8_t *dst, size_t stride) {
    memset(dst, 0, stride);
    for (uint16_t x = 0; x < w; x++) {
        if (src[x] >= threshold) {
            dst[x >> 3] |= (uint8_t)(0x80u >> (x & 7u));
        }
    }
}

size_t epd_payload_size(uint16_t w, uint16_t h) {
    return (size_t)EPD_HEADER_LEN + row_stride(w) * (size_t)h;
}

ssize_t epd_pack(const uint8_t *pixels,
                 uint16_t w, uint16_t h,
                 uint8_t threshold,
                 uint8_t *out, size_t out_cap) {
    const size_t need = epd_payload_size(w, h);
    if (out_cap < need) return -1;

    const size_t stride = row_stride(w);
    uint8_t *packed = out + EPD_HEADER_LEN;
    for (uint16_t y = 0; y < h; y++) {
        pack_row(pixels + (size_t)y * w, w, threshold,
                 packed + (size_t)y * stride, stride);
    }
    const size_t packed_len = stride * (size_t)h;

    const uint32_t crc = crc32_compute(packed, packed_len);

    uint8_t sha[20];
    sha1_compute(packed, packed_len, sha);

    uint8_t *p = out;
    p[0] = 'E'; p[1] = 'P'; p[2] = 'D';
    p += 3;
    *p++ = 0x31u;
    put_le16(p, w); p += 2;
    put_le16(p, h); p += 2;
    put_le32(p, (uint32_t)packed_len); p += 4;
    put_le32(p, crc);                  p += 4;

    /* 16 ASCII chars = lowercase hex of the first 8 SHA-1 bytes. */
    for (int i = 0; i < 8; i++) {
        *p++ = (uint8_t)HEX[sha[i] >> 4];
        *p++ = (uint8_t)HEX[sha[i] & 0x0fu];
    }

    return (ssize_t)need;
}
