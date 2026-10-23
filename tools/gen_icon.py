"""Draw Patchhaven's small stitched-patch marketplace icon."""
from pathlib import Path
import sys

from PIL import Image, ImageDraw

out = Path(sys.argv[1] if len(sys.argv) > 1 else ".claude-plugin/icon.png")
size = 64
im = Image.new("RGBA", (size, size), "#172b34")
d = ImageDraw.Draw(im)

# A dark timber frame and four mismatched cloth patches make the mark legible
# at small sizes while keeping its handmade, old-school game feel.
d.rounded_rectangle((2, 2, 61, 61), radius=8, fill="#203b3b", outline="#d7c491", width=2)
d.rectangle((13, 12, 50, 50), fill="#101f25", outline="#101f25")
d.rectangle((16, 15, 31, 30), fill="#76916a")
d.rectangle((33, 15, 48, 30), fill="#ba7957")
d.rectangle((16, 32, 31, 47), fill="#528a86")
d.rectangle((33, 32, 48, 47), fill="#c39d62")
d.rectangle((31, 15, 33, 48), fill="#172b34")
d.rectangle((16, 30, 48, 32), fill="#172b34")

# Short cream stitches mark the four seams.
for x in (23, 39):
    for y in (19, 25, 36, 42):
        d.rectangle((x, y, x + 2, y + 1), fill="#e2d6b5")
for x in (20, 26, 36, 42):
    for y in (22, 39):
        d.rectangle((x, y, x + 1, y + 2), fill="#e2d6b5")

# A slim workbench plinth grounds the patch emblem.
d.rectangle((11, 52, 52, 55), fill="#82694b")
d.rectangle((14, 56, 49, 58), fill="#bd9863")
d.rectangle((17, 59, 20, 60), fill="#d7c491")
d.rectangle((43, 59, 46, 60), fill="#d7c491")

out.parent.mkdir(parents=True, exist_ok=True)
im.resize((512, 512), Image.Resampling.NEAREST).save(out, optimize=True)
print(f"wrote {out}")
