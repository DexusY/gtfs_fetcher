#ifndef GTFS_CRC32_H
#define GTFS_CRC32_H

#include <stddef.h>
#include <stdint.h>

/* IEEE 802.3 CRC-32 (poly 0xEDB88320, reflected). Matches Python's zlib.crc32. */
uint32_t crc32_compute(const uint8_t *data, size_t len);

#endif
