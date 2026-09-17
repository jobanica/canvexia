"""Rasterise Resceta's app icon.

No rasteriser is installed in this sandbox, and the mark is made entirely of
axis-aligned rectangles — a medical cross — so writing the pixels directly is
exact rather than an approximation. The same approach the CANVEXIA icons use
(apps/servd/scripts/render-brand-icons.py), minus the path parser this shape
does not need.

THE SHAPE IS A CROSS, NOT A LETTER. Two pharmacies in the same market will both
have an "R" tile; the cross is what somebody recognises on a home screen full
of apps without reading it. Slate-900 on white, which is the palette the app
already uses rather than a colour invented for the icon.

MASKABLE SAFE ZONE. Android may crop a maskable icon to a circle inscribed in
the middle 80%. The cross is sized to 44% of the canvas and centred, so it
survives any mask shape a launcher applies — and the background is painted edge
to edge, because a transparent corner becomes a black corner once cropped.

    python3 scripts/render-icons.py
"""
import struct, zlib

BG = (15, 23, 42)       # slate-900, the app's own ink
FG = (255, 255, 255)

def png(path, size, bg, fg, arm, thick):
    """One flat tile with a centred cross. `arm` and `thick` are fractions."""
    a = int(size * arm) // 2 * 2       # even, so it centres on a whole pixel
    t = int(size * thick) // 2 * 2
    x0, x1 = (size - a) // 2, (size + a) // 2
    y0, y1 = x0, x1
    bx0, bx1 = (size - t) // 2, (size + t) // 2

    rows = bytearray()
    for y in range(size):
        rows.append(0)                  # PNG filter byte: none
        # The horizontal arm: full width of the cross, only the middle band tall.
        in_h = bx0 <= y < bx1
        # The vertical arm is bounded in BOTH axes. Getting that wrong draws a
        # bar the full height of the tile, which is what the first pass did.
        in_v_y = y0 <= y < y1
        for x in range(size):
            on = (in_v_y and bx0 <= x < bx1) or (in_h and x0 <= x < x1)
            rows.extend(fg if on else bg)

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    out = b"\x89PNG\r\n\x1a\n"
    out += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
    out += chunk(b"IDAT", zlib.compress(bytes(rows), 9))
    out += chunk(b"IEND", b"")
    open(path, "wb").write(out)
    print(f"{path}  {size}x{size}")


SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="12" fill="#0F172A"/>
  <path d="M27.8 13h8.4v10.8H47v8.4H36.2V43h-8.4V32.2H17v-8.4h10.8z" fill="#fff"/>
</svg>
"""

if __name__ == "__main__":
    # 192 and 512 are what a manifest needs; 180 is the one iOS reads, and iOS
    # rounds the corners itself so the tile is square here.
    for size in (192, 512, 180):
        name = "apple-touch-icon.png" if size == 180 else f"icon-{size}.png"
        png(f"public/{name}", size, BG, FG, arm=0.46, thick=0.17)
    open("public/icon.svg", "w").write(SVG)
    print("public/icon.svg")
