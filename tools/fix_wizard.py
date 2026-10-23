"""Hand fixes for the cleaned wizard sheet (5 frames of 29x59): matching eyes,
head and boots locked to the idle frame, skin specks off the robe.

usage: python fix_wizard.py [cleaned sheet]   (default art-source/wizard_cleaned.png; writes wizard_final.png)
"""
import sys
from collections import Counter
from PIL import Image

im = Image.open(sys.argv[1] if len(sys.argv) > 1 else 'art-source/wizard_cleaned.png').convert('RGBA')
W, H = im.size
FW = W // 5
OUT = (0x11, 0x14, 0x2c, 255)
SKIN = {(0xfa, 0xc5, 0x91, 255), (0xf7, 0xab, 0x75, 255), (0xfa, 0xed, 0xbd, 255)}
HEAD_ROWS = range(0, 26)   # hat, face and eyes: identical in every frame
FEET_ROWS = range(54, 59)  # boots: identical in every frame

# 1. Idle frame: two matching 2x2 eyes with 2px of skin between them.
for x in (12, 13, 16, 17):
    for y in (23, 24):
        im.putpixel((x, y), OUT)
for x in (14, 15):
    for y in (23, 24):
        im.putpixel((x, y), (0xfa, 0xc5, 0x91, 255))

# 2. Copy the idle head and boots into every other frame.
for f in range(1, 5):
    for y in list(HEAD_ROWS) + list(FEET_ROWS):
        for x in range(FW):
            im.putpixel((f * FW + x, y), im.getpixel((x, y)))

# 3. Skin specks on the robe: skin clusters under 4 pixels below the face.
px = im.load()
seen = set()
fixed = 0
for f in range(5):
    for y in range(30, H):
        for x in range(f * FW, f * FW + FW):
            if (x, y) in seen or px[x, y] not in SKIN:
                continue
            stack, blob = [(x, y)], []
            seen.add((x, y))
            while stack:
                cx, cy = stack.pop()
                blob.append((cx, cy))
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if f * FW <= nx < f * FW + FW and 0 <= ny < H and (nx, ny) not in seen and px[nx, ny] in SKIN:
                        seen.add((nx, ny))
                        stack.append((nx, ny))
            if len(blob) < 4:
                for bx, by in blob:
                    around = [px[bx + dx, by + dy] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))
                              if f * FW <= bx + dx < f * FW + FW and 0 <= by + dy < H]
                    keep = [c for c in around if c not in SKIN and c[3]]
                    if keep:
                        px[bx, by] = Counter(keep).most_common(1)[0][0]
                        fixed += 1
print('skin specks fixed:', fixed)
im.save('wizard_final.png')

big = im.resize((W * 8, H * 8), Image.NEAREST)
prev = Image.new('RGB', (big.width + 40, big.height + H * 2 + 60), (30, 30, 30))
prev.paste(big, (20, 20), big)
small = im.resize((W * 2, H * 2), Image.NEAREST)
prev.paste(small, (20, big.height + 40), small)
prev.save('wizard_final_preview.png')
