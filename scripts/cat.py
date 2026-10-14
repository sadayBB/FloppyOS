# Generates the cat assistant sprite (32x32) with shading and coloured outline.
# Palette slots (recoloured at runtime): 1 highlight, 2 base, 3 shade, 4 outline,
# s stripes, w white, e pupil, i iris, p pink, n nose, '.' transparent.
import math, sys, zlib, struct

W, H = 32, 32

def make(blink=False, tail=0):
    g = [['.'] * W for _ in range(H)]
    fur = [[False] * W for _ in range(H)]

    def ell(cx, cy, rx, ry, x, y):
        return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1.0

    def tri(ax, ay, bx, by, cx, cy, x, y):
        def s(px, py, qx, qy, rx, ry): return (px - rx) * (qy - ry) - (qx - rx) * (py - ry)
        d1, d2, d3 = s(x, y, ax, ay, bx, by), s(x, y, bx, by, cx, cy), s(x, y, cx, cy, ax, ay)
        return not ((d1 < 0 or d2 < 0 or d3 < 0) and (d1 > 0 or d2 > 0 or d3 > 0))

    # tail: thick curve from the body's right side curling up
    # tail: quadratic curve hugging the right side, tip sways with `tail`
    tail_pts = []
    p0, p1, p2 = (22.0, 29.6), (30.2, 29.6), (28.4 - tail * 1.6, 18.6 - tail * 0.4)
    for i in range(41):
        t = i / 40
        tail_pts.append(((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
                         (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]))

    for y in range(H):
        for x in range(W):
            px, py = x + 0.5, y + 0.5
            body = ell(16, 24.5, 8.6, 7.2, px, py) and py < 31
            head = ell(16, 12.2, 10.2, 7.8, px, py)
            earL = tri(5.2, 1.0, 5.0, 10.5, 12.5, 6.5, px, py)
            earR = tri(26.8, 1.0, 27.0, 10.5, 19.5, 6.5, px, py)
            tl = any(math.hypot(px - tx, py - ty) < 1.5 for tx, ty in tail_pts)
            if body or head or earL or earR or tl:
                fur[y][x] = True

    inside = lambda x, y: 0 <= x < W and 0 <= y < H and fur[y][x]
    for y in range(H):
        for x in range(W):
            if not fur[y][x]:
                if any(inside(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                    g[y][x] = '4'
                continue
            # light from the top-left
            lit = not inside(x - 1, y - 1) or not inside(x - 2, y - 2)
            dark = not inside(x + 1, y + 1) or not inside(x + 2, y + 1) or not inside(x + 1, y + 2)
            g[y][x] = '1' if lit and not dark else '3' if dark and not lit else '2'

    def put(x, y, c):
        if 0 <= x < W and 0 <= y < H: g[y][x] = c

    # tail tip + rings
    tx, ty = tail_pts[-1]
    for i in (28, 36):
        rx, ry = tail_pts[i]
        if fur[int(ry)][int(rx)]: put(int(rx), int(ry), 's')
    # neck shadow under the head
    for x in range(10, 23):
        if g[20][x] in '12': put(x, 20, '3')
    # inner ears
    for y in range(3, 9):
        for x in range(W):
            px, py = x + 0.5, y + 0.5
            if tri(6.6, 3.4, 6.6, 9.2, 11.0, 7.0, px, py) or tri(25.4, 3.4, 25.4, 9.2, 21.0, 7.0, px, py):
                put(x, y, 'p')
    # forehead stripes
    for x, y0 in ((14, 5), (16, 4), (18, 5)):
        for y in range(y0, y0 + 3): put(x, y, 's')
    # cheek stripes
    for x, y in ((6, 12), (7, 13), (25, 12), (24, 13)): put(x, y, 's')
    # white muzzle + chest
    for y in range(H):
        for x in range(W):
            px, py = x + 0.5, y + 0.5
            if ell(16, 16.0, 3.7, 2.3, px, py) or (ell(16, 25, 3.9, 5.2, px, py) and fur[y][x] and py < 29):
                put(x, y, 'w')
    # paws
    for cx in (12, 20):
        for y in range(28, 31):
            for x in range(cx - 2, cx + 2):
                put(x, y, 'w')
        put(cx - 1, 30, '1') if False else None
    for y in (29, 30):
        for x in (15, 16):
            put(x, y, '3')
    for x in range(8, 25):
        if fur[30][x] or g[30][x] == 'w': put(x, 31, '4')
    # eyes
    for ex in (10, 19):
        if blink:
            for x in range(ex, ex + 4): put(x, 12, '4')
            put(ex - 1, 11, '4'); put(ex + 4, 11, '4')
        else:
            for y in range(9, 14):
                for x in range(ex, ex + 4):
                    edge = (y in (9, 13)) and x in (ex, ex + 3)
                    if not edge: put(x, y, 'e')
            for x in range(ex + 1, ex + 3):
                put(x, 12, 'i')
            put(ex, 12, 'i') if False else None
            put(ex + 1, 10, 'w'); put(ex + 1, 11, 'w'); put(ex + 2, 10, 'w')
            put(ex + 2, 13, 'i') if False else None
    # blush
    for x, y in ((9, 15), (10, 15), (21, 15), (22, 15)): put(x, y, 'p')
    # nose + mouth
    put(15, 14, 'n'); put(16, 14, 'n'); put(15, 15, 'n') if False else None
    put(16, 15, '4') if False else None
    put(15, 15, '4'); put(16, 15, '4')
    put(14, 16, '4'); put(17, 16, '4')
    put(13, 15, '4') if False else None
    return [''.join(r) for r in g]

PAL = {'1': '#ffd08a', '2': '#f5a55a', '3': '#d9782f', '4': '#7a3b1e', 's': '#d9782f', 'w': '#fff6ec',
       'e': '#2b1d2e', 'i': '#5fc48a', 'p': '#ff9fb8', 'n': '#ff7aa0'}

def png(rows, path, scale=10):
    h, w = len(rows), len(rows[0])
    raw = b''
    for y in range(h * scale):
        line = b'\x00'
        for x in range(w * scale):
            c = rows[y // scale][x // scale]
            if c == '.': line += b'\xe8\xe0\xf5\xff'
            else:
                v = PAL[c]; line += bytes([int(v[1:3], 16), int(v[3:5], 16), int(v[5:7], 16), 255])
        raw += line
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    open(path, 'wb').write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w * scale, h * scale, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b''))

if __name__ == '__main__':
    frames = {'cat': make(), 'catBlink': make(blink=True), 'catTail': make(tail=1)}
    if len(sys.argv) > 1:
        png(frames['cat'] + [''], sys.argv[1]) if False else png(frames['cat'], sys.argv[1])
    for name, rows in frames.items():
        print(f'  {name}: [')
        for r in rows: print(f"    '{r}',")
        print('  ],')
