import { atom, read, update } from 'claude-code'
import type { Register, EngineInterface, RenderInput } from 'claude-code'

import type { Activity, CrewAgent, Step, Touch } from '../types'
import { readChanges } from './git'
import { drawRooms, roomsOf } from './rooms'
import { absoluteFile, eventText, HEROES, HERO_COLORS, LANDMARKS, relativeFile, replayFrame, settlementOf } from './haven'
import type { HavenView } from './haven'
import { advanceReplay, haven, initHaven, recordHaven, setProfile } from './haven-state'

const PANE = 'task-board'
// Whether the Workbench takes over the app's own task list under each message.
const OWN_PLAN_KEY = 'ownPlan'
let ownsPlan = true
const steps = atom({ plugin: 'task-board', key: 'steps' } as const, [])

const files = atom({ plugin: 'task-board', key: 'files' } as const, [])
// Loop ids seen this turn, in order: index 0 is Claude itself, the rest are subagents.
const agents = atom({ plugin: 'task-board', key: 'agents' } as const, [''])
const crewAgents = atom({ plugin: 'task-board', key: 'crewAgents' } as const, [] as CrewAgent[])
const crewExpanded = atom({ plugin: 'task-board', key: 'crewExpanded' } as const, false)

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
let lastSceneKey = ''
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
      try {
        const saved = JSON.parse(String(await $.fs.read(`${dir}/${f.name}`))) as { xp?: unknown }
        const amount = Number(saved.xp)
        if (Number.isFinite(amount) && amount >= 0) best = Math.max(best, amount)
      } catch { /* One damaged store must not hide the healthy copies. */ }
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
      await recordHaven($, { kind: 'quest', count: plan.length })
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
  if (isNewAgent && agent > 0) {
    await update($, spawns, s => ({ ...s, [agent]: Date.now() }))
    const hero = (await read($, haven))?.profile.hero ?? 'wizard'
    const cast = HEROES.filter(h => h !== hero)
    await recordHaven($, { kind: 'crew', role: cast[(agent - 1) % cast.length] })
  }

  return agent
}

