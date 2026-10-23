import { atom, read, update } from 'claude-code'
import type { Register, EngineInterface, RenderInput } from 'claude-code'

import type { Activity, Step, Touch } from '../types'
import { readChanges } from './git'
import { drawRooms, roomsOf } from './rooms'

const PANE = 'task-board'
// Whether the Workbench takes over the app's own task list under each message.
const OWN_PLAN_KEY = 'ownPlan'
let ownsPlan = true
const steps = atom({ plugin: 'task-board', key: 'steps' } as const, [])

const files = atom({ plugin: 'task-board', key: 'files' } as const, [])
// Loop ids seen this turn, in order: index 0 is Claude itself, the rest are subagents.
const agents = atom({ plugin: 'task-board', key: 'agents' } as const, [''])

const changes = atom({ plugin: 'task-board', key: 'changes' } as const, {})
const xp = atom({ plugin: 'task-board', key: 'xp' } as const, 0)
const drops = atom({ plugin: 'task-board', key: 'drops' } as const, {})
// The level just reached and when, for the banner in the Quest Hall.
const levelUp = atom({ plugin: 'task-board', key: 'levelUp' } as const, null)
const spawns = atom({ plugin: 'task-board', key: 'spawns' } as const, {})
const bank = atom({ plugin: 'task-board', key: 'bank' } as const, null)
const splats = atom({ plugin: 'task-board', key: 'splats' } as const, {})
const departs = atom({ plugin: 'task-board', key: 'departs' } as const, {})
const compactAt = atom({ plugin: 'task-board', key: 'compactAt' } as const, null)
const asking = atom({ plugin: 'task-board', key: 'asking' } as const, {})
const jobs = atom({ plugin: 'task-board', key: 'jobs' } as const, {})
const turnStart = atom({ plugin: 'task-board', key: 'turnStart' } as const, 0)
const failure = atom({ plugin: 'task-board', key: 'failure' } as const, null)
const stoppedAt = atom({ plugin: 'task-board', key: 'stoppedAt' } as const, null)
// What a failed turn's error means, said plainly.
const FAILURES: Record<string, string> = {
  rate_limit: 'usage limit reached',
  overloaded: 'the server is overloaded',
  server_error: 'the server had an error',
  billing_error: 'a billing problem',
  authentication_failed: 'signed out',
  max_output_tokens: 'the reply ran too long',
}
// Chimes when Claude needs you and when a turn ends: off until /board sound.
const SOUND_KEY = 'sound'
let isSoundOn = false
// Shell commands that run a test suite.
const TESTS = /(^|[;&|]\s*)(\S*gradlew?\S*\s[^;&|]*\btest|npm (run )?test|pnpm test|yarn test|npx (vitest|jest)|pytest|python -m pytest|cargo test|go test|mvn\S* test|dotnet test|\S*claude\S* plugin test)\b/
const WEB = new Set(['WebSearch', 'WebFetch'])
// Shell commands that apply a batch of changes at once.
const APPLY = /(^|[;&|]\s*)(git\s+(apply|am|cherry-pick)|patch\s)/
const stats = atom({ plugin: 'task-board', key: 'stats' } as const, { edits: 0, files: [], quests: 0, xp: 0 })
// A shell command that commits, outside a quoted string or a pipe's later part.
const COMMIT = /(^|[;&|]\s*)git\s+(?:-\S+\s+)*commit\b/
const XP_KEY = 'xp'
const activity = atom({ plugin: 'task-board', key: 'activity' } as const, {})
const isTurn = atom({ plugin: 'task-board', key: 'isTurn' } as const, false)
const pulse = atom({ plugin: 'task-board', key: 'pulse' } as const, 0)

// Where each agent stood at the last drawing, so a move can be walked.
let lastSpots: Record<string, { x: number; y: number }> = {}
// Agents already toasted as stuck, by agent and kind, until they act again.
const warned = new Set<string>()
// Set by a new prompt: the last turn's scene stays up until this turn first touches a file.
let isFresh = false

