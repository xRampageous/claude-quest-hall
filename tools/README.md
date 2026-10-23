# Art tools

How the Workbench's art was made, so characters and scenery can be added or
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

## Scenery

Rooms, furniture and icons are pixel grids in `assets/workbench-art.json`.
Check it and render a preview sheet with:

```bash
python tools/check_art.py assets/workbench-art.json preview.png
```

## Sounds

`tools/chimes.py` synthesizes the two chimes into a folder:

```bash
python tools/chimes.py assets
```