// Keep a live roster even when a background agent has not called a tool yet,
// and after Claude's foreground turn has ended.
async function syncAgentRoster($: EngineInterface) {
  const engine = $ as EngineInterface & { agent?: { list?: () => Promise<unknown> } }
  const listAgents = engine.agent?.list
  if (typeof listAgents !== 'function') return
  let listed: unknown
  try { listed = await listAgents.call(engine.agent) } catch { return }
  if (!Array.isArray(listed)) return

  const before = await read($, crewAgents)
  const previous = new Map(before.map(a => [a.id, a.status]))
  const next: CrewAgent[] = []
  for (const value of listed) {
    if (!value || typeof value !== 'object') continue
    const info = value as Record<string, unknown>
    if (typeof info.id !== 'string' || !info.id) continue
    const id = info.id
    const index = await agentOf($, id)
    const rawStatus = String(info.status ?? '')
    const status: CrewAgent['status'] = rawStatus === 'completed' || rawStatus === 'failed' || rawStatus === 'killed' ? rawStatus : 'running'
    const name = typeof info.name === 'string' ? info.name : ''
    const type = typeof info.type === 'string' ? info.type : ''
    const description = typeof info.description === 'string' ? info.description : ''
    next.push({ id, index, name: name.slice(0, 60), type: type.slice(0, 60), description: description.slice(0, 180), status })
    const job = [type, description].filter(Boolean).join(': ').slice(0, 240)
    if (job) await update($, jobs, j => ({ ...j, [id]: job }))

    const key = String(index)
    const was = previous.get(id)
    if (status === 'running') {
      if (was !== 'running') {
        await update($, spawns, s => ({ ...s, [key]: Date.now() }))
        await update($, departs, d => { const { [key]: _, ...rest } = d; return rest })
      }
      await update($, activity, a => {
        const old = a[key]
        return {
          ...a,
          [key]: old?.isActive ? old : {
            tool: '', file: old?.file ?? '#hall', at: old?.at ?? Date.now(), isActive: false,
            isEdit: old?.isEdit ?? false, mode: 'background',
          },
        }
      })
    } else {
      if (was === 'running') await update($, departs, d => d[key] === undefined ? { ...d, [key]: Date.now() } : d)
      await update($, activity, a => a[key] ? { ...a, [key]: { ...a[key]!, isActive: false } } : a)
    }
  }
  // A session can retain completed agents indefinitely; keep all active work
  // and the most recent dozen finished entries in the visible roster.
  const running = next.filter(a => a.status === 'running')
  const finished = next.filter(a => a.status !== 'running').slice(-12)
  if (running.length && !before.some(a => a.status === 'running')) await update($, crewExpanded, () => true)
  await update($, crewAgents, () => [...running, ...finished])
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
    // Keep desks and crew identities across turns. Only the NEW designation
    // expires; a new prompt should not rearrange the whole workplace.
    await update($, files, l => l.map(f => ({ ...f, isActive: false, isNew: false })))
  }
  const agent = await agentOf($, loopId)
  if ((await read($, files)).length === 0) void $.ui.open({ id: PANE, title: 'Patchhaven' })
  await update($, files, l => {
    const was = l.find(f => f.path === path)
    const rest = l.filter(f => f.path !== path)
    // A read never demotes a file that was edited this turn.
    const now: Touch =
      kind === 'read' && was?.kind === 'edit'
        ? { ...was, isActive: true }
        : { path, agent, isActive: true, edits: (was?.edits ?? 0) + (kind === 'edit' ? 1 : 0), kind, isNew: isNew || was?.isNew }

    return was ? l.map(f => f.path === path ? now : f) : [...rest, now].slice(-40)
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

async function hydrate($: EngineInterface, fresh = false) {
  ownsPlan = (await $.store.get(OWN_PLAN_KEY).catch(() => undefined)) !== false
  isSoundOn = (await $.store.get(SOUND_KEY).catch(() => undefined)) === true
  const saved = Number(await $.store.get(XP_KEY).catch(() => 0))
  const earned = Math.max(Number.isFinite(saved) && saved >= 0 ? saved : 0, await xpElsewhere($))
  await update($, xp, () => earned)
  await $.store.set(XP_KEY, earned).catch(() => undefined)
  const state = await initHaven($, fresh)
  if (!(await read($, files)).length) {
    const places = state.run.places.length ? state.run.places : state.history[0]?.places ?? []
    const restored = places.slice(-12).map(file => absoluteFile(state.run.root, file)).filter((path): path is string => Boolean(path))
    await update($, files, () => restored.map(path => ({ path, agent: 0, isActive: false, edits: 0, kind: 'read' as const })))
  }
  if (fresh) { lastSpots = {}; warned.clear() }
}

async function runHavenCommand($: EngineInterface, args: string) {
  const [command = '', ...rest] = args.trim().split(/\s+/)
  const arg = command.toLowerCase()
  const state = await read($, haven)
  if (arg === 'help' || arg === '?') return { text: [
    'Patchhaven · a living world built from your coding sessions.',
    '/haven — open your settlement. /board is an alias.',
    '/haven world | focus | journal — choose a view.',
    '/haven stats (or recap) — this session’s progress.',
    '/haven hero wizard | knight | ranger | smith — choose your appearance.',
    '/haven name <name> — name your hero (24 characters).',
    '/haven replay — watch the selected journal visit; /haven live returns to work.',
    '/haven motion — toggle animation. /haven sound — toggle chimes.',
    '/haven plan — toggle the app’s step list. /haven help — these commands.',
    'Legacy commands: /board sound · /board plan · /board stats.',
  ].join('\n') }
  if (arg === 'stats' || arg === 'recap') {
    const session = await read($, stats)
    const banked = await read($, bank)
    const totalXp = await read($, xp)
    return { text: [
      'Patchhaven session stats',
      `Coding ${levelOf(totalXp).level} · ${totalXp.toLocaleString()} total XP · +${(session.xp ?? 0).toLocaleString()} this session`,
      `${session.edits} edits · ${session.files.length} files · ${session.quests} quests complete`,
      `${(session.add ?? 0).toLocaleString()} lines added · ${(session.del ?? 0).toLocaleString()} removed · ${banked?.total ?? 0} files banked`,
      state ? `${state.run.name} · ${settlementOf(state.landmarks).stage} · ${state.landmarks.length}/${LANDMARKS.length} landmarks` : '',
    ].filter(Boolean).join('\n') }
  }
  if (['world', 'focus', 'journal', 'history'].includes(arg)) {
    await setProfile($, { view: arg === 'history' ? 'journal' : arg as HavenView })
  } else if (arg === 'hero') {
    const hero = rest[0]?.toLowerCase()
    if (!HEROES.includes(hero as typeof HEROES[number])) return { text: `Hero: ${state?.profile.hero ?? 'wizard'}. Choose wizard, knight, ranger or smith: /haven hero ranger` }
    await setProfile($, { hero: hero as typeof HEROES[number] })
    return { text: `Your Patchhaven hero is now a ${hero}.` }
  } else if (arg === 'name') {
    if (!rest.length) return { text: `Hero name: ${state?.profile.name ?? 'Claude'}. Set one with /haven name <name>.` }
    await setProfile($, { name: rest.join(' ') })
    return { text: `Welcome home, ${(await read($, haven))?.profile.name}.` }
  } else if (arg === 'motion') {
    const motion = !state?.profile.motion
    await setProfile($, { motion })
    return { text: motion ? 'Patchhaven animations on.' : 'Patchhaven animations off. Activity still updates.' }
  } else if (arg === 'replay') {
    if (await read($, isTurn)) return { text: 'Watch a journal visit between turns. Live work stays in view while Claude is working.' }
    const run = state ? [state.run, ...state.history][state.journalIndex] : undefined
    if (!run?.events.length) return { text: 'No recorded work in this visit yet. Choose an older visit in the Journal, or read or edit a file first.' }
    await update($, haven, s => s ? { ...s, profile: { ...s.profile, view: 'world' }, replay: { runId: run.id, index: 0, finished: run.events.length === 1 } } : s)
  } else if (arg === 'live') {
    await update($, haven, s => s ? { ...s, replay: undefined } : s)
  } else if (arg === 'sound') {
    isSoundOn = !isSoundOn
    await $.store.set(SOUND_KEY, isSoundOn).catch(() => undefined)
    chime($, 'done')
    return { text: isSoundOn ? 'Patchhaven chimes on: when Claude needs you, and when a turn ends.' : 'Patchhaven chimes off.' }
  } else if (arg === 'plan') {
    ownsPlan = !ownsPlan
    await $.store.set(OWN_PLAN_KEY, ownsPlan).catch(() => undefined)
    return { text: ownsPlan ? "Claude's steps show in Patchhaven only." : "Claude's steps show under each message again." }
  } else if (arg) return { text: `Unknown Patchhaven command: ${command}. Use /haven help.` }
  await $.ui.open({ id: PANE, title: 'Patchhaven' })
  return { text: 'Patchhaven opened.' }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await hydrate($)
    await syncAgentRoster($)
    $.clock.every(1400, () => advanceReplay($))
    // Every few seconds of a turn: redraw so idle agents show, and toast once
    // for an agent waiting on you or idle for two minutes.
    $.clock.every(5000, async () => {
      const hadRunning = (await read($, crewAgents)).some(a => a.status === 'running')
      await syncAgentRoster($)
      const running = new Set((await read($, crewAgents)).filter(a => a.status === 'running').map(a => String(a.index)))
      const turnActive = await read($, isTurn)
      if (!turnActive && !running.size && !hadRunning) return
      const now = Date.now()
      for (const [agent, act] of Object.entries(await read($, activity))) {
        const who = agent === '0' ? 'Claude' : `Agent ${agent}`
        const name = act.file.slice(act.file.lastIndexOf('/') + 1)
        if (turnActive && !running.has(agent) && !act.isActive && now - act.at > 120_000 && !warned.has(`${agent}:idle`)) {
          warned.add(`${agent}:idle`)
          $.ui.toast(`${who} has been idle for 2 minutes${name ? ` (last on ${name})` : ''}`)
        }
      }
      await update($, pulse, n => n + 1)
    })
    rescan($)
    await $.command.register({ name: 'haven', description: 'Open Patchhaven: your hero, live file rooms, crew and journal. /haven help' })
    await $.command.register({ name: 'board', description: 'Open Patchhaven (alias for /haven). /board help lists commands' })
    return next(e)
  })

  on('command.run', { command: 'board' }, ($, e) => runHavenCommand($, e.args))
  on('command.run', { command: 'haven' }, ($, e) => runHavenCommand($, e.args))
  on('classic.SessionStart', async ($, e, next) => {
    if (['clear', 'resume', 'fork'].includes(String(e.source))) { await hydrate($, true); rescan($); await syncAgentRoster($) }
    return next(e)
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

      return { result: `Plan shown in Patchhaven (${plan.length} steps).` } as never
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
        await recordHaven($, { kind: 'check', ok: !failed })
      } else if (ran.isError && !ran.deny) {
        await hit($, await agentOf($, e.agentId ?? ''), String(ran.text ?? e.tool))
      }
      // A shell command may commit, stash or check out: git state can move.
      if (e.tool === 'Bash' || e.tool === 'PowerShell') {
        rescan($)
        // A commit banks its files: coins fly from the desks into the Quest Hall's chest.
        const commit = /\[[^\]\r\n]+\s([0-9a-f]{7,40})\]/i.exec(String(ran.text ?? ''))
        if (COMMIT.test(String(input.command ?? '')) && !ran.deny && !ran.isError && commit) {
          const said = /(\d+) files? changed/.exec(String(ran.text ?? ''))
          const count = said ? Number(said[1]) : 1
          await update($, bank, b => ({ files: count, at: Date.now(), total: (b?.total ?? 0) + count }))
          await recordHaven($, { kind: 'commit', count, ref: commit[1] })
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
        const root = (await read($, haven))?.run.root ?? await $.session.cwd()
        await recordHaven($, { kind: 'edit', file: relativeFile(root, path), xp: gained })
      }
    } else if (!ran.deny && !ran.isError) {
      const root = (await read($, haven))?.run.root ?? await $.session.cwd()
      await recordHaven($, { kind: 'read', file: relativeFile(root, path) })
    }

    return ran
  })

  // A new prompt starts a fresh workbench once it first touches a file; until then the last scene stays.
  on('prompt.submit', async ($, e, next) => {
    isFresh = true
    await update($, haven, s => s ? { ...s, replay: undefined } : s)
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
      const index = await agentOf($, spawned.agentId)
      const alreadyRunning = (await read($, crewAgents)).some(a => a.status === 'running')
      if (!alreadyRunning) await update($, crewExpanded, () => true)
      await update($, crewAgents, list => [
        ...list.filter(a => a.id !== spawned.agentId),
        { id: spawned.agentId!, index, name: '', type: String(e.subagentType ?? ''), description: String(e.description ?? '').slice(0, 180), status: 'running' },
      ])
      await update($, activity, a => ({ ...a, [String(index)]: a[String(index)] ?? { tool: '', file: '#hall', at: Date.now(), isActive: false, isEdit: false, mode: 'background' } }))
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
      if (agent > 0) {
        const key = String(agent)
        await update($, departs, d => ({ ...d, [key]: Date.now() }))
        await update($, activity, a => a[key] ? { ...a, [key]: { ...a[key]!, isActive: false } } : a)
        await update($, crewAgents, list => list.map(a => a.index === agent && a.status === 'running' ? { ...a, status: 'completed' } : a))
      }
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
    await syncAgentRoster($)
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

      return <Text color="#f14c4c">Patchhaven could not draw: {String(err instanceof Error ? err.stack ?? err.message : err)}</Text>
    }
  })
}