const EDITORS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
// Who each character is, in the cast's order (Claude, then subagents in turn).
const CREW = [
  { glyph: '🧙', name: 'Claude' },
  { glyph: '🛡', name: 'Knight' },
  { glyph: '🏹', name: 'Ranger' },
  { glyph: '⚒', name: 'Smith' },
] as const
const AGENT_COLORS = ['#D97757', '#22d3ee', '#e879f9', '#4ade80', '#facc15', '#60a5fa']
const QUEST_COLORS = { pending: '#ff4d4d', in_progress: '#ffd84d', completed: '#4dd24d' } as const
// The scene is drawn at least this much bigger than its own units, more when it is narrow.
const SCALE = 1.5

// The XP an edit earns: a little for touching a file, more per line written.
function xpFor(input: Record<string, unknown>): number {
  const edits = Array.isArray(input.edits) ? input.edits.map(x => (x as Record<string, unknown>).new_string) : []
  const text = [input.new_string, input.content, input.new_source, ...edits].filter(t => typeof t === 'string').join('\n')
  const lines = text ? text.split('\n').length : 0

  return Math.min(400, 10 + lines * 4)
}

// Lines an edit writes and replaces: an Edit's new and old text, each of a
// MultiEdit's, a Write's whole content, a notebook cell's new source.
function linesOf(input: Record<string, unknown>): { add: number; del: number } {
  const count = (t: unknown) => (typeof t === 'string' && t ? t.split('\n').length : 0)
  const edits = Array.isArray(input.edits) ? (input.edits as Record<string, unknown>[]) : [input]

  return {
    add: edits.reduce((n, x) => n + count(x.new_string ?? x.content ?? x.new_source), 0),
    del: edits.reduce((n, x) => n + count(x.old_string), 0),
  }
}

