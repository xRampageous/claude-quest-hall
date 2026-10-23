# Patchhaven

Patchhaven turns a Claude Code session into a small living workshop. Claude
moves between desks as it reads and changes files; each folder becomes a room,
and background agents stay visible at the files they last worked on. The rooms
are the live work map. A growing homestead, a crew roster and a private work
journal add the Agent Quest twist.

Open Patchhaven with `/haven`. `/board` remains an alias.

## Install or update

For a fresh install from a terminal:

```bash
npx --yes @anthropic-ai/claude-code@2.1.309 plugin install task-board --marketplace xRampageous/patchhaven --scope user
```

If your Claude settings still register the old marketplace as
`claude-quest-hall`, install this test branch from that saved source so the
repository matches the existing entry:

```powershell
cd "C:\path\to\your\project"
npx --yes @anthropic-ai/claude-code@2.1.309 plugin install task-board --marketplace xRampageous/claude-quest-hall#feat/patchhaven-v2 --scope project
```

GitHub redirects the old repository path to Patchhaven. After testing, update
the project's marketplace source to `xRampageous/patchhaven` for future
installs.

In Claude Desktop, click **+** beside the prompt box, choose **Plugins**, add
the marketplace `xRampageous/patchhaven`, then install `task-board`.

The repository currently has no software license. Public visibility alone does
not grant permission to reuse or redistribute the code.

If you already installed the old Quest Hall plugin, update that same install:

```bash
npx --yes @anthropic-ai/claude-code@2.1.309 plugin update task-board@claude-quest-hall --scope user
```

The old marketplace name and `task-board` plugin ID stay in place so existing
installs can update through GitHub's repository redirect. The public project
and in-app name are Patchhaven. Your Coding XP carries over; the new journal
starts recording from your next session.

## The living work map

The world keeps Claude's file activity in view. A folder is a themed room, a
file is a desk, and Claude walks between desks as the work moves. The Terminal
room marks commands and searches, the Forge marks new files, and the Patchboard
holds this visit's work orders. Between turns Claude waits at the Inn. If background
agents keep running, they remain at their last file while Claude rests.

The expanded **Crew** panel lists every known agent task, not just the few
characters that fit comfortably on the map. It shows the task description,
current status, and last known file or room. Running tasks remain visible after
Claude's foreground turn finishes; completed, failed and stopped tasks stay in
the recent list. The map draws up to four characters at once to keep file rooms
legible.

The header keeps Coding XP, the current visit's edit and file counts, quest
progress, and files banked by commits. File desks retain their positions across
turns, so the map feels like one place Claude keeps returning to.

## Your settlement

Patchhaven starts as a campsite and grows as work earns six permanent
landmarks: the Patch Garden, Patchboard, Signal Mast, Dispatch Pennant, Crew
Camp and Shared Workshop. Each landmark has a clear activity goal and
keeps a short evidence note when it is earned. There are no loot drops,
streaks, daily chores or rewards that need claiming.

Choose **World**, **Focus** or **Journal** above the map. The Journal records
file names, edit counts, quest and check outcomes, commits, crew activity and
earned XP. It does not save prompts, tool input or source text. You can browse
the latest 24 visits and replay a visit as a read-only scene; replay never runs
tools or changes files. Older visits are pruned, while earned landmarks remain.

Choose a wizard, knight, ranger or smith as your hero, give the hero a name,
and turn animation on or off. The rest of the crew rotates through the other
appearances.

## Commands

- `/haven` opens Patchhaven. `/board` is an alias.
- `/haven world`, `/haven focus`, `/haven journal` switch views.
- `/haven stats` (or `/haven recap`) shows this visit's progress.
- `/haven hero wizard|knight|ranger|smith` changes your hero.
- `/haven name <name>` names your hero.
- `/haven replay` plays the selected journal visit; `/haven live` returns to
  the current scene.
- `/haven motion` toggles animation; `/haven sound` toggles permission and
  turn-end chimes.
- `/haven plan` toggles whether Claude's step list appears in Patchhaven or
  under each message.
- `/haven help` lists the commands. Every command also works under `/board`.

## Development

With Claude Code 2.1.309 or later, run the plugin checks from the repository
root:

```bash
npx --yes @anthropic-ai/claude-code@2.1.309 plugin test
npx --yes @anthropic-ai/claude-code@2.1.309 plugin validate . --strict
```

The tests use the local plugin harness and do not need a signed-in Claude
session. In Claude Desktop, open a project, use `/haven`, start work that reads
and edits files, then try a delegated background task and watch its status in
the Crew panel.

## Art

The world, furniture, homestead and characters use original SVG and pixel-grid
art. The small chimes are synthesized bell tones.
