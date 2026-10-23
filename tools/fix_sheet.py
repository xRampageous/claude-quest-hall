"""Steady a cleaned 5-frame sheet: line every frame up with the idle frame,
lock the head and feet to idle's, and remove single-pixel specks.

usage: python fix_sheet.py <name>   (reads <name>_frames.png, writes <name>_final.png and <name>_final_preview.png)
"""
import sys
from collections import Counter
from PIL import Image

name = sys.argv[1]
im = Image.open(f'{name}_frames.png').convert('RGBA')
W, H = im.size
FW = W // 5
# Magenta that bled into the edges: no character here uses purple, so any
# pixel with red and blue both well above green is background, made clear.
pim = im.load()
for y in range(H):
    for x in range(W):
        r, g, b, a = pim[x, y]
        if a and r - g > 40 and b - g > 40 and abs(r - b) < 70:
            pim[x, y] = (0, 0, 0, 0)
frames = [im.crop((i * FW, 0, i * FW + FW, H)) for i in range(5)]
HEAD = int(H * 0.36)  # hat, hood or helm, and the face
FEET = 5


def mismatch(a, b, rows):
    pa, pb = a.load(), b.load()
    return sum(pa[x, y] != pb[x, y] for y in rows for x in range(FW))


def shifted(f, dx, dy):
    out = Image.new('RGBA', f.size)
    out.paste(f, (dx, dy))
    return out


idle = frames[0]
for i in range(1, 5):
    # The shift that best lines this frame's head up with idle's.
    best = min(((dx, dy) for dx in range(-3, 4) for dy in range(-3, 4)), key=lambda d: mismatch(idle, shifted(frames[i], *d), range(HEAD)))
    f = shifted(frames[i], *best)
    pf, pi = f.load(), idle.load()
    for y in list(range(HEAD)) + list(range(H - FEET, H)):
        for x in range(FW):
            pf[x, y] = pi[x, y]
    frames[i] = f
    print(f'frame {i}: shifted {best}')

out = Image.new('RGBA', (W, H))
for i, f in enumerate(frames):
    out.paste(f, (i * FW, 0))

# Single pixels unlike all four neighbours, where three or more agree, are noise.
src = out.copy().load()
px = out.load()
fixed = 0
for y in range(H):
    for x in range(W):
        n = [src[x + dx, y + dy] for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)) if 0 <= x + dx < W and 0 <= y + dy < H]
        c = Counter(n).most_common(1)[0]
        if src[x, y] not in n and c[1] >= 3:
            px[x, y] = c[0]
            fixed += 1
print(f'{fixed} specks removed')
out.save(f'{name}_final.png')

big = out.resize((W * 6, H * 6), Image.NEAREST)
prev = Image.new('RGB', (big.width + 40, big.height + H * 2 + 60), (30, 30, 30))
prev.paste(big, (20, 20), big)
small = out.resize((W * 2, H * 2), Image.NEAREST)
prev.paste(small, (20, big.height + 40), small)
prev.save(f'{name}_final_preview.png')
