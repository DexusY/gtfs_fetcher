#include "crc32.h"

static uint32_t TABLE[256];

__attribute__((constructor))
static void crc32_build_table(void) {
    for (uint32_t i = 0; i < 256; i++) {
        uint32_t c = i;
        for (int k = 0; k < 8; k++) {
            c = (c & 1u) ? (0xEDB88320u ^ (c >> 1)) : (c >> 1);
        }
        TABLE[i] = c;
    }
}

uint32_t crc32_compute(const uint8_t *data, size_t len) {
    uint32_t c = 0xFFFFFFFFu;
    for (size_t i = 0; i < len; i++) {
        c = TABLE[(c ^ data[i]) & 0xffu] ^ (c >> 8);
    }
    return c ^ 0xFFFFFFFFu;
}
