# Patchhaven art tools

How Patchhaven's art was made, so characters and scenery can be added or
changed later. All need Python 3 with Pillow (`pip install pillow`).

## A new character

1. Generate a sprite sheet: 5 frames in one row (idle, typing A, typing B,
   reading A, reading B) on a flat magenta `#FF00FF` background. The
   originals are in `art-source/`.
2. Clean it up to its true pixel grid with a small palette. The last two
   numbers are the range of pixel sizes to search; 11 14 fit these sheets:

   ```bash
   python tools/clean_sheet.py art-source/knight.png . knight 11 14
   ```

   It writes `knight_frames.png` and a before/after `knight_preview.png`.
3. Steady it: line each frame up with idle, lock the head and boots, drop
   stray pixels and magenta fringe:

   ```bash
   python tools/fix_sheet.py knight
   ```

   It writes `knight_final.png`; copy that to `assets/knight.png`.
   (The wizard had hand fixes of its own: `tools/fix_wizard.py`.)
4. Add the name to `CAST` in `tools/gen_art.py`, and to `CREW` in
   `hooks/register.tsx`.

## Rebuilding the art module

Every sprite becomes compact SVG paths in `hooks/art.ts`:

```bash
python tools/gen_art.py .
```

The marketplace icon is drawn at 64 pixels and scaled up with nearest-neighbor
filtering:

```bash
python tools/gen_icon.py
```

## Scenery

Furniture and icons are pixel grids in `assets/workbench-art.json`. Room
palettes live there; the renderer draws their walls and floors as larger,
low-contrast SVG patterns so repeated tiles stay subtle.

The live Patch Trail also uses curated Agent Quest rooms, sprites and two
monsters. The source art and its MIT license notice are in `assets/agent-quest/`.
The generator packs each nine-frame animation (walks, the attack and the
monsters' idle) into one horizontal strip, which the map steps through inside a
clipped 56×56 window; a scene must stay under the `Svg` element's 131,072
character source limit. To regenerate the 256×82 palette-limited background
copies and embedded TypeScript data modules, run:

```bash
python tools/compact_agentquest_backgrounds.py
python tools/generate_agentquest_art.py
```

Regenerate the HUD and living map example with
`npx --yes tsx tools/render-preview.ts`. Pass a pane width, such as `304`, and
optionally `comfortable` or `large`, to inspect other layouts. The renderer
updates the SVG preview under `assets/`.
Check the sprite grids and render a preview sheet with:

```bash
python tools/check_art.py assets/workbench-art.json preview.png
```

## Sounds

`tools/chimes.py` synthesizes the two chimes into a folder:

```bash
python tools/chimes.py assets
```
