#ifndef GTFS_SHA1_H
#define GTFS_SHA1_H

#include <stddef.h>
#include <stdint.h>

/* RFC 3174 SHA-1, one-shot. Writes 20 bytes to digest. */
void sha1_compute(const uint8_t *data, size_t len, uint8_t digest[20]);

#endif