// The highest XP any copy of this mod has saved on this machine: a copy
// installed from GitHub and one run from a folder keep separate stores, and
// the Coding level should follow you between them. Nothing found is 0.
async function xpElsewhere($: EngineInterface): Promise<number> {
  try {
    const home = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${(await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? ''}/.claude`
    const dir = `${posix(home)}/plugins/store`
    const stores = (await $.fs.list(dir)).filter(f => f.kind === 'file' && f.name.startsWith('task-board_') && f.name.endsWith('.json'))
    let best = 0
    for (const f of stores) {
      const saved = JSON.parse(String(await $.fs.read(`${dir}/${f.name}`))) as { xp?: unknown }
      best = Math.max(best, Number(saved.xp) || 0)
    }

    return best
  } catch {
    return 0
  }
}

// The level for an amount of XP, on the classic curve: level 2 at 83 XP,
// 99 at about 13 million.
function levelOf(total: number): { level: number; from: number; to: number } {
  let points = 0
  let from = 0
  for (let level = 1; level < 99; level++) {
    points += Math.floor(level + 300 * 2 ** (level / 7))
    const to = Math.floor(points / 4)
    if (total < to) return { level, from, to }
    from = to
  }

  return { level: 99, from, to: from }
}

const posix = (path: string) => path.replace(/\\/g, '/')

// Moves the in-progress step to done and starts the next pending one,
// the way the app's own task list treats `advance`.
function advance(list: Step[]): Step[] {
  const next = list.map(s => (s.status === 'in_progress' ? { ...s, status: 'completed' as const } : s))
  const i = next.findIndex(s => s.status === 'pending')
  const step = next[i]
  if (step) next[i] = { ...step, status: 'in_progress' }

  return next
}

// Account for an accepted plan before returning an owned update to the app.
// Compare the actual steps: their order and the plan's length can change.
async function showPlan($: EngineInterface, plan: Step[]) {
  const before = await read($, steps)
  const wasComplete = before.length > 0 && before.every(s => s.status === 'completed')
  const alreadyDone = new Set(before.filter(s => s.status === 'completed').map(s => s.text))
  const done = plan.filter(s => s.status === 'completed')
  const newlyDone = done.filter(s => !alreadyDone.has(s.text))
  await update($, steps, () => plan)

  if (plan.length > 0 && done.length === plan.length) {
    if (!wasComplete) {
      await update($, stats, s => ({ ...s, quests: s.quests + 1 }))
      $.ui.toast(`Congratulations, quest complete! (${plan.length} step${plan.length === 1 ? '' : 's'})`)
    }
  } else if (newlyDone.length > 0) {
    $.ui.toast(`Quest step complete: ${newlyDone[newlyDone.length - 1]!.text}`)
  }
}

// Re-reads git a moment after the last change, so a burst of edits costs one scan.
let scan: { cancel(): void } | undefined
function rescan($: EngineInterface) {
  scan?.cancel()
  scan = $.clock.after(700, async () => {
    const next = await readChanges($, posix(await $.session.cwd()))
    await update($, changes, () => next)
  })
}

// The agent index of a tool call's loop (0 is Claude), adding a subagent the
// first time it acts, with a teleport puff.
async function agentOf($: EngineInterface, loopId: string): Promise<number> {
  const isNewAgent = !(await read($, agents)).includes(loopId)
  const seen = await update($, agents, l => (l.includes(loopId) ? l : [...l, loopId]))
  const agent = seen.indexOf(loopId)
  if (isNewAgent && agent > 0) await update($, spawns, s => ({ ...s, [agent]: Date.now() }))

  return agent
}

// A chime from the mod's own assets, when sounds are on; a missing speaker
// or a refused clip never gets in the way.
function chime($: EngineInterface, name: 'ask' | 'done') {
  if (isSoundOn) void $.audio.play({ asset: `assets/${name}.wav` }).catch(() => undefined)
}

// The agent asked for permission has its answer once its tool goes on.
async function answered($: EngineInterface, loopId: string) {
  const agent = (await read($, agents)).indexOf(loopId)
  if (agent >= 0 && (await read($, asking))[agent] !== undefined) {
    await update($, asking, a => {
      const { [agent]: _, ...rest } = a
      return rest
    })
  }
}

// A failed tool hits its character: a red splat with a damage number made
// from the error, as steady for the same error as a game's hits are not.
async function hit($: EngineInterface, agent: number, text: string) {
  const damage = 1 + ([...text].reduce((n, ch) => n + ch.charCodeAt(0), 0) % 29)
  await update($, splats, s => ({ ...s, [agent]: { kind: 'hit', damage, at: Date.now() } }))
}

// Marks a file worked on by the loop that ran the tool, until `next` returns.
async function track<T>($: EngineInterface, tool: string, path: string, loopId: string, kind: Touch['kind'], isNew: boolean, run: () => Promise<T>): Promise<T> {
  if (isFresh) {
    isFresh = false
    await update($, files, () => [])
    await update($, agents, () => [''])
    await update($, activity, () => ({}))
  }
  const agent = await agentOf($, loopId)
  if ((await read($, files)).length === 0) void $.ui.open({ id: PANE, title: 'Workbench' })
  await update($, files, l => {
    const was = l.find(f => f.path === path)
    const rest = l.filter(f => f.path !== path)
    // A read never demotes a file that was edited this turn.
    const now: Touch =
      kind === 'read' && was?.kind === 'edit'
        ? { ...was, isActive: true }
        : { path, agent, isActive: true, edits: (was?.edits ?? 0) + (kind === 'edit' ? 1 : 0), kind, isNew: isNew || was?.isNew }

    return [now, ...rest].slice(0, 40)
  })
  const isEdit = kind === 'edit'
  const isApply = tool === 'MultiEdit'
  await update($, activity, a => ({ ...a, [agent]: { tool, file: path, at: Date.now(), isActive: true, isEdit, isNew, isApply } }))
  warned.delete(`${agent}:idle`)
  warned.delete(`${agent}:waiting`)
  try {
    return await run()
  } finally {
    await update($, files, l => l.map(f => (f.path === path ? { ...f, isActive: false } : f)))
    await update($, activity, a => ({ ...a, [agent]: { tool, file: path, at: Date.now(), isActive: false, isEdit, isNew, isApply } }))
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    ownsPlan = (await $.store.get(OWN_PLAN_KEY)) !== false
    isSoundOn = (await $.store.get(SOUND_KEY)) === true
    const earned = Math.max(Number((await $.store.get(XP_KEY)) ?? 0), await xpElsewhere($))
    await update($, xp, () => earned)
    await $.store.set(XP_KEY, earned).catch(() => undefined)
    // Every few seconds of a turn: redraw so idle agents show, and toast once
    // for an agent waiting on you or idle for two minutes.
    $.clock.every(5000, async () => {
      if (!(await read($, isTurn))) return
      const now = Date.now()
      for (const [agent, act] of Object.entries(await read($, activity))) {
        const who = agent === '0' ? 'Claude' : `Agent ${agent}`
        const name = act.file.slice(act.file.lastIndexOf('/') + 1)
        if (!act.isActive && now - act.at > 120_000 && !warned.has(`${agent}:idle`)) {
          warned.add(`${agent}:idle`)
          $.ui.toast(`${who} has been idle for 2 minutes${name ? ` (last on ${name})` : ''}`)
        }
      }
      await update($, pulse, n => n + 1)
    })
    rescan($)
    await $.command.register({ name: 'board', description: 'Open the Workbench. /board help lists its commands and settings' })
    return next(e)
  })

  on('command.run', { command: 'board' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'help' || arg === '?') {
      return { text: '/board — open the Workbench.\n/board stats (or recap) — show this session’s progress.\n/board sound — toggle chimes for approvals and completed turns.\n/board plan — toggle whether steps also appear under messages.\n/board help — show these commands.' }
    }
    if (arg === 'stats' || arg === 'recap') {
      const session = await read($, stats)
      const banked = await read($, bank)
      const totalXp = await read($, xp)
      const { level } = levelOf(totalXp)

      return {
        text: [
          'Workbench session stats',
          `Coding ${level} · ${totalXp.toLocaleString()} total XP · +${(session.xp ?? 0).toLocaleString()} this session`,
          `${session.edits} edits · ${session.files.length} files · ${session.quests} quests complete`,
          `${(session.add ?? 0).toLocaleString()} lines added · ${(session.del ?? 0).toLocaleString()} removed · ${banked?.total ?? 0} files banked`,
        ].join('\n'),
      }
    }
    if (arg === 'sound') {
      isSoundOn = !isSoundOn
      await $.store.set(SOUND_KEY, isSoundOn)
      chime($, 'done')

      return { text: isSoundOn ? 'Workbench chimes on: when Claude needs you, and when a turn ends.' : 'Workbench chimes off.' }
    }
    if (arg === 'plan') {
      ownsPlan = !ownsPlan
      await $.store.set(OWN_PLAN_KEY, ownsPlan)

      return { text: ownsPlan ? "Claude's steps show in the Workbench only." : "Claude's steps show under each message again." }
    }
    await $.ui.open({ id: PANE, title: 'Workbench' })

    return { text: 'Workbench opened.' }
  })

  on('tool.call', async ($, e, next) => {
    // A tool call carries its input fields on the event itself.
    const input = e as unknown as Record<string, unknown>

    const isPlan = e.tool.endsWith('update_plan')
    const isTodo = e.tool === 'TodoWrite'
    const isWrap = e.tool.endsWith('wrap_up')
    if (isPlan || isTodo || isWrap) {
      // Owned plans are answered here; other tools must succeed before their
      // requested changes become visible or earn a completed quest.
      const ran = isPlan && ownsPlan ? undefined : await next(e)
      await answered($, e.agentId ?? '')
      if (ran?.deny || ran?.isError) {
        if (ran.isError && !ran.deny) await hit($, await agentOf($, e.agentId ?? ''), String(ran.text ?? e.tool))
        return ran
      }
      if (isPlan || isTodo) {
        const agent = await agentOf($, e.agentId ?? '')
        await update($, activity, a => ({ ...a, [agent]: { tool: 'quests', file: '#hall', at: Date.now(), isActive: false, isEdit: false, mode: 'quests' } }))
      }
      let plan = await read($, steps)
      const items = isTodo ? input.todos : input.items
      if ((isTodo || isPlan) && Array.isArray(items)) {
        plan = (items as { content: string; status: Step['status'] }[]).map(t => ({ text: t.content, status: t.status }))
      } else if (isPlan && input.advance) {
        plan = advance(plan)
      } else if (isWrap) {
        plan = plan.map(s => ({ ...s, status: 'completed' as const }))
      }
      await showPlan($, plan)
      if (ran) return ran

      return { result: `Plan shown in the Workbench (${plan.length} steps).` } as never
    }

    const path = posix(String(input.file_path ?? input.notebook_path ?? ''))
    const kind = EDITORS.has(e.tool) ? 'edit' : e.tool === 'Read' ? 'read' : null
    if (!path || !kind) {
      const command = String(input.command ?? '')
      const isShell = e.tool === 'Bash' || e.tool === 'PowerShell'
      const isOutside = e.tool.startsWith('mcp__') && !e.tool.startsWith('mcp__ccd_')
      const isSearch = e.tool === 'Grep' || e.tool === 'Glob'
      const mode = WEB.has(e.tool)
        ? 'web'
        : isShell && TESTS.test(command)
          ? 'test'
          : isShell && APPLY.test(command)
            ? 'apply'
            : isShell || isSearch || isOutside
              ? 'shell'
              : undefined
      // What the Terminal's bubble says: the command's first words, the
      // search's pattern, or the outside tool's own name.
      const label = isShell
        ? `$ ${command.trim().split(/\s+/).slice(0, 2).join(' ')}`
        : isSearch
          ? `⌕ ${String(input.pattern ?? '')}`
          : isOutside
            ? `⚙ ${e.tool.split('__').pop()}`
            : mode ?? ''
      // Tests, web searches and applied patches happen where the agent already
      // is: a training dummy, a map scroll or a rune circle at its desk (or in
      // the Quest Hall if it has no desk yet).
      const agent = mode ? await agentOf($, e.agentId ?? '') : -1
      // Commands, searches and outside tools are worked in the Terminal room.
      const at = mode === 'shell' ? '#terminal' : mode ? ((await read($, activity))[agent]?.file ?? '#hall') : '#hall'
      if (mode) {
        await update($, activity, a => ({ ...a, [agent]: { tool: label, file: at, at: Date.now(), isActive: true, isEdit: false, mode } }))
      }
      const ran = await next(e)
      await answered($, e.agentId ?? '')
      if (mode) {
        await update($, activity, a => ({ ...a, [agent]: { tool: label, file: at, at: Date.now(), isActive: false, isEdit: false, mode } }))
      }
      if (mode === 'test' && !ran.deny) {
        const failed = ran.isError || /\b(FAIL(ED|URE)?|[1-9]\d* fail(ed|ing|ures?)?)\b/.test(String(ran.text ?? ''))
        await update($, splats, s => ({ ...s, [agent]: { kind: failed ? 'fail' : 'pass', damage: 0, at: Date.now() } }))
      } else if (ran.isError && !ran.deny) {
        await hit($, await agentOf($, e.agentId ?? ''), String(ran.text ?? e.tool))
      }
      // A shell command may commit, stash or check out: git state can move.
      if (e.tool === 'Bash' || e.tool === 'PowerShell') {
        rescan($)
        // A commit banks its files: coins fly from the desks into the Quest Hall's chest.
        if (COMMIT.test(String(input.command ?? '')) && !ran.deny && !ran.isError) {
          const said = /(\d+) files? changed/.exec(String(ran.text ?? ''))
          const count = said ? Number(said[1]) : 1
          await update($, bank, b => ({ files: count, at: Date.now(), total: (b?.total ?? 0) + count }))
          $.ui.toast(`+${count} file${count === 1 ? '' : 's'} banked`)
        }
      }

      return ran
    }

    // Creating: a Write to a file that is not there yet.
    const isNew = e.tool === 'Write' && !(await $.fs.exists(path).catch(() => true))
    const ran = await track($, e.tool, path, e.agentId ?? '', kind, isNew, () => next(e))
    await answered($, e.agentId ?? '')
    if (ran.isError && !ran.deny) await hit($, await agentOf($, e.agentId ?? ''), String(ran.text ?? e.tool))
    if (kind === 'edit') {
      rescan($)
      if (!ran.deny && !ran.isError) {
        const key = path.toLowerCase()
        const lines = linesOf(input)
        await update($, files, l => l.map(f => (f.path === path ? { ...f, add: (f.add ?? 0) + lines.add, del: (f.del ?? 0) + lines.del } : f)))
        const gained = xpFor(input)
        await update($, stats, s => ({
          ...s,
          edits: s.edits + 1,
          files: s.files.includes(key) ? s.files : [...s.files, key].slice(-500),
          xp: (s.xp ?? 0) + gained,
          add: (s.add ?? 0) + lines.add,
          del: (s.del ?? 0) + lines.del,
        }))
        const before = levelOf(await read($, xp)).level
        const total = await update($, xp, n => n + gained)
        // A failed save must not interrupt the successful edit's XP feedback.
        await $.store.set(XP_KEY, total).catch(() => undefined)
        await update($, drops, d => ({ ...d, [path]: { xp: gained, at: Date.now() } }))
        const after = levelOf(total).level
        if (after > before) {
          $.ui.toast(`Congratulations, your Coding level is now ${after}!`)
          await update($, levelUp, () => ({ level: after, at: Date.now() }))
        }
      }
    }

    return ran
  })

  // A new prompt starts a fresh workbench once it first touches a file; until then the last scene stays.
  on('prompt.submit', async ($, e, next) => {
    isFresh = true
    await update($, isTurn, () => true)
    await update($, turnStart, () => Date.now())
    await update($, failure, () => null)
    await update($, stoppedAt, () => null)
    await update($, asking, () => ({}))
    warned.clear()
    rescan($)

    return next(e)
  })

  // Asked for permission: its character bounces under a ? until the tool goes on.
  on('classic.PermissionRequest', async ($, e, next) => {
    try {
      const agent = await agentOf($, e.agent_id ?? '')
      await update($, asking, a => ({ ...a, [agent]: Date.now() }))
      const who = agent === 0 ? 'Claude' : `Agent ${agent}`
      $.ui.toast(`${who} needs you: approve ${e.tool_name}`)
      chime($, 'ask')
    } catch {
      // The prompt still reaches you; only the scene misses it.
    }

    return next(e)
  })

  // A subagent's job, so the header can say what each one was sent to do.
  on('agent.spawn', async ($, e, next) => {
    const spawned = await next(e)
    if (!spawned.deny && spawned.agentId) {
      const job = `${e.subagentType}: ${e.description}`
      await update($, jobs, j => ({ ...j, [spawned.agentId!]: job })).catch(() => undefined)
    }

    return spawned
  })

  // A turn that died on an error: out of run energy for the usage limit,
  // a grey banner for the rest, until the next prompt.
  on('classic.StopFailure', async ($, e, next) => {
    try {
      await update($, failure, () => ({ error: e.error, at: Date.now() }))
      $.ui.toast(e.error === 'rate_limit' ? 'Out of run energy: usage limit reached' : `The turn stopped: ${FAILURES[e.error] ?? e.error}`)
    } catch {
      // Only the scene misses it.
    }

    return next(e)
  })

  // A tool you refused: a ✋ splat on the character that asked.
  on('classic.PermissionDenied', async ($, e, next) => {
    try {
      const agent = await agentOf($, e.agent_id ?? '')
      await update($, splats, s => ({ ...s, [agent]: { kind: 'denied', damage: 0, at: Date.now() } }))
      await update($, asking, a => {
        const { [agent]: _, ...rest } = a
        return rest
      })
    } catch {
      // Only the scene misses it.
    }

    return next(e)
  })

  // A subagent that finishes teleports out of the room it worked in.
  on('classic.SubagentStop', async ($, e, next) => {
    try {
      const agent = (await read($, agents)).indexOf(e.agent_id)
      if (agent > 0) await update($, departs, d => ({ ...d, [agent]: Date.now() }))
    } catch {
      // A missed departure only costs the animation, never the subagent's stop.
    }

    return next(e)
  })

  // Compacting packs old context away: a deposit-all puff at the chest.
  on('session.compact', async ($, e, next) => {
    await update($, compactAt, () => Date.now())

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    await update($, isTurn, () => false)
    await update($, asking, () => ({}))
    if (e.reason === 'aborted') await update($, stoppedAt, () => Date.now())
    chime($, 'done')

    return next(e)
  })

  // A drawing that throws shows its error in the pane instead of a blank one.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    try {
      return await drawPane($, e)
    } catch (err) {
      const { Text } = $.ui.resolve(e)

      return <Text color="#f14c4c">Workbench could not draw: {String(err instanceof Error ? err.stack ?? err.message : err)}</Text>
    }
  })
}

// The Workbench pane: one card (Coding level, session, where each agent is),
// then the scene, whose Quest Hall holds the quest board. A terminal, which
// draws no SVG, gets the card and the quests as text.
async function drawPane($: EngineInterface, e: RenderInput<'Pane'>) {
  const ui = $.ui.resolve(e)
  const { Box, Text } = ui
  await read($, pulse)
  const plan = await read($, steps)
  const touched = await read($, files)
  const git = await read($, changes)
  const total = await read($, xp)
  const acts = await read($, activity)
  const turn = await read($, isTurn)
  const gone = await read($, departs)
  const root = posix(await $.session.cwd()).toLowerCase()
  const { level, from, to } = levelOf(total)
  const session = await read($, stats)
  const banked = await read($, bank)
  const bar = 12
  const filled = to > from ? Math.round(((total - from) / (to - from)) * bar) : bar
  const done = plan.filter(s => s.status === 'completed').length
  const failed = await read($, failure)
  const loops = await read($, agents)
  const tasks = await read($, jobs)
  const startedAt = await read($, turnStart)
  const elapsed = turn && startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0
  const clock = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`

  // Where an agent is: its room's folder trail and file, or the Quest Hall
  // or the Inn, as the scene draws it.
  const whereOf = (agent: string, act: Activity): string => {
    if (agent === '0' && !turn) return 'Inn · waiting for you'
    if (act.file === '#hall') return act.mode === 'quests' ? 'Quest Hall · reading the quests' : 'Quest Hall'
    if (act.file === '#terminal') return `Terminal · ${act.tool}`
    const path = act.file.toLowerCase().startsWith(`${root}/`) ? act.file.slice(root.length + 1) : act.file
    const parts = path.split('/')
    const file = parts.pop() ?? path

    return [...(parts.length > 2 ? ['…'] : []), ...parts.slice(-2), file].join(' › ')
  }
  const crew = Object.entries(acts)
    .filter(([agent, act]) => !(gone[agent] !== undefined && act.at <= gone[agent]!) && (agent === '0' || turn))
    .slice(0, 4)
  if (!crew.some(([agent]) => agent === '0')) crew.unshift(['0', { tool: '', file: '#hall', at: 0, isActive: false, isEdit: false }])

  // One card in the scene's own palette: dark wood, a bronze rim, and the
  // yellow of a game's interface text.
  const header = (
    <Box borderStyle="round" borderColor="#6b5530" backgroundColor="#221b13" paddingX={1} flexDirection="column">
      <Box justifyContent="space-between">
        <Text>
          <Text weight="semibold" color="#ffcc33">⚒ Coding {level} </Text>
          <Text color="#ffcc33">{'▰'.repeat(filled)}</Text>
          <Text color="#5a4a2e">{'▱'.repeat(bar - filled)}</Text>
        </Text>
        <Text color="#b8a27a" tabular size="caption">
          {turn ? `⏱ ${clock} · ` : ''}
          {total.toLocaleString()} xp
        </Text>
      </Box>
      <Text color="#8a7a5a" size="caption">
        {level < 99 ? `${(to - total).toLocaleString()} to ${level + 1}` : 'max level'} · {session.edits} edit{session.edits === 1 ? '' : 's'} · {session.files.length} file{session.files.length === 1 ? '' : 's'} · {session.quests} quest{session.quests === 1 ? '' : 's'}
        {banked ? ` · ${banked.total} banked` : ''}
        {session.add ? <Text color="#73c991">{`  +${session.add.toLocaleString()}`}</Text> : null}
        {session.del ? <Text color="#f14c4c">{` −${session.del.toLocaleString()}`}</Text> : null}
      </Text>
      {failed && (
        <Text color={failed.error === 'rate_limit' ? '#ff5b5b' : '#c8c8ce'} weight="semibold">
          {failed.error === 'rate_limit' ? '⚡ Out of run energy · usage limit reached' : `⚠ Stopped · ${FAILURES[failed.error] ?? failed.error}`}
        </Text>
      )}
      {crew.map(([agent, act]) => {
        const index = agent === '0' ? 0 : 1 + ((Number(agent) - 1) % (CREW.length - 1))
        const who = CREW[index]!
        const job = agent === '0' ? '' : tasks[loops[Number(agent)] ?? '']

        return (
          <Box key={`who${agent}`}>
            <Text color={AGENT_COLORS[Number(agent) % AGENT_COLORS.length]} weight="medium">
              {who.glyph} {who.name}
            </Text>
            {job ? (
              <Text color="#8a7a5a" size="caption" wrap="truncate-end">
                {' · '}
                {job}
              </Text>
            ) : null}
            <Text color="#b8a27a" mono size="caption" wrap="truncate-start">
              {'  '}
              {whereOf(agent, act)}
            </Text>
          </Box>
        )
      })}
    </Box>
  )

  // The terminal has no real Svg: its table stands one in that draws only the alt text.
  const Svg = e.surface !== 'terminal' && 'Svg' in ui ? ui.Svg : undefined
  if (!Svg) {
    return (
      <Box flexDirection="column" gap={1}>
        {header}
        {plan.length > 0 && (
          <Box flexDirection="column">
            <Text weight="semibold" color="#ffcc33">
              {done === plan.length ? `✓ Quest complete! (${plan.length} steps)` : `Quests ${done}/${plan.length}`}
            </Text>
            {done < plan.length &&
              plan.map(s => (
                <Text color={QUEST_COLORS[s.status]} strikethrough={s.status === 'completed'}>
                  {s.status === 'completed' ? '●' : s.status === 'in_progress' ? '◐' : '○'} {s.text}
                </Text>
              ))}
          </Box>
        )}
      </Box>
    )
  }

  const width = Math.max(300, Math.min(560, (e.props.bodyColumns ?? 40) * 8))
  const drawn = drawRooms({
    rooms: roomsOf(touched, git),
    activity: acts,
    from: lastSpots,
    now: Date.now(),
    isTurn: turn,
    width: Math.round(width / SCALE),
    paneWidth: width,
    steps: plan,
    levelUp: (await read($, levelUp)) ?? undefined,
    drops: await read($, drops),
    spawns: await read($, spawns),
    splats: await read($, splats),
    departs: gone,
    compactAt: (await read($, compactAt)) ?? undefined,
    asking: await read($, asking),
    failure: failed ?? undefined,
    stoppedAt: (await read($, stoppedAt)) ?? undefined,
    bank: banked ?? undefined,
  })
  lastSpots = drawn.spots

  return (
    <Box flexDirection="column" gap={1}>
      {header}
      {/* Drawn as an image, not interactive: an interactive Svg is a frame
          the app rebuilds on every redraw, which flashed white. Its SMIL
          animations run the same either way. Scaled to the pane's width: the
          narrower the scene came out, the closer the zoom. */}
      <Svg key="scene" source={drawn.svg} width={width} height={Math.round((drawn.height * width) / drawn.width)} alt="Workbench: rooms and agents at work" />
    </Box>
  )
}