// The Workbench pane: one card (Coding level, session, where each agent is),
// then the scene, whose Quest Hall holds the quest board. A terminal, which
// draws no SVG, gets the card and the quests as text.
async function drawPane($: EngineInterface, e: RenderInput<'Pane'>) {
  const ui = $.ui.resolve(e)
  const { Box, Text, Button } = ui
  await read($, pulse)
  const home = await read($, haven)
  const profile = home?.profile
  const playback = home ? replayFrame(home) : undefined
  const plan = await read($, steps)
  let touched = await read($, files)
  const git = await read($, changes)
  const total = await read($, xp)
  let acts = await read($, activity)
  const liveTurn = await read($, isTurn)
  const turn = playback ? true : liveTurn
  const gone = playback ? {} : await read($, departs)
  const root = home?.run.root ?? posix(await $.session.cwd())
  if (playback) {
    const { event, files: recordedFiles } = playback
    const active = event.file ? absoluteFile(root, event.file) ?? '#hall' : '#hall'
    touched = recordedFiles.map(file => absoluteFile(root, file)).filter((path): path is string => Boolean(path)).map(path => ({ path, agent: 0, isActive: path === active, edits: 0, kind: 'read' as const }))
    acts = { 0: { tool: eventText(event), file: active, at: Date.now(), isActive: true, isEdit: event.kind === 'edit', mode: event.kind === 'check' ? 'test' : event.kind === 'quest' ? 'quests' : undefined } }
  }
  const { level, from, to } = levelOf(total)
  const session = await read($, stats)
  const banked = await read($, bank)
  const bar = 12
  const filled = to > from ? Math.round(((total - from) / (to - from)) * bar) : bar
  const done = plan.filter(s => s.status === 'completed').length
  const failed = playback ? null : await read($, failure)
  const loops = await read($, agents)
  const roster = playback ? [] : await read($, crewAgents)
  const runningCrew = roster.filter(a => a.status === 'running')
  const runningIndexes = new Set(runningCrew.map(a => String(a.index)))
  const expandedCrew = playback ? false : await read($, crewExpanded)
  const tasks = playback ? {} : await read($, jobs)
  const waiting = playback ? {} : await read($, asking)
  const startedAt = await read($, turnStart)
  const elapsed = turn && startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0
  const clock = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`

  // Where an agent is: its room's folder trail and file, or the Quest Hall
  // or the Inn, as the scene draws it.
  const whereOf = (agent: string, act: Activity): string => {
    if (agent === '0' && !turn) return 'Inn · waiting for you'
    if (act.file === '#hall') return act.mode === 'quests' ? 'Guild Hall · reading the quests' : 'Guild Hall'
    if (act.file === '#terminal') return `Terminal · ${act.tool}`
    const path = relativeFile(root, act.file) ?? act.file
    const parts = path.split('/')
    const file = parts.pop() ?? path

    return [...(parts.length > 2 ? ['…'] : []), ...parts.slice(-2), file].join(' › ')
  }
  const crew: [string, Activity][] = [['0', acts[0] ?? { tool: '', file: '#hall', at: 0, isActive: false, isEdit: false }]]

  // One card in the scene's own palette: dark wood, a bronze rim, and the
  // yellow of a game's interface text.
  const header = (
    <Box borderStyle="single" borderColor="#718775" backgroundColor="#1c2e2b" paddingX={1} flexDirection="column">
      <Text color="#e0c78f" weight="semibold">PATCHHAVEN · {home?.run.name ?? 'Home'}</Text>
      <Text color={HERO_COLORS[HEROES.indexOf(profile?.hero ?? 'wizard')]} size="caption">
        {profile?.name ?? 'Claude'} · {profile?.hero ?? 'wizard'} · {home ? settlementOf(home.landmarks).title : 'Wayfinder'}
      </Text>
      <Box justifyContent="space-between">
        <Text>
          <Text weight="semibold" color="#ffcc33">⚒ Coding {level} </Text>
          <Text color="#ffcc33">{'▰'.repeat(filled)}</Text>
          <Text color="#5a4a2e">{'▱'.repeat(bar - filled)}</Text>
        </Text>
        <Text color="#b8a27a" tabular size="caption">
          {liveTurn ? `⏱ ${clock} · ` : ''}
          {total.toLocaleString()} xp
        </Text>
      </Box>
      <Text color="#b9c3ac" size="caption">
        {level < 99 ? `${(to - total).toLocaleString()} to ${level + 1}` : 'max level'} · {session.edits} edit{session.edits === 1 ? '' : 's'} · {session.files.length} file{session.files.length === 1 ? '' : 's'} · {session.quests} quest{session.quests === 1 ? '' : 's'}
        {banked ? ` · ${banked.total} banked` : ''}
        {session.add ? <Text color="#73c991">{`  +${session.add.toLocaleString()}`}</Text> : null}
        {session.del ? <Text color="#f14c4c">{` −${session.del.toLocaleString()}`}</Text> : null}
      </Text>
      {home && <Text color="#9cbca8" size="caption">{settlementOf(home.landmarks).stage} · {home.landmarks.length}/6 landmarks · +{session.xp ?? 0} XP this visit</Text>}
      {home?.saveError && <Text color="#e4bd8a" size="caption">Progress is live for this visit; saving is unavailable.</Text>}
      {failed && (
        <Text color={failed.error === 'rate_limit' ? '#ff5b5b' : '#c8c8ce'} weight="semibold">
          {failed.error === 'rate_limit' ? '⚡ Out of run energy · usage limit reached' : `⚠ Stopped · ${FAILURES[failed.error] ?? failed.error}`}
        </Text>
      )}
      {crew.map(([agent, act]) => {
        const hero = HEROES.indexOf(profile?.hero ?? 'wizard')
        const cast = [0, 1, 2, 3].filter(i => i !== hero)
        const index = agent === '0' ? hero : cast[(Number(agent) - 1) % cast.length]!
        const who = CREW[index]!
        const job = agent === '0' ? '' : tasks[loops[Number(agent)] ?? '']

        return (
          <Box key={`who${agent}`}>
            <Text color={AGENT_COLORS[Number(agent) % AGENT_COLORS.length]} weight="medium">
              {who.glyph} {agent === '0' ? profile?.name ?? 'Claude' : who.name}
            </Text>
            {job ? (
              <Text color="#8a7a5a" size="caption" wrap="truncate-end">
                {' · '}
                {job}
              </Text>
            ) : null}
            <Text color="#b8a27a" mono size="caption" wrap="truncate-start">
              {'  '}
              {waiting[agent] !== undefined ? 'Needs you · ' : act.isActive ? 'Working · ' : runningIndexes.has(agent) && !liveTurn ? 'In background · ' : ''}
              {whereOf(agent, act)}
            </Text>
          </Box>
        )
      })}
    </Box>
  )

  const navigation = (
    <Box flexDirection="column">
      <Box gap={1}>
        {(['world', 'focus', 'journal'] as const).map(view => <Button key={`view-${view}`} label={`${profile?.view === view ? '● ' : ''}${view[0]!.toUpperCase()}${view.slice(1)}`} plain onPress={() => setProfile($, { view })} />)}
      </Box>
      <Box gap={1}>
        <Button key="hero-cycle" label={`Hero: ${profile?.hero ?? 'wizard'}`} plain onPress={() => setProfile($, { hero: HEROES[(HEROES.indexOf(profile?.hero ?? 'wizard') + 1) % HEROES.length]! })} />
        <Button key="motion-toggle" label={`Motion: ${profile?.motion === false ? 'off' : 'on'}`} plain onPress={() => setProfile($, { motion: profile?.motion === false })} />
      </Box>
    </Box>
  )

  const crewPanel = roster.length > 0 && <Box flexDirection="column" borderStyle="single" borderColor="#617b70" paddingX={1}>
    <Button
      key="crew-toggle"
      label={`${liveTurn ? 'Crew' : 'Background crew'} · ${runningCrew.length} running · ${roster.length} tracked ${expandedCrew ? '▴' : '▾'}`}
      plain
      onPress={() => update($, crewExpanded, open => !open).then(() => undefined)}
    />
    {expandedCrew && roster.map(agent => {
      const who = agent.name || agent.type || `Agent ${agent.index}`
      const detail = agent.description || tasks[agent.id] || 'Working on a task'
      const location = acts[String(agent.index)] ? whereOf(String(agent.index), acts[String(agent.index)]!) : 'Guild Hall'
      const state = agent.status === 'running' ? liveTurn ? 'Running' : 'Running in background' : agent.status === 'failed' ? 'Failed' : agent.status === 'killed' ? 'Stopped' : 'Complete'
      const color = agent.status === 'running' ? '#9bc9a3' : agent.status === 'failed' ? '#e6a18b' : '#b9c3ac'
      return <Box key={`task-${agent.id}`} flexDirection="column">
        <Text color={color} weight="medium" wrap="truncate-end">{state} · {who} · {location}</Text>
        <Text color="#d2d2c2" size="caption" wrap="truncate-end">{detail}</Text>
      </Box>
    })}
  </Box>

  if (profile?.view === 'journal' && home) {
    const visits = [home.run, ...home.history]
    const visit = visits[home.journalIndex] ?? home.run
    return <Box flexDirection="column" gap={1}>
      {header}{navigation}{crewPanel}
      <Text weight="semibold" color="#dfc68b">Settlement landmarks</Text>
      {LANDMARKS.map(m => {
        const earned = home.landmarks.find(l => l.id === m.id)
        return <Box key={`landmark-${m.id}`} flexDirection="column">
          <Text color={earned ? '#b9d3b2' : '#bdc2b6'}>{earned ? '◆' : '◇'} {m.name}</Text>
          <Text color="#b9c3ac" size="caption">{earned ? `${new Date(earned.at).toLocaleDateString()} · ${earned.evidence}` : m.goal}</Text>
        </Box>
      })}
      <Text weight="semibold" color="#dfc68b">{home.journalIndex === 0 ? 'This visit' : `Visit · ${new Date(visit.startedAt).toLocaleString()}`}</Text>
      <Text size="caption">{visit.totals.edits} edits · {visit.totals.quests} plans · {visit.totals.checks} successful checks · {visit.totals.crew} crew · +{visit.totals.xp} XP</Text>
      <Box gap={1}>
        <Button key="visit-newer" label="← Newer" plain dimColor={home.journalIndex === 0} onPress={() => update($, haven, s => s ? { ...s, journalIndex: Math.max(0, s.journalIndex - 1) } : s).then(() => undefined)} />
        <Button key="visit-older" label="Older →" plain dimColor={home.journalIndex >= visits.length - 1} onPress={() => update($, haven, s => s ? { ...s, journalIndex: Math.min(visits.length - 1, s.journalIndex + 1) } : s).then(() => undefined)} />
        <Button key="visit-replay" label="Watch visit" plain onPress={async () => { const result = await runHavenCommand($, 'replay'); if (result.text !== 'Patchhaven opened.') $.ui.toast(result.text) }} />
      </Box>
      {!visit.events.length && <Text color="#b9c3ac">Your journal begins when Claude reads or edits a file. Nothing to claim or manage.</Text>}
      {[...visit.events].reverse().map(event => <Text key={`beat-${event.seq}`} size="caption" color={event.kind === 'check' && !event.ok ? '#e6a18b' : '#d6d8c8'}>{new Date(event.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {eventText(event)}</Text>)}
      <Text color="#b9c3ac" size="caption">Latest 24 visits · up to 48 recorded beats per visit. Landmarks stay earned.</Text>
    </Box>
  }

  const replayNotice = playback && <Box flexDirection="column" borderStyle="single" borderColor="#9eb9b0" paddingX={1}>
    <Text color="#bcdbd1">{home?.replay?.finished ? 'Replay finished' : 'Recorded visit'} · {(home?.replay?.index ?? 0) + 1}/{playback.run.events.length}</Text>
    <Text size="caption">{eventText(playback.event)}</Text>
    <Button key="return-live" label="Return to live work" plain onPress={async () => { await runHavenCommand($, 'live') }} />
  </Box>

  // The terminal has no real Svg: its table stands one in that draws only the alt text.
  const Svg = e.surface !== 'terminal' && 'Svg' in ui ? ui.Svg : undefined
  if (!Svg) {
    return (
      <Box flexDirection="column" gap={1}>
        {header}
        {navigation}
        {crewPanel}
        {replayNotice}
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
  let rooms = roomsOf(touched, playback ? {} : git, Object.values(acts).map(a => a.file))
  const backgroundAgentIndexes = !playback && !liveTurn ? [...runningIndexes] : []
  const focusPath = liveTurn ? acts[0]?.file : runningCrew.map(a => acts[String(a.index)]?.file).find(file => file && !file.startsWith('#')) ?? acts[0]?.file
  if (profile?.view === 'focus') rooms = [rooms.find(r => r.desks.some(d => d.path === focusPath)) ?? rooms[0]].filter((r): r is NonNullable<typeof r> => Boolean(r))
  const sceneKey = `${profile?.view}:${playback?.run.id ?? 'live'}`
  if (lastSceneKey !== sceneKey) { lastSpots = {}; lastSceneKey = sceneKey }
  const drawn = drawRooms({
    haven: home ? { hero: home.profile.hero, landmarks: home.landmarks, motion: home.profile.motion } : undefined,
    backgroundAgents: playback ? [] : backgroundAgentIndexes,
    rooms,
    activity: acts,
    from: lastSpots,
    now: Date.now(),
    isTurn: turn,
    width: Math.round(width / SCALE),
    paneWidth: width,
    steps: playback ? [] : plan,
    levelUp: playback ? undefined : (await read($, levelUp)) ?? undefined,
    drops: playback ? {} : await read($, drops),
    spawns: playback ? {} : await read($, spawns),
    splats: playback ? {} : await read($, splats),
    departs: gone,
    compactAt: playback ? undefined : (await read($, compactAt)) ?? undefined,
    asking: waiting,
    failure: failed ?? undefined,
    stoppedAt: playback ? undefined : (await read($, stoppedAt)) ?? undefined,
    bank: playback ? undefined : banked ?? undefined,
  })
  lastSpots = drawn.spots

  return (
    <Box flexDirection="column" gap={1}>
      {header}
      {navigation}
      {crewPanel}
      {replayNotice}
      {/* Drawn as an image, not interactive: an interactive Svg is a frame
          the app rebuilds on every redraw, which flashed white. Its SMIL
          animations run the same either way. Scaled to the pane's width: the
          narrower the scene came out, the closer the zoom. */}
      <Svg key="scene" source={drawn.svg} width={width} height={Math.round((drawn.height * width) / drawn.width)} alt={`Patchhaven: ${profile?.view === 'focus' ? 'focused file room' : 'homestead, file rooms and crew at work'}${playback ? ' (recorded visit)' : ''}`} />
    </Box>
  )
}
