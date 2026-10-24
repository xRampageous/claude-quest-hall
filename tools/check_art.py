"""Validate sprite grids and render furniture, icons and room accents.

usage: python check_art.py <art.json> <preview.png>
"""
import json
import re
import sys
from PIL import Image, ImageDraw

art = json.load(open(sys.argv[1], encoding="utf8"))
problems = []


def check(path, s):
    if len(s["rows"]) != s["h"]:
        problems.append(f"{path}: {len(s['rows'])} rows, expected {s['h']}")
    for i, row in enumerate(s["rows"]):
        if len(row) != s["w"]:
            problems.append(f"{path}: row {i} is {len(row)} wide, expected {s['w']}")
        for ch in row:
            if ch != "." and ch not in s["palette"]:
                problems.append(f"{path}: row {i} uses {ch!r}, not in palette")
                break
    for k, v in s["palette"].items():
        if not re.fullmatch(r"#[0-9a-fA-F]{6}", v):
            problems.append(f"{path}: palette {k!r} = {v!r} is not #rrggbb")


def image(s, scale):
    img = Image.new("RGBA", (s["w"], s["h"]))
    for y, row in enumerate(s["rows"]):
        for x, ch in enumerate(row[: s["w"]]):
            if ch in s["palette"]:
                img.putpixel((x, y), Image.new("RGB", (1, 1), s["palette"][ch]).getpixel((0, 0)) + (255,))
    return img.resize((s["w"] * scale, s["h"] * scale), Image.NEAREST)


sprites = []
for name, s in art["furniture"].items():
    check(f"furniture/{name}", s)
    sprites.append((name, s))
on = "".join(art["furniture"]["monitorOn"]["rows"])
off = "".join(art["furniture"]["monitorOff"]["rows"])
if "S" not in on:
    problems.append("monitorOn has no 'S' glow pixels")
if "S" in off:
    problems.append("monitorOff uses 'S'")
for room in art["rooms"]:
    if not room.get("name"):
        problems.append("rooms: missing palette name")
    if not re.fullmatch(r"#[0-9a-fA-F]{6}", room.get("accent", "")):
        problems.append(f"rooms/{room.get('name', '?')}: invalid accent color")
for name, s in art["icons"].items():
    check(f"icons/{name}", s)
    sprites.append((name, s))

print("\n".join(problems) if problems else "valid: all sizes and palettes check out")

# Preview: sprite grids in a row, with the six room accents below.
S = 6
sheet = Image.new("RGB", (900, 190), (30, 30, 30))
d = ImageDraw.Draw(sheet)
x = 10
for name, s in sprites:
    im = image(s, S)
    sheet.paste(im, (x, 10), im)
    d.text((x, 10 + im.height + 4), name, fill=(200, 200, 200))
    x += im.width + 20
y = 128
for i, room in enumerate(art["rooms"]):
    x = 10 + i * 145
    d.rectangle((x, y, x + 135, y + 40), fill=room["accent"])
    d.text((x + 4, y + 12), room["name"], fill=(22, 35, 37))
sheet.save(sys.argv[2])
