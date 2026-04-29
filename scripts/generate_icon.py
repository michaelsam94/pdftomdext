import struct
import zlib
from pathlib import Path


def chunk(tag: bytes, data: bytes) -> bytes:
    crc = zlib.crc32(tag + data) & 0xFFFFFFFF
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)


def to_png(width: int, height: int, rgba_bytes: bytes) -> bytes:
    raw = bytearray()
    stride = width * 4
    for y in range(height):
        raw.append(0)
        row_start = y * stride
        raw.extend(rgba_bytes[row_start : row_start + stride])

    header = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    idat = zlib.compress(bytes(raw), level=9)
    return header + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")


def blend(a: int, b: int, t: float) -> int:
    return int(a + (b - a) * t)


def make_icon(size: int = 128) -> bytes:
    pixels = bytearray(size * size * 4)

    for y in range(size):
        for x in range(size):
            i = (y * size + x) * 4
            t = (x + y) / (2 * (size - 1))
            r = blend(22, 65, t)
            g = blend(82, 120, t)
            b = blend(202, 245, t)
            pixels[i : i + 4] = bytes((r, g, b, 255))

    # White page
    px0, py0, px1, py1 = 30, 20, 98, 108
    for y in range(py0, py1):
        for x in range(px0, px1):
            i = (y * size + x) * 4
            pixels[i : i + 4] = bytes((247, 251, 255, 255))

    # Folded corner
    for y in range(20, 38):
        for x in range(80, 98):
            if x - 80 >= y - 20:
                i = (y * size + x) * 4
                pixels[i : i + 4] = bytes((214, 225, 245, 255))

    def put_rect(x0: int, y0: int, w: int, h: int, color: tuple[int, int, int, int]):
        for yy in range(y0, y0 + h):
            for xx in range(x0, x0 + w):
                i2 = (yy * size + xx) * 4
                pixels[i2 : i2 + 4] = bytes(color)

    # Red PDF bars
    put_rect(38, 52, 26, 5, (220, 38, 38, 255))
    put_rect(38, 61, 20, 5, (220, 38, 38, 255))
    put_rect(38, 70, 24, 5, (220, 38, 38, 255))

    # Markdown hash mark
    put_rect(68, 54, 4, 28, (45, 89, 189, 255))
    put_rect(78, 54, 4, 28, (45, 89, 189, 255))
    put_rect(63, 62, 24, 4, (45, 89, 189, 255))
    put_rect(63, 72, 24, 4, (45, 89, 189, 255))

    return to_png(size, size, bytes(pixels))


if __name__ == "__main__":
    out = Path("icon.png")
    out.write_bytes(make_icon(128))
    print(f"generated {out.resolve()}")
