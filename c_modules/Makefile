CC      ?= gcc
CFLAGS  ?= -O2 -Wall -Wextra -Wpedantic -fPIC -std=c11
LDFLAGS ?= -shared

INC = -Iinclude
SRC = src/crc32.c src/sha1.c src/epd.c
OBJ = $(SRC:.c=.o)
LIB = libgtfs_epd.so

.PHONY: all clean

all: $(LIB)

$(LIB): $(OBJ)
	$(CC) $(LDFLAGS) -o $@ $^

src/%.o: src/%.c
	$(CC) $(CFLAGS) $(INC) -c -o $@ $<

clean:
	rm -f $(OBJ) $(LIB)
