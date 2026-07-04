#include "sha1.h"

#include <string.h>

#define ROL32(v, b) (((v) << (b)) | ((v) >> (32 - (b))))

static void sha1_block(uint32_t state[5], const uint8_t block[64]) {
    uint32_t w[80];
    for (int i = 0; i < 16; i++) {
        w[i] = ((uint32_t)block[i * 4]     << 24)
             | ((uint32_t)block[i * 4 + 1] << 16)
             | ((uint32_t)block[i * 4 + 2] << 8)
             | ((uint32_t)block[i * 4 + 3]);
    }
    for (int i = 16; i < 80; i++) {
        w[i] = ROL32(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    }

    uint32_t a = state[0], b = state[1], c = state[2], d = state[3], e = state[4];

    for (int i = 0; i < 80; i++) {
        uint32_t f, k;
        if      (i < 20) { f = (b & c) | (~b & d);            k = 0x5A827999u; }
        else if (i < 40) { f = b ^ c ^ d;                     k = 0x6ED9EBA1u; }
        else if (i < 60) { f = (b & c) | (b & d) | (c & d);   k = 0x8F1BBCDCu; }
        else             { f = b ^ c ^ d;                     k = 0xCA62C1D6u; }

        uint32_t t = ROL32(a, 5) + f + e + k + w[i];
        e = d;
        d = c;
        c = ROL32(b, 30);
        b = a;
        a = t;
    }

    state[0] += a;
    state[1] += b;
    state[2] += c;
    state[3] += d;
    state[4] += e;
}

void sha1_compute(const uint8_t *data, size_t len, uint8_t digest[20]) {
    uint32_t state[5] = {
        0x67452301u, 0xEFCDAB89u, 0x98BADCFEu, 0x10325476u, 0xC3D2E1F0u,
    };

    const uint64_t bit_len = (uint64_t)len * 8u;

    while (len >= 64) {
        sha1_block(state, data);
        data += 64;
        len  -= 64;
    }

    /* Padding: 0x80, zeros, then 64-bit big-endian length. Needs one block
       if the remainder fits in 56 bytes, otherwise two. */
    uint8_t buf[128] = {0};
    if (len) memcpy(buf, data, len);
    buf[len] = 0x80u;

    const size_t len_off = (len < 56) ? 56 : 120;
    for (int i = 0; i < 8; i++) {
        buf[len_off + i] = (uint8_t)(bit_len >> (56 - i * 8));
    }

    sha1_block(state, buf);
    if (len_off == 120) sha1_block(state, buf + 64);

    for (int i = 0; i < 5; i++) {
        digest[i * 4]     = (uint8_t)(state[i] >> 24);
        digest[i * 4 + 1] = (uint8_t)(state[i] >> 16);
        digest[i * 4 + 2] = (uint8_t)(state[i] >> 8);
        digest[i * 4 + 3] = (uint8_t)(state[i]);
    }
}
