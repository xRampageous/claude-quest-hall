# Agent Quest artwork

This directory contains a curated copy of environment art, first-tier hero sprites and two monster idle animations from [Agent Quest](https://github.com/Hin-Nattapat/agent-quest), revision `167ce057a4e32ec705c75ead8dff6b9b714f3fb4`.

The 16 scene backgrounds, guild interior, four playable first-tier sprite sets, and the `glitch_pit` and `circuit_catacombs` monster idle frames (`sprites/monsters/`) are used by Patchhaven's live map. The monsters appear as the bugs a failing check lets loose. The other Agent Quest files are not bundled because they are unrelated encounter, interface, NPC, boss and higher-tier art. `scenes-compact/` and `overworld/guild-compact.png` are nearest-neighbor, 64-color, 256×82 copies sized for the live SVG panel.

The source repository publishes these materials under the MIT License. Its copyright and permission notice is preserved in `LICENSE`. Rebuild compact backgrounds after editing the original scenes with `python tools/compact_agentquest_backgrounds.py` (requires Pillow), then regenerate the embedded SVG data modules with `python tools/generate_agentquest_art.py`, which packs each animation's nine frames into one strip.
