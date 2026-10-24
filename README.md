# Patchhaven

Patchhaven turns a Claude Code session into a living pixel-art work map. Claude
and the agent crew move between stations based on real file activity. Skills
and landmarks track the work you do together, with a compact OSRS-inspired feel
and a world shaped by your project.

![Patchhaven preview: the HUD with XP drops, skill orbs and haul above Claude striking a bug in src while the crew tests, waits for approval and writes](assets/patch-trail-preview.svg)

Open Patchhaven with `/haven`. `/board` remains an alias.

## Install or update

For a fresh install from a terminal:

```bash
npx --yes @anthropic-ai/claude-code@2.1.309 plugin install task-board --marketplace xRampageous/patchhaven --scope user
```

To test the current Patchhaven v2 branch before it reaches the default branch:

```powershell
cd "C:\path\to\your\project"
npx --yes @anthropic-ai/claude-code@2.1.309 plugin install task-board --marketplace xRampageous/patchhaven#feat/patchhaven-v2 --scope project
```

After a new commit is pushed to that branch, update the project install:

```powershell
npx --yes @anthropic-ai/claude-code@2.1.309 plugin update task-board@claude-quest-hall --scope project
```

Then run `/reload-plugins` and reopen the pane with `/haven`.

The marketplace keeps the `claude-quest-hall` ID for existing installs. In
Claude Desktop, click **+** beside the prompt box, choose **Plugins**, add the
marketplace `xRampageous/patchhaven`, then install `task-board`.

The repository currently has no software license. Public visibility alone does
not grant permission to reuse or redistribute the code.

If you already installed the old Quest Hall plugin, update that same install:

```bash
npx --yes @anthropic-ai/claude-code@2.1.309 plugin update task-board@claude-quest-hall --scope user
```

The old marketplace name and `task-board` plugin ID stay in place so existing
installs can update through GitHub's repository redirect. The public project
and in-app name are Patchhaven. Coding XP carries over. The new skill ledger
starts earning XP from activity after this version is installed.

## The living map

The **HUD** is a pixel panel above the map: your hero's Agent Quest portrait,
name, title and settlement; a Coding bar with its level and the XP still to
earn; four skill orbs whose rings fill toward the next level; and the visit's
**haul**, inventory slots counting edits, files, passed checks, quests, banked
files, crew and any bugs still loose. Each XP gain floats up beside the bar
with its skill's icon, and the skill that earned it glows. Every number comes
from recorded work; nothing is estimated.

The **Patch Trail** below shows the current place as a stage: a caption band
names the place, the file or task and what is happening, and the current worker
stands on the floor at a small work prop. Nearby stations follow in order of
attention. Each station has its own Agent Quest room: the Patchboard is the
guild hall, the Crew Lodge a round hall, camp an open field with a campfire,
the Terminal a glitch pit, the Forge a sky forge, tests the catacombs and docs
an athenaeum. Project folders draw from the remaining landscapes, so a folder
never borrows a station's room.

Characters react only to observed events:

| Signal | On the map |
| --- | --- |
| Edit, Write (new file), MultiEdit or a patch command | Strikes at a page, a glowing new page, or a rune circle |
| Read | Faces an open book |
| Grep, Glob, LSP | Sweeps a lens across a book, in the Terminal |
| A test command | Strikes a training dummy; a pass or fail splat lands |
| Shell command | Works a console with a blinking prompt, in the Terminal |
| Web search or fetch, browser tools | Turns a globe |
| Other tools, skills and MCP tools | Turns a gear, in the Terminal |
| Task, Agent, SendMessage | Sends a sealed order from the Crew Lodge |
| A plan update | Faces the work-order board |
| The model thinking, or writing its reply | Thought dots, or a scroll being written, between tools |
| A permission prompt or question for you | Faces you under a bouncing `?` |
| A failed tool | A damage splat and a brief flinch |
| A failing check | A bug appears where the check ran, one pip per failing test reported |
| A later passing check | The bug is squashed |
| A subagent starting or finishing | It teleports in or fades out |

