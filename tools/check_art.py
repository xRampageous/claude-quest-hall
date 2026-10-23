"""Validate workbench-art.json and render every sprite to a preview sheet.

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
    for part in ("floorTile", "wallStrip"):
        check(f"{room['name']}/{part}", room[part])
for name, s in art["icons"].items():
    check(f"icons/{name}", s)
    sprites.append((name, s))

print("\n".join(problems) if problems else "valid: all sizes and palettes check out")

# Preview: furniture and icons in a row, then each room as wall + 3x2 tiled floor.
S = 6
sheet = Image.new("RGB", (900, 120 + len(art["rooms"]) * 150), (30, 30, 30))
d = ImageDraw.Draw(sheet)
x = 10
for name, s in sprites:
    im = image(s, S)
    sheet.paste(im, (x, 10), im)
    d.text((x, 10 + im.height + 4), name, fill=(200, 200, 200))
    x += im.width + 20
y = 130
for room in art["rooms"]:
    wall = image(room["wallStrip"], S)
    floor = image(room["floorTile"], S)
    for i in range(4):
        sheet.paste(wall, (10 + i * wall.width, y), wall)
        for j in range(8):
            sheet.paste(floor, (10 + j * floor.width, y + wall.height), floor)
            sheet.paste(floor, (10 + j * floor.width, y + wall.height + floor.height), floor) if False else None
    d.text((500, y + 10), room["name"], fill=room["accent"])
    desk = image(art["furniture"]["desk"], S)
    mon = image(art["furniture"]["monitorOn"], S)
    sheet.paste(desk, (560, y + 70), desk)
    sheet.paste(mon, (560 + 14 * S, y + 70 - mon.height + 2 * S), mon)
    y += 150
sheet.save(sys.argv[2])
