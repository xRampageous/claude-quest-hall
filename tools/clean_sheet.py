"""Snap an AI-generated sprite sheet (5 frames in a row, magenta background)
to its true pixel grid, aligned on the feet, with a small shared palette.

usage: python clean_sheet.py <sheet image> <out dir> <name>
writes <name>_frames.png (w x h x5), <name>_preview.png (before/after), and
prints the grid it found and alignment checks.
"""
import sys
from collections import Counter
from PIL import Image

FRAMES, COLORS = 5, 16

src, out, name = sys.argv[1], sys.argv[2], sys.argv[3]
img = Image.open(src).convert("RGB")
px = img.load()
iw, ih = img.size


import os
DARK = os.environ.get("BG") == "dark"


def is_bg(c):
    r, g, b = c
    if DARK:
        # Neutral dark grey; the outline is close but tinted blue.
        return 18 <= r <= 40 and abs(r - g) <= 4 and b - r <= 5
    return r > 170 and b > 170 and g < 110


def far(a, b):
    return sum(abs(x - y) for x, y in zip(a, b)) > 60


# Columns that hold any character pixel, grouped into runs: one run per frame.
used = [any(not is_bg(px[x, y]) for y in range(0, ih, 2)) for x in range(iw)]
runs, start = [], None
for x, u in enumerate(used + [False]):
    if u and start is None:
        start = x
    elif not u and start is not None:
        if x - start > 20:
            runs.append((start, x))
        start = None
if len(runs) != FRAMES:
    sys.exit(f"expected {FRAMES} frames, found {len(runs)}: {runs}")

# The art's own pixel size: the step that best lines up with where colors change.
edges = []
for y in range(0, ih, 7):
    for x in range(1, iw):
        if far(px[x, y], px[x - 1, y]):
            edges.append(x)
best, block, phase = -1, 0.0, 0.0
for step10 in range(int(sys.argv[4]) * 10 if len(sys.argv) > 4 else 120, int(sys.argv[5]) * 10 if len(sys.argv) > 5 else 360):
    step = step10 / 10
    hist = Counter(round((e % step) / step * 20) % 20 for e in edges)
    peak, at = max((v, k) for k, v in hist.items())
    score = peak / len(edges)
    if score > best:
        best, block, phase = score, step, at / 20 * step
print(f"pixel size {block:.1f}px (fit {best:.2f})")

# Vertical extent, shared by all frames.
rows = [y for y in range(ih) if any(not is_bg(px[x, y]) for x in range(0, iw, 3))]
top, bottom = rows[0], rows[-1]
h = round((bottom - top + 1) / block) + 2
widest = max(x1 - x0 for x0, x1 in runs)
w = round(widest / block) + 2
print(f"sprite grid {w}x{h}")


def feet_center(x0, x1):
    # The feet are the steadiest part: center each frame on them.
    band = range(int(bottom - block * 2), bottom + 1)
    xs = [x for x in range(x0, x1) if any(not is_bg(px[x, y]) for y in band)]
    return (xs[0] + xs[-1]) / 2


frames = []
for x0, x1 in runs:
    cx = feet_center(x0, x1)
    # Snap the frame's left edge to the art's grid so samples land mid-pixel.
    left = cx - w / 2 * block
    left = phase + round((left - phase) / block) * block
    f = Image.new("RGBA", (w, h))
    for r in range(h):
        for c in range(w):
            x0s, y0s = left + c * block, bottom + 1 - (h - 1 - r) * block - block
            samples = [
                px[int(x0s + dx * block), int(y0s + dy * block)]
                for dy in (0.35, 0.5, 0.65)
                for dx in (0.35, 0.5, 0.65)
                if 0 <= int(x0s + dx * block) < iw and 0 <= int(y0s + dy * block) < ih
            ]
            fg = [s for s in samples if not is_bg(s)]
            if len(fg) * 2 > len(samples):
                # The most common color, not an average: keeps edges crisp.
                f.putpixel((c, r), Counter(fg).most_common(1)[0][0] + (255,))
    frames.append(f)

# One shared palette across all frames, quantized over opaque pixels only.
sheet = Image.new("RGBA", (w * FRAMES, h))
for i, f in enumerate(frames):
    sheet.paste(f, (i * w, 0))
# Merge near-identical colors (JPEG/WebP noise) into a small palette:
# the most used colors win, and every other one joins its nearest winner.
counts = Counter(c[:3] for c in sheet.getdata() if c[3])
palette = []
for color, _ in counts.most_common():
    if all(sum(abs(x - y) for x, y in zip(color, p)) > 48 for p in palette):
        palette.append(color)
palette = palette[:COLORS]
print(f"palette: {len(palette)} colors")
q = Image.new("RGBA", sheet.size)
for y in range(sheet.height):
    for x in range(sheet.width):
        c = sheet.getpixel((x, y))
        if c[3]:
            q.putpixel((x, y), min(palette, key=lambda p: sum((a - b) ** 2 for a, b in zip(c[:3], p))) + (255,))
q.save(f"{out}/{name}_frames.png")

# Alignment: the head (top third) and feet (bottom 3 rows) should match idle.
base = q.crop((0, 0, w, h))
for i in range(1, FRAMES):
    f = q.crop((i * w, 0, i * w + w, h))
    diff = lambda rs: sum(base.getpixel((c, r)) != f.getpixel((c, r)) for r in rs for c in range(w))
    print(f"frame {i}: head diff {diff(range(0, h // 3))} px, feet diff {diff(range(h - 3, h))} px")

scale = 8
big = q.resize((w * FRAMES * scale, h * scale), Image.NEAREST)
thumb = img.resize((big.width, int(ih * big.width / iw)))
prev = Image.new("RGB", (big.width + 40, thumb.height + big.height + 60), (30, 30, 30))
prev.paste(thumb, (20, 20))
prev.paste(big, (20, thumb.height + 40), big)
prev.save(f"{out}/{name}_preview.png")
