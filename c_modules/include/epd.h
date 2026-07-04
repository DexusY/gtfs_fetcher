#ifndef GTFS_EPD_H
#define GTFS_EPD_H

#include <stddef.h>
#include <stdint.h>
#include <sys/types.h>

/* EPD payload layout (little-endian after magic):
     "EPD"     3 bytes
     type      1 byte   = 0x31
     width     uint16
     height    uint16
     data_len  uint32   (byte length of packed pixel data)
     crc32     uint32   (CRC-32 of packed pixel data)
     name      16 bytes (lowercase hex of SHA-1[0..7])
     pixels    N bytes  (1-bit MSB-first, row-padded to byte boundary)
*/
#define EPD_HEADER_LEN 32

/* Bytes needed for a full EPD payload at the given dimensions. */
size_t epd_payload_size(uint16_t w, uint16_t h);

/* Threshold-pack `pixels` (w*h 8-bit grayscale, row-major) into a complete
   EPD payload written to `out`. Pixel >= threshold → bit 1 (white).

   Returns bytes written, or -1 if out_cap is smaller than epd_payload_size(). */
ssize_t epd_pack(const uint8_t *pixels,
                 uint16_t w, uint16_t h,
                 uint8_t threshold,
                 uint8_t *out, size_t out_cap);

#endif
