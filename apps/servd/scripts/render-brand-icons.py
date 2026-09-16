"""Rasterise the CANVEXIA mark from packages/ui's own path strings.

No rasteriser is installed in this sandbox, and the four bands are made
entirely of straight segments — no curves — so a scanline fill is exact rather
than an approximation. Reading the geometry out of brand.tsx means the PNGs
cannot drift from the SVG the app draws.
"""
import re, zlib, struct, sys

SRC = "/home/user/canvexia/packages/ui/src/brand.tsx"
src = open(SRC).read()
band = dict(re.findall(r'(\w+): "([^"]+)"',
                       src[src.index("export const BAND = {"):src.index("};", src.index("export const BAND = {"))]))
cols = dict(re.findall(r'(\w+): "(#[0-9A-Fa-f]{6})"',
                       src[src.index("export const MARK_COLORS = {"):src.index("} as const;")]))

def hexrgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

def parse(d):
    """SVG path -> list of (x, y). Handles M, implicit L, L, H/h, V/v, Z."""
    toks = re.findall(r'[MLHVZmlhvz]|-?\d*\.?\d+', d)
    pts, i, cur, cmd = [], 0, (0.0, 0.0), None
    while i < len(toks):
        t = toks[i]
        if t in "MLHVZmlhvz":
            cmd = t; i += 1
            if cmd in "Zz":
                continue
        if cmd in "Mm":
            x, y = float(toks[i]), float(toks[i+1]); i += 2
            cur = (x, y) if cmd == "M" else (cur[0]+x, cur[1]+y)
            pts.append(cur); cmd = "L" if cmd == "M" else "l"   # implicit lineto after moveto
        elif cmd in "Ll":
            x, y = float(toks[i]), float(toks[i+1]); i += 2
            cur = (x, y) if cmd == "L" else (cur[0]+x, cur[1]+y)
            pts.append(cur)
        elif cmd in "Hh":
            x = float(toks[i]); i += 1
            cur = (x if cmd == "H" else cur[0]+x, cur[1]); pts.append(cur)
        elif cmd in "Vv":
            y = float(toks[i]); i += 1
            cur = (cur[0], y if cmd == "V" else cur[1]+y); pts.append(cur)
        else:
            i += 1
    return pts

def inside(poly, x, y):
    """Even-odd test. The bands are simple polygons, so this is enough."""
    n, c = len(poly), False
    for a in range(n):
        x1, y1 = poly[a]; x2, y2 = poly[(a+1) % n]
        if (y1 > y) != (y2 > y):
            if x < x1 + (y - y1) / (y2 - y1) * (x2 - x1):
                c = not c
    return c

def render(size, pad=0.0, bg=None, ss=4, ink=None):
    """RGBA bytes.

    `pad` insets the 48-unit artwork (maskable icons need room).
    `bg`   fills behind the mark; None leaves it transparent.
    `ink`  overrides the three dark bands. Needed because one deployment now
           ships THREE installable apps off the same mark, and the only thing
           telling them apart on a home screen is the tile colour — so the
           partner portal's tile is CANVEXIA purple and Field's is near-black.
           On either, the #1A1A1E bands would be invisible.
    """
    W = size
    inner = size * (1 - 2*pad)
    scale = inner / 48.0
    off = size * pad
    dark = ink or cols["ink"]
    polys = [(parse(band["topLeft"]),   ("flat", dark)),
             (parse(band["bottomLeft"]),("flat", dark)),
             (parse(band["bottomRight"]),("flat", dark)),
             # The gradient band is NOT recoloured. Coral into ember is the one
             # thing all three apps keep, so they still read as one family.
             (parse(band["topRight"]),  ("grad", None))]
    gx1, gy1, gx2, gy2 = 26.0, 22.0, 38.0, 10.0
    gdx, gdy = gx2-gx1, gy2-gy1
    glen2 = gdx*gdx + gdy*gdy
    c0, c1 = hexrgb(cols["coral"]), hexrgb(cols["ember"])
    bgc = hexrgb(bg) if bg else None

    px = bytearray()
    for py in range(W):
        row = bytearray()
        for pxi in range(W):
            acc = [0.0, 0.0, 0.0, 0.0]
            for sy in range(ss):
                for sx in range(ss):
                    # device -> user space
                    ux = ((pxi + (sx+0.5)/ss) - off) / scale
                    uy = ((py  + (sy+0.5)/ss) - off) / scale
                    hit = None
                    for poly, fill in polys:
                        if inside(poly, ux, uy):
                            if fill[0] == "flat":
                                hit = hexrgb(fill[1])
                            else:
                                t = ((ux-gx1)*gdx + (uy-gy1)*gdy) / glen2
                                t = 0.0 if t < 0 else (1.0 if t > 1 else t)
                                hit = tuple(round(c0[k] + (c1[k]-c0[k])*t) for k in range(3))
                            break
                    if hit:
                        acc[0] += hit[0]; acc[1] += hit[1]; acc[2] += hit[2]; acc[3] += 255
                    elif bgc:
                        acc[0] += bgc[0]; acc[1] += bgc[1]; acc[2] += bgc[2]; acc[3] += 255
            n = ss*ss
            a = acc[3]/n
            if a > 0:
                # un-premultiply so edges keep the right hue
                r, g, b = (acc[0]/n)*255/a, (acc[1]/n)*255/a, (acc[2]/n)*255/a
            else:
                r = g = b = 0
            row += bytes((min(255, round(r)), min(255, round(g)), min(255, round(b)), round(a)))
        px += b"\x00" + row

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data))
    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", W, W, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(bytes(px), 9))
            + chunk(b"IEND", b""))

# One deployment, three installable apps, one mark. On a home screen the NAME
# is truncated — "CANVEXIA H…" next to "CANVEXIA" — so the tile colour is what
# actually tells them apart, and three identical white tiles told them apart not
# at all.
#
# The mark and its coral-into-ember band are identical in all three. Only the
# field behind it changes, which is the difference between "three apps from one
# company" and "three copies of the same app".
VARIANTS = {
    # HQ keeps the original transparent/white set: it is the one people install
    # on a desktop, where a coloured tile is the odd one out.
    "canvexia":        {"bg": None,      "mask_bg": "#FFFFFF", "ink": None},
    # The partner portal. CANVEXIA's own purple, the same #3B1E54 already in its
    # manifest's theme_color and on its status bar.
    "canvexia-portal": {"bg": "#3B1E54", "mask_bg": "#3B1E54", "ink": "#FFFFFF"},
    # Field. Near-black, so a salesperson glancing at a home screen in sunlight
    # can tell it from the portal without reading either label.
    "canvexia-field":  {"bg": "#1A1A1E", "mask_bg": "#1A1A1E", "ink": "#FFFFFF"},
}

if __name__ == "__main__":
    out = "/home/user/canvexia/apps/servd/public/brand"
    only = sys.argv[1:] or list(VARIANTS)
    for stem in only:
        v = VARIANTS[stem]
        jobs = [(f"{stem}-180.png", 180, 0.0, v["bg"]),
                (f"{stem}-192.png", 192, 0.0, v["bg"]),
                (f"{stem}-512.png", 512, 0.0, v["bg"]),
                # Maskable: Android crops to a circle, so the art sits in the
                # safe zone on an OPAQUE field rather than being clipped.
                (f"{stem}-maskable-512.png", 512, 0.20, v["mask_bg"])]
        for name, size, pad, bg in jobs:
            open(f"{out}/{name}", "wb").write(render(size, pad, bg, ink=v["ink"]))
            print("wrote", name, size)
