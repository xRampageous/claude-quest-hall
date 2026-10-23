# Workbench

A little OSRS-style world beside the chat that shows what Claude is doing, live.
Claude is a wizard; each subagent is a knight, ranger or smith. Every folder
being worked on is a room, every file a desk.

Open it with `/board`.

## Install

At the prompt of a terminal session:

```
/plugin install task-board --marketplace xRampageous/claude-quest-hall
```

Answer `y` to add the marketplace, then pick a scope (the user scope loads it
in every session).

From a shell:

```bash
claude plugin install task-board --marketplace xRampageous/claude-quest-hall
```

In the desktop app, where `/plugin` does not run: click + next to the prompt
box, then Plugins, Add marketplace with `xRampageous/claude-quest-hall`, then
Add plugin.

The repository is public, so the marketplace install works without a GitHub
credential. The repository does not currently include a software license;
public visibility alone does not grant permission to reuse or redistribute the
code.

To update an installed copy from a terminal:

```bash
npx --yes @anthropic-ai/claude-code plugin update task-board@claude-quest-hall --scope user
```

## What you see

**The header card**
- **⚒ Coding level** with an XP bar. Every edit earns XP on the classic level
  curve, and your total carries over between sessions.
- **This session:** edits, files, quests finished, and files banked by commits.
- **⏱ timer** while Claude is working on a turn.
- **Where everyone is:** each character, its job if it is a subagent, and the
  folder trail of the file it is on.

**The Quest Hall**
- The quest board: Claude's steps in quest colors. Red is not started, yellow
  is in progress, green is done. A finished quest becomes "Quest complete!".
- The chest: commits bank their files here, with flying coins.
- Characters come here to read the quests.

**The rooms**
- Each folder in play is a themed room: Bank, Grand Exchange, Wizards' Tower,
  Smithy, Fishing Dock or Castle Kitchen. A folder always gets the same theme.
- Each file is a desk, with its git status (M, A, U, D, R) and line counts.
- **The Terminal:** shell commands, file searches and outside tools are run at
  a glowing rune console, in a room that appears once something is run.
- **The Forge:** files created this turn are made here, with anvil sparks and
  a NEW tag.
- **The Inn:** between turns the wizard waits by the fire, and dozes off after
  two minutes.

## What the characters do

| You see | It means |
|---|---|
| Typing at a desk, crystal ball glowing | Editing that file |
| Reading a book, purple glow | Reading that file |
| ✚ bubble, sparks, desk rising | Creating a new file |
| "…" thought bubble | Thinking between steps |
| 📜 at the quest board | Reading or updating the quests |
| ⚔ at a training dummy, then ✓ or ✗ | Running tests: passed or failed |
| ⌕ with a map scroll | Searching the web |
| ✦ rune circle | Applying a batch of changes |
| Typing at the Terminal's rune console | Running a command, a search, or an outside tool |
| Red hitsplat with a number | A tool failed |
| Grey ✋ splat | You refused a tool |
| ⚡ Out of run energy, wizard slumped | The usage limit was reached |
| Grey "The turn stopped" banner | The turn failed (server busy, an error) |
| "stopped" at the Inn | You stopped the turn |
| Bouncing under a ? | Waiting for you to approve something |
| Zz drifting up | Idle |
| Blue and violet sparks | A subagent arriving, or leaving when done |
| Gold +XP and a hop | An edit landed |
| LEVEL UP! banner | You levelled up |
| Coins into the chest | A commit |
| Deposit-all puff | The conversation was compacted |

## Commands

- `/board`: open the Workbench.
- `/board stats` (or `/board recap`): show this session's XP, edits, files,
  completed quests, line counts and files banked by commits.
- `/board help` (or `/board ?`): list the commands and settings.
- `/board sound`: turn chimes on or off (off at first). One chime when Claude
  needs your permission, another when a turn ends.
- `/board plan`: show Claude's step list under each message again, or move it
  back to the Workbench.

## Development

From the repository root, use a Claude Code version that supports mod tests:

```bash
claude plugin test
claude plugin validate . --strict
```

The tests run without a Claude session, sign-in or network access. They cover
quest completion, failed and refused plan updates, XP storage failures, the
rendered scene, terminal fallback and drawing size with a large working tree.

If an older installed CLI does not recognize `plugin test`, the version used
to verify this release can be run without replacing it:

```bash
npx --yes @anthropic-ai/claude-code@2.1.309 plugin test
npx --yes @anthropic-ai/claude-code@2.1.309 plugin validate . --strict
```

## Art

All the art is original, made for this mod: the characters were generated
from pixel-art prompts and cleaned up to an exact grid; the rooms and
furniture were drawn as pixel grids (`assets/workbench-art.json`); the chimes
are synthesized bell tones.
