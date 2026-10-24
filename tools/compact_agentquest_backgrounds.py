#!/usr/bin/env python3
"""Create small pixel-preserving copies used in the live SVG map."""

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets" / "agent-quest"
TARGET = (256, 82)


def compact(source: Path, destination: Path) -> None:
    image = Image.open(source).convert("RGB").resize(TARGET, Image.Resampling.NEAREST)
    image = image.quantize(colors=64, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination, format="PNG", optimize=True)


def main() -> None:
    scenes = sorted((ASSETS / "scenes").glob("*.png"))
    if len(scenes) != 16:
        raise SystemExit(f"Expected 16 Agent Quest scenes, found {len(scenes)}")
    for scene in scenes:
        compact(scene, ASSETS / "scenes-compact" / scene.name)
    compact(ASSETS / "overworld" / "guild.png", ASSETS / "overworld" / "guild-compact.png")
    print(f"Prepared {len(scenes) + 1} compact 256×82 background images.")


if __name__ == "__main__":
    main()