Thinking and replying come from the model's streamed response, for Claude and
each subagent. Background agents keep their last place and show what the model
is doing between their tool calls. Walking plays all nine directional Agent
Quest frames, facing the way the worker moves, and a worker who changes rooms
walks into the new scene. Hands-on work plays the nine-frame attack strip with
a short rest between strokes. The **Motion** setting stops every animation:
the map, the HUD and each roster portrait.

**Trail**, **Focus** and **Log** move between the project, a selected worker's
activity and the visit journal. The **Crew** panel stays collapsed while agents
work, with a count of active and tracked agents. Open it to see a compact
roster of every known task with each worker's animated portrait, state,
location, last activity and task. The layout adjusts to narrow panes, and
**comfortable** and **large** zoom the HUD and the complete map. In a terminal,
which has no pictures, Patchhaven lists who is where and doing what, any bugs
loose, the crew and the quests as text.

## Three stages of progress

Real work earns persistent skill XP for **Crafting** (edits), **Research**
(distinct file reads and web research), **Verification** (successful checks) and
**Teamwork** (completed plans, commits and crew). Skills use the classic OSRS
level curve. Repeating the same activity earns less XP, and each skill has a
per-visit cap. Earned levels unlock wearable titles and relics shown on your
hero and in the Skills ledger.

Plans follow a readable quest lifecycle: active steps can complete, be replaced,
cancelled or pause when work is blocked. The Log records those outcomes beside
file activity, checks, commits, crew and XP. At the end of a visit, Patchhaven
keeps a short field report with touched files, successful and failed checks,
completed quests, crew activity, XP and newly earned landmarks. It stores
activity metadata, not prompts, tool arguments or source text. Detailed visit
history is bounded; earned progress remains.

The **More** view includes scale modes, motion and chime settings, diagnostics,
and token-free sample scenes for edits, crew activity, approvals, failures and
completed visits. A sample scene only changes what is displayed. Use **Return
live** to go back to your project.

Choose a wizard, knight, ranger or smith as your hero, give them a name and
equip any title you have earned. The rest of the crew rotates through the other
appearances.

## Commands

- `/haven` opens Patchhaven. `/board` is an alias.
- `/haven world`, `/haven focus`, `/haven journal`, `/haven skills` and
  `/haven settings` select a view.
- `/haven stats` (or `/haven recap`) shows this visit's progress.
- `/haven size auto|comfortable|large` sets map scale.
- `/haven demo idle|edit|crew|approval|failure|bug|complete` previews a sample scene;
  `/haven demo off` returns to live activity.
- `/haven hero wizard|knight|ranger|smith` changes your hero; `/haven name
  <name>` sets the name.
- `/haven title <earned title>` equips a reward; `/haven title` lists rewards.
- `/haven replay` plays the selected journal visit; `/haven live` returns to the
  current scene.
- `/haven motion` toggles animation; `/haven sound` toggles chimes.
- `/haven plan` toggles whether Claude's step list appears in Patchhaven or
  under each message.
- `/haven help` lists commands. Every command also works under `/board`.

## Development

With Claude Code 2.1.309 or later, run the plugin checks from the repository
root:

```bash
npx --yes tsx tools/render-preview.ts
npx --yes @anthropic-ai/claude-code@2.1.309 plugin test
npx --yes @anthropic-ai/claude-code@2.1.309 plugin validate . --strict
```

Pass a pane width, and optionally a zoom, to the preview renderer to inspect
other layouts, for example `npx --yes tsx tools/render-preview.ts 304` or
`npx --yes tsx tools/render-preview.ts 560 large`.

In Claude Desktop, open a project, use `/haven`, start work that reads and edits
files, then try a delegated background task. The **Crew** panel and the sample
scenes in **More** show how those activities appear on the map.

## Art

Agent Quest's MIT-licensed room backgrounds, first-tier character sprites and
two monster animations (the bugs) are bundled with their license notice in
`assets/agent-quest/`. Patchhaven's HUD, work props, icons, map, interface and
animations are original. The small chimes are synthesized bell tones.
