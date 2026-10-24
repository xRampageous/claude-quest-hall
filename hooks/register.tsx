import { atom, read, update } from 'claude-code'
import type { Register, EngineInterface, RenderInput } from 'claude-code'

import type { Activity, CrewAgent, Failure, Mob, Step, Touch } from '../types'
import { readChanges } from './git'
import { drawRooms, roomsOf } from './rooms'
import type { Room, Spot } from './rooms'
import { actionIcon, activityAction, labelFor, roleFor } from './living-trail'
import type { ActorAction } from './living-trail'
import { AGENT_QUEST_FRAME, AGENT_QUEST_FRAMES, AGENT_QUEST_SPRITES } from './agentquest-sprites'
import { drawHud } from './hud'
import type { HudDrop } from './hud'
import { absoluteFile, earnedRewards, eventText, HEROES, LANDMARKS, recapText, relativeFile, replayFrame, REWARDS, settlementOf, skillLevel, SKILLS } from './haven'
import type { HavenSize, HavenView, VisitRecap } from './haven'
import { advanceReplay, initHaven, recordHaven, saveRecap, setProfile } from './haven-state'

const PANE = 'task-board'
const PATCHHAVEN_VERSION = '2.3.0'
const CREW_ACTION_LABELS: Record<ActorAction, string> = {
  editing: 'editing', creating: 'creating', reading: 'reading', searching: 'searching', testing: 'checking',
  researching: 'researching', applying: 'applying', command: 'command', tool: 'using tool', delegating: 'delegating',
  planning: 'planning', thinking: 'thinking', replying: 'writing reply', waiting: 'approval', working: 'working', idle: 'idle',
}
// Whether Patchhaven takes over the app's own task list under each message.
const OWN_PLAN_KEY = 'ownPlan'
let ownsPlan = true
const haven = atom({ plugin: 'task-board', key: 'haven' } as const, null)
const steps = atom({ plugin: 'task-board', key: 'steps' } as const, [])

const files = atom({ plugin: 'task-board', key: 'files' } as const, [])
// Loop ids seen this turn, in order: index 0 is Claude itself, the rest are subagents.
const agents = atom({ plugin: 'task-board', key: 'agents' } as const, [''])
const crewAgents = atom({ plugin: 'task-board', key: 'crewAgents' } as const, [] as CrewAgent[])
// Start the compact roster closed, including on installs that kept the old
// auto-expanded preference from earlier versions.
const crewExpanded = atom({ plugin: 'task-board', key: 'crewExpandedV2' } as const, false)

const changes = atom({ plugin: 'task-board', key: 'changes' } as const, {})
const xp = atom({ plugin: 'task-board', key: 'xp' } as const, 0)
const drops = atom({ plugin: 'task-board', key: 'drops' } as const, {})
// The level just reached and when, for the banner over the Patchboard.
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
const stats = atom({ plugin: 'task-board', key: 'stats' } as const, { edits: 0, files: [], quests: 0, checks: 0, crew: 0, xp: 0 })
// A shell command that commits, outside a quoted string or a pipe's later part.
const COMMIT = /(^|[;&|]\s*)git\s+(?:-\S+\s+)*commit\b/
const XP_KEY = 'xp'
const activity = atom({ plugin: 'task-board', key: 'activity' } as const, {})
const isTurn = atom({ plugin: 'task-board', key: 'isTurn' } as const, false)
const pulse = atom({ plugin: 'task-board', key: 'pulse' } as const, 0)
type QuestState = { signature: string; status: 'idle' | 'active' | 'completed' | 'cancelled' | 'replaced' | 'blocked' }
const questState = atom({ plugin: 'task-board', key: 'questState' } as const, { signature: '', status: 'idle' } as QuestState)
type DemoMode = 'idle' | 'edit' | 'crew' | 'approval' | 'failure' | 'bug' | 'complete'
const DEMO_MODES: readonly DemoMode[] = ['idle', 'edit', 'crew', 'approval', 'failure', 'bug', 'complete']
const demoMode = atom({ plugin: 'task-board', key: 'demoMode' } as const, null as DemoMode | null)
const selectedCrew = atom({ plugin: 'task-board', key: 'selectedCrew' } as const, '0')
const mobs = atom({ plugin: 'task-board', key: 'mobs' } as const, [] as Mob[])
const turnSnapshot = atom({ plugin: 'task-board', key: 'turnSnapshot' } as const, null as { seq: number; landmarks: string[]; edits: number; quests: number; crew: number; xp: number } | null)

// Where each agent stood at the last drawing, so a move can be walked.
let lastSpots: Record<string, Spot> = {}
let lastSceneKey = ''
// Agents already toasted as stuck, by agent and kind, until they act again.
const warned = new Set<string>()
// Set by a new prompt: the last turn's scene stays up until this turn first touches a file.
let isFresh = false
// The model's phase per loop as its response streams, so only a change is written.
const phases = new Map<string, Activity['mode']>()
// Tools that put a question to you rather than doing work.
const QUESTIONS = new Set(['AskUserQuestion', 'ExitPlanMode'])
// Outside tools that browse or fetch the web count as research.
const BROWSING = /(?:browser|chrome|navigate|fetch|web_?search|get_page|read_page)/i

const EDITORS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
// Who each character is, in the cast's order (Claude, then subagents in turn).
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

async function blockQuest($: EngineInterface) {
  const quest = await read($, questState)
  if (quest.status !== 'active') return
  await update($, questState, s => ({ ...s, status: 'blocked' }))
  await recordHaven($, { kind: 'quest', questOutcome: 'blocked', count: (await read($, steps)).length })
}

// Account for an accepted plan before returning an owned update to the app.
// Compare the actual steps: their order and the plan's length can change.
async function showPlan($: EngineInterface, plan: Step[]) {
  const before = await read($, steps)
  const signatureOf = (list: readonly Step[]) => list.map(s => s.text.trim().toLocaleLowerCase()).join('\u001f')
  const beforeSignature = signatureOf(before)
  const nextSignature = signatureOf(plan)
  let quest = await read($, questState)
  if (!quest.signature && before.length) quest = { signature: beforeSignature, status: before.every(s => s.status === 'completed') ? 'completed' : 'active' }
  const alreadyDone = new Set(before.filter(s => s.status === 'completed').map(s => s.text))
  const done = plan.filter(s => s.status === 'completed')
  const newlyDone = done.filter(s => !alreadyDone.has(s.text))
  await update($, steps, () => plan)

  const replacing = Boolean(before.length && quest.status === 'active' && nextSignature && beforeSignature !== nextSignature)
  const cancelling = Boolean(before.length && quest.status === 'active' && !plan.length)
  if (replacing || cancelling) await recordHaven($, { kind: 'quest', questOutcome: replacing ? 'replaced' : 'cancelled', count: before.length })
  if (!plan.length) {
    await update($, questState, () => ({ signature: '', status: cancelling ? 'cancelled' : quest.status }))
  } else if (plan.length > 0 && done.length === plan.length) {
    const alreadyComplete = quest.status === 'completed' && quest.signature === nextSignature
    await update($, questState, () => ({ signature: nextSignature, status: 'completed' }))
    if (!alreadyComplete) {
      await update($, stats, s => ({ ...s, quests: s.quests + 1 }))
      await recordHaven($, { kind: 'quest', questOutcome: 'completed', count: plan.length })
      $.ui.toast(`Congratulations, quest complete! (${plan.length} step${plan.length === 1 ? '' : 's'})`)
    }
  } else {
    await update($, questState, () => ({ signature: nextSignature, status: 'active' }))
  }
  if (newlyDone.length > 0 && done.length !== plan.length) {
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
  let listed: unknown
  try { listed = await $.agent.list() } catch { return }
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
            tool: '', file: old?.file ?? '#crew', at: old?.at ?? Date.now(), isActive: false,
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
  const added = next.filter(agent => !before.some(previousAgent => previousAgent.id === agent.id)).length
  if (added) await update($, stats, s => ({ ...s, crew: (s.crew ?? 0) + added }))
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

// A failing check lets a bug loose where it ran, one pip per failing test it
// reports (up to five); a later passing check squashes every bug still loose.
async function trackBugs($: EngineInterface, failed: boolean, file: string, agent: number, text: string) {
  const now = Date.now()
  if (failed) {
    const reported = Number(/\b(\d+) (?:failed|failing|failures?)\b/i.exec(text)?.[1] ?? 0)
    const hp = Math.max(1, Math.min(5, reported || 1))
    await update($, mobs, list => {
      const loose = list.find(mob => mob.defeatedAt === undefined && mob.file === file)
      if (loose) return list.map(mob => mob === loose ? { ...mob, hp: reported ? hp : mob.hp, at: now, agent } : mob)
      return [...list.filter(mob => mob.defeatedAt === undefined).slice(-3), { id: `bug-${now}`, file, agent, hp, at: now }]
    })
  } else {
    await update($, mobs, list => list.some(mob => mob.defeatedAt === undefined) ? list.map(mob => mob.defeatedAt === undefined ? { ...mob, defeatedAt: now } : mob) : list)
  }
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
  const mode = isNew ? 'create' : isApply ? 'apply' : kind === 'edit' ? 'edit' : 'read'
  await update($, activity, a => ({ ...a, [agent]: { tool, file: path, at: Date.now(), isActive: true, isEdit, isNew, isApply, mode } }))
  warned.delete(`${agent}:idle`)
  warned.delete(`${agent}:waiting`)
  try {
    return await run()
  } finally {
    await update($, files, l => l.map(f => (f.path === path ? { ...f, isActive: false } : f)))
    await update($, activity, a => ({ ...a, [agent]: { tool, file: path, at: Date.now(), isActive: false, isEdit, isNew, isApply, mode } }))
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
    '/haven — open the Patchhaven map. /board is an alias.',
    '/haven world | focus | journal — choose a view.',
    '/haven stats (or recap) — this session’s progress.',
    '/haven settings — size, motion, sound, demo and diagnostics.',
    '/haven size auto | comfortable | large — choose map scale.',
    '/haven demo idle | edit | crew | approval | failure | bug | complete | off — token-free preview.',
    '/haven title — equip an earned title.',
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
      state?.lastRecap ? `Last field report: ${recapText(state.lastRecap)}` : '',
    ].filter(Boolean).join('\n') }
  }
  if (['world', 'focus', 'journal', 'history', 'skills', 'settings'].includes(arg)) {
    await setProfile($, { view: arg === 'history' ? 'journal' : arg as HavenView })
  } else if (arg === 'size') {
    const size = rest[0]?.toLowerCase() as HavenSize | undefined
    if (!size || !['auto', 'comfortable', 'large'].includes(size)) return { text: `Map size: ${state?.profile.size ?? 'auto'}. Choose auto, comfortable or large: /haven size large` }
    await setProfile($, { size })
    return { text: `Patchhaven map size: ${size}.` }
  } else if (arg === 'demo') {
    const mode = (rest[0] ?? 'crew').toLowerCase()
    if (mode === 'off') {
      await update($, demoMode, () => null)
      await setProfile($, { view: 'world' })
      return { text: 'Live Patchhaven scene restored. Demo scenes never change project progress.' }
    }
    if (!DEMO_MODES.includes(mode as DemoMode)) return { text: `Choose a demo scene: ${DEMO_MODES.join(', ')} or off. Example: /haven demo crew` }
    await update($, demoMode, () => mode as DemoMode)
    await setProfile($, { view: 'world' })
    return { text: `Showing the ${mode} demo. This preview uses sample data and does not call tools or change progress. Use /haven demo off to return.` }
  } else if (arg === 'settings') {
    await setProfile($, { view: 'settings' })
    return { text: 'Patchhaven settings opened.' }
  } else if (arg === 'diagnostics') {
    const event = state?.run.events.at(-1)
    return { text: [
      `Patchhaven ${PATCHHAVEN_VERSION} · ${state?.profile.size ?? 'auto'} scale · ${state?.profile.motion === false ? 'motion off' : 'motion on'}`,
      `Visit ${state?.run.events.length ?? 0}/48 beats · ${state?.saveError ? 'save issue' : 'progress saved'}`,
      `Last event: ${event ? eventText(event) : 'none yet'}${event ? ` · ${new Date(event.at).toLocaleTimeString()}` : ''}`,
    ].join('\n') }
  } else if (arg === 'title') {
    const requested = rest.join(' ').toLowerCase()
    if (!requested) return { text: `Equipped: ${state?.profile.title ?? 'Wayfinder'}. Earned: ${state ? earnedRewards(state.skills).map(item => item.name).join(', ') || 'none yet' : 'none yet'}. Use /haven title <earned title>.` }
    const found = state && earnedRewards(state.skills).find(item => item.id === requested || item.name.toLowerCase() === requested)
    if (!found) return { text: 'That title is still locked. Open /haven skills to see the requirements.' }
    await setProfile($, { title: found.name })
    return { text: `${found.name} title equipped.` }
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
    await update($, pulse, n => n + 1)
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

function demoFixture(mode: DemoMode, now: number) {
  const paths = ['src/Engine.java', 'tests/Engine.test.java', 'docs/roadmap.md', 'src/FreshPatch.java']
  const touch = (path: string, kind: Touch['kind'] = 'edit', isNew = false): Touch => ({ path, agent: 0, isActive: false, edits: 3, kind, isNew, add: 12, del: 4 })
  const rooms: Room[] = [
    { key: 'src', name: 'src', slot: 1, desks: [{ path: paths[0]!, name: 'Engine.java', touch: touch(paths[0]!), change: { code: 'M', add: 12, del: 4, mtimeMs: now } }] },
    { key: 'tests', name: 'tests', slot: 2, desks: [{ path: paths[1]!, name: 'Engine.test.java', touch: touch(paths[1]!, 'read'), change: { code: 'M', add: 0, del: 0, mtimeMs: now } }] },
    { key: 'docs', name: 'docs', slot: 3, desks: [{ path: paths[2]!, name: 'roadmap.md', touch: touch(paths[2]!, 'read') }] },
    { key: '#forge', name: 'Forge', slot: 0, desks: [{ path: paths[3]!, name: 'FreshPatch.java', touch: touch(paths[3]!, 'edit', true), change: { code: 'A', add: 12, del: 0, mtimeMs: now } }] },
  ]
  const many = ['crew', 'approval', 'failure'].includes(mode)
  const bugs: Mob[] = mode === 'bug' ? [{ id: 'demo-bug', file: paths[0]!, agent: 0, hp: 3, at: now }] : []
  const crew: CrewAgent[] = many
    ? Array.from({ length: 7 }, (_, index) => ({ id: `demo-review-${index + 1}`, index: index + 1, name: `Sonnet reviewer ${index + 1}`, type: 'reviewer', description: `Review ${paths[index % paths.length]}`, status: 'running' }))
    : mode === 'complete' ? [{ id: 'demo-review-1', index: 1, name: 'Sonnet reviewer', type: 'reviewer', description: 'Finished checking the patch', status: 'completed' }] : []
  const location = (index: number) => mode === 'approval' && index === 1 ? '#terminal' : ['#crew', '#terminal', paths[0]!, paths[1]!, paths[2]!, paths[3]!, paths[0]!][index - 1] ?? '#crew'
  const activity: Record<string, Activity> = { 0: { tool: mode === 'edit' || mode === 'bug' ? 'Edit' : '', file: mode === 'idle' || mode === 'complete' ? '#inn' : mode === 'failure' ? '#terminal' : paths[0]!, at: now, isActive: mode === 'edit' || mode === 'bug' || mode === 'approval' || mode === 'failure', isEdit: mode === 'edit' || mode === 'bug', mode: mode === 'edit' || mode === 'bug' ? 'edit' : undefined } }
  for (const member of crew) activity[String(member.index)] = { tool: 'Review', file: location(member.index), at: now - member.index * 8000, isActive: many, isEdit: false, mode: member.index === 2 ? 'test' : member.index === 3 ? 'web' : 'background' }
  const steps: Step[] = mode === 'idle' ? [] : mode === 'complete'
    ? [{ text: 'Map the work', status: 'completed' }, { text: 'Check the patch', status: 'completed' }, { text: 'Share the result', status: 'completed' }]
    : [{ text: 'Map the work', status: 'completed' }, { text: 'Check the patch', status: 'in_progress' }, { text: 'Share the result', status: 'pending' }]
  const askingState: Record<string, number> = mode === 'approval' ? { '1': now } : {}
  const failureState: Failure | undefined = mode === 'failure' ? { error: 'server_error', at: now } : undefined
  return { rooms: mode === 'idle' ? [] : rooms, crew, activity, steps, asking: askingState, failure: failureState, mobs: bugs, questStatus: mode === 'complete' ? 'completed' : mode === 'failure' ? 'blocked' : mode === 'idle' ? 'idle' : 'active' }
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
    await $.command.register({ name: 'haven', description: 'Open Patchhaven: a live pixel map of files, quests and background crew. /haven help' })
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
      const isOutside = e.tool.startsWith('mcp__')
      const isSearch = e.tool === 'Grep' || e.tool === 'Glob' || e.tool === 'LSP'
      const isCrewTool = /^(Task|Agent|Delegate|SpawnAgent|TeamCreate|TaskOutput|SendMessage)$/i.test(e.tool)
      const isQuestion = QUESTIONS.has(e.tool)
      const mode = isQuestion
        ? 'ask'
        : WEB.has(e.tool) || (isOutside && BROWSING.test(e.tool))
        ? 'web'
        : isSearch
          ? 'search'
          : isShell && TESTS.test(command)
          ? 'test'
          : isShell && APPLY.test(command)
            ? 'apply'
            : isCrewTool
              ? 'background'
              : isShell
              ? 'shell'
              : isOutside
                ? 'tool'
                : 'tool'
      // What the Terminal's bubble says: the command's first words, the
      // search's pattern, or the outside tool's own name.
      const label = isShell
        ? `$ ${command.trim().split(/\s+/).slice(0, 2).join(' ')}`
        : isQuestion
          ? e.tool === 'ExitPlanMode' ? '? A plan to approve' : '? A question for you'
        : e.tool === 'Skill'
          ? `✦ ${String(input.skill ?? 'skill')}`
        : isSearch
          ? `⌕ ${String(input.pattern ?? input.query ?? input.operation ?? '')}`
          : isOutside
            ? `⚙ ${e.tool.split('__').pop()}`
            : isCrewTool
              ? `↗ ${String(input.description ?? e.tool)}`
              : `⚙ ${e.tool}`
      // Tests, web searches and applied patches happen where the agent already
      // is: a training dummy, a map scroll or a rune circle at its desk (or in
      // the Patchboard if it has no desk yet).
      const agent = mode ? await agentOf($, e.agentId ?? '') : -1
      // Commands, searches and outside tools are worked in the Terminal room.
      const at = mode === 'shell' || mode === 'search' || mode === 'tool' ? '#terminal' : mode === 'background' ? '#crew' : ((await read($, activity))[agent]?.file ?? '#hall')
      if (mode) {
        await update($, activity, a => ({ ...a, [agent]: { tool: label, file: at, at: Date.now(), isActive: true, isEdit: false, mode } }))
      }
      // A question waits on you like a permission prompt, until it is answered.
      if (isQuestion) await update($, asking, a => ({ ...a, [agent]: Date.now() }))
      const ran = await next(e)
      await answered($, e.agentId ?? '')
      if (mode) {
        await update($, activity, a => ({ ...a, [agent]: { tool: label, file: at, at: Date.now(), isActive: false, isEdit: false, mode } }))
      }
      if (mode === 'test' && !ran.deny) {
        const failed = ran.isError || /\b(FAIL(ED|URE)?|[1-9]\d* fail(ed|ing|ures?)?)\b/.test(String(ran.text ?? ''))
        await update($, splats, s => ({ ...s, [agent]: { kind: failed ? 'fail' : 'pass', damage: 0, at: Date.now() } }))
        await trackBugs($, failed, at, agent, String(ran.text ?? ''))
        await update($, stats, s => ({ ...s, checks: (s.checks ?? 0) + 1 }))
        await recordHaven($, { kind: 'check', ok: !failed })
      } else if (WEB.has(e.tool) && !ran.deny && !ran.isError) {
        await recordHaven($, { kind: 'research' })
      } else if (ran.isError && !ran.deny) {
        await hit($, await agentOf($, e.agentId ?? ''), String(ran.text ?? e.tool))
      }
      // A shell command may commit, stash or check out: git state can move.
      if (e.tool === 'Bash' || e.tool === 'PowerShell') {
        rescan($)
        // A commit shelves its files in the Patchboard archive.
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

  // A new prompt starts a fresh trail once it first touches a file; until then the last scene stays.
  on('prompt.submit', async ($, e, next) => {
    isFresh = true
    await update($, haven, s => s ? { ...s, replay: undefined } : s)
    await update($, isTurn, () => true)
    await update($, turnStart, () => Date.now())
    await update($, failure, () => null)
    await update($, stoppedAt, () => null)
    await update($, asking, () => ({}))
    await update($, activity, a => ({ ...a, '0': { tool: '', file: '#hall', at: Date.now(), isActive: false, isEdit: false } }))
    await update($, questState, s => s.status === 'blocked' ? { ...s, status: 'active' } : s)
    await update($, mobs, list => list.some(mob => mob.defeatedAt !== undefined) ? list.filter(mob => mob.defeatedAt === undefined) : list)
    phases.clear()
    const state = await read($, haven)
    const session = await read($, stats)
    if (state) await update($, turnSnapshot, () => ({ seq: state.run.seq, landmarks: state.landmarks.map(l => l.id), edits: session.edits, quests: session.quests, crew: session.crew ?? 0, xp: session.xp ?? 0 }))
    warned.clear()
    rescan($)

    return next(e)
  })

  // The model's response as it streams: thinking, then writing its reply, then
  // calling a tool. Each loop's character shows the phase it is in; only a change
  // is written, and a tool already running is never overwritten.
  on('turn.step', async function* ($, e, next) {
    const loopId = e.agentId ?? ''
    // Each step starts afresh: the first thing it streams is always shown.
    phases.delete(loopId)
    const stream = next(e)
    for (;;) {
      const piece = await stream.next()
      if (piece.done) return piece.value
      const chunk = piece.value
      const phase: Activity['mode'] | undefined = chunk.kind === 'thinking' ? 'think' : chunk.kind === 'text' ? 'reply' : chunk.kind === 'tool' ? 'think' : undefined
      if (phase && phases.get(loopId) !== phase) {
        phases.set(loopId, phase)
        try {
          const agent = await agentOf($, loopId)
          await update($, activity, a => {
            const was = a[agent]
            if (was?.isActive) return a
            return { ...a, [agent]: { tool: was?.tool ?? '', file: was?.file ?? (agent === 0 ? '#hall' : '#crew'), at: Date.now(), isActive: false, isEdit: was?.isEdit ?? false, isNew: was?.isNew, mode: phase } }
          })
        } catch {
          // A missed phase costs only the cue, never the response.
        }
      }
      yield chunk
    }
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
      const wasTracked = (await read($, crewAgents)).some(a => a.id === spawned.agentId)
      await update($, crewAgents, list => [
        ...list.filter(a => a.id !== spawned.agentId),
        { id: spawned.agentId!, index, name: '', type: String(e.subagentType ?? ''), description: String(e.description ?? '').slice(0, 180), status: 'running' },
      ])
      if (!wasTracked) await update($, stats, s => ({ ...s, crew: (s.crew ?? 0) + 1 }))
      await update($, activity, a => ({ ...a, [String(index)]: a[String(index)] ?? { tool: '', file: '#crew', at: Date.now(), isActive: false, isEdit: false, mode: 'background' } }))
    }

    return spawned
  })

  // A turn that died on an error: out of run energy for the usage limit,
  // a grey banner for the rest, until the next prompt.
  on('classic.StopFailure', async ($, e, next) => {
    try {
      await update($, failure, () => ({ error: e.error, at: Date.now() }))
      await blockQuest($)
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
    if (e.reason !== 'aborted') {
      await update($, activity, a => ({ ...a, '0': { ...(a['0'] ?? { tool: '', file: '#inn', at: Date.now(), isActive: false, isEdit: false }), file: '#inn', isActive: false } }))
    }
    if (e.reason === 'aborted') await blockQuest($)
    await syncAgentRoster($)
    if (e.reason === 'aborted') await update($, stoppedAt, () => Date.now())
    const home = await read($, haven)
    const snapshot = await read($, turnSnapshot)
    const totals = await read($, stats)
    if (home && snapshot) {
      const beats = home.run.events.filter(event => event.seq > snapshot.seq)
      const unlocked = home.landmarks.filter(mark => !snapshot.landmarks.includes(mark.id))
      const recap: VisitRecap = {
        at: Date.now(),
        edits: beats.filter(event => event.kind === 'edit').reduce((sum, event) => sum + event.count, 0),
        files: [...new Set(beats.filter(event => event.file && (event.kind === 'read' || event.kind === 'edit')).map(event => event.file!))].slice(-12),
        passed: beats.filter(event => event.kind === 'check' && event.ok).length,
        failed: beats.filter(event => event.kind === 'check' && !event.ok).length,
        quests: Math.max(0, totals.quests - snapshot.quests),
        crew: Math.max(0, (totals.crew ?? 0) - snapshot.crew),
        xp: Math.max(0, (totals.xp ?? 0) - snapshot.xp),
        unlocks: unlocked.map(mark => LANDMARKS.find(item => item.id === mark.id)?.name ?? mark.id),
        evidence: unlocked.map(mark => mark.evidence),
      }
      await saveRecap($, recap)
    }
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

// The Patchhaven pane: a compact game HUD, controls and the living file map.
// A terminal has no SVG, so it gets the HUD and quests as text.
async function drawPane($: EngineInterface, e: RenderInput<'Pane'>) {
  const ui = $.ui.resolve(e)
  const { Box, Text, Button } = ui
  const Svg = e.surface !== 'terminal' && 'Svg' in ui ? ui.Svg : undefined
  await read($, pulse)
  const home = await read($, haven)
  const profile = home?.profile
  const playback = home ? replayFrame(home) : undefined
  const demo = playback ? null : await read($, demoMode)
  const fixture = demo ? demoFixture(demo, Date.now()) : undefined
  let plan = await read($, steps)
  if (fixture) plan = fixture.steps
  let touched = await read($, files)
  const git = await read($, changes)
  const total = await read($, xp)
  let acts = await read($, activity)
  let liveTurn = await read($, isTurn)
  if (fixture) liveTurn = demo === 'edit' || demo === 'approval' || demo === 'failure'
  const turn = playback ? true : liveTurn
  const gone = playback || fixture ? {} : await read($, departs)
  const root = home?.run.root ?? posix(await $.session.cwd())
  if (fixture) {
    touched = fixture.rooms.flatMap(room => room.desks.map(desk => desk.touch))
    acts = fixture.activity
  }
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
  const failed = playback ? null : fixture ? fixture.failure ?? null : await read($, failure)
  const roster = playback ? [] : fixture ? fixture.crew : await read($, crewAgents)
  const runningCrew = roster.filter(a => a.status === 'running')
  const runningIndexes = new Set(runningCrew.map(a => String(a.index)))
  const expandedCrew = playback ? false : await read($, crewExpanded)
  const tasks = playback ? {} : fixture ? Object.fromEntries(roster.map(agent => [agent.id, agent.description])) : await read($, jobs)
  const waiting = playback ? {} : fixture ? fixture.asking : await read($, asking)
  const selectedCrewId = await read($, selectedCrew)
  const focusAgentId = selectedCrewId !== '0' && !roster.some(agent => String(agent.index) === selectedCrewId) ? '0' : selectedCrewId
  const startedAt = await read($, turnStart)
  const elapsed = turn && startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0
  const clock = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`

  // Where an agent is: its room's folder trail and file, or the Patchboard,
  // Crew Lodge, Terminal, or Inn, as the scene draws it.
  const whereOf = (agent: string, act: Activity): string => {
    if (agent === '0' && !turn) return 'Camp · waiting for you'
    if (act.file === '#crew') return 'Crew Lodge · between tasks'
    if (act.file === '#hall') return act.mode === 'quests' ? 'Patchboard · reading work orders' : 'Patchboard'
    if (act.file === '#terminal') return `Terminal · ${act.tool}`
    const path = relativeFile(root, act.file) ?? act.file
    const parts = path.split('/')
    const file = parts.pop() ?? path

    return [...(parts.length > 2 ? ['…'] : []), ...parts.slice(-2), file].join(' › ')
  }
  const stage = home ? settlementOf(home.landmarks).stage : 'Wayfinder'
  const workStatus = demo ? `DEMO · ${demo.toUpperCase()}` : failed
    ? failed.error === 'rate_limit' ? 'NO ENERGY' : 'PAUSED'
    : turn ? `WORKING${clock ? ` · ${clock}` : ''}` : runningCrew.length ? `${runningCrew.length} CREW ACTIVE` : 'AT CAMP'

  const alerts = <>
    {home?.saveError && <Text color="#e4bd8a" size="caption">Progress is live for this visit; saving is unavailable.</Text>}
    {failed && (
      <Text color={failed.error === 'rate_limit' ? '#ff5b5b' : '#c8c8ce'} size="caption" weight="semibold">
        {failed.error === 'rate_limit' ? '⚡ Out of run energy · usage limit reached' : `⚠ Stopped · ${FAILURES[failed.error] ?? failed.error}`}
      </Text>
    )}
  </>
  const renderWidth = Math.max(200, Math.min(560, (e.props.bodyColumns ?? 40) * 8))
  const zoom = profile?.size === 'large' ? 1.22 : profile?.size === 'comfortable' ? 1.12 : 1
  const looseBugs = (fixture ? fixture.mobs : playback ? [] : await read($, mobs)).filter(mob => mob.defeatedAt === undefined).length

  // The HUD: hero plate, Coding bar with XP drops, skill orbs and the visit's haul.
  // A terminal has no Svg, so it keeps the same facts as a few lines of text.
  let header
  if (Svg) {
    const now = Date.now()
    const recentEvents = (home?.run.events ?? []).filter(event => now - event.at < 4000 && event.skill && event.skillXp)
    const codingDrops = Object.values(playback ? {} : await read($, drops)).filter(drop => now - drop.at < 3600)
    const hudDrops: HudDrop[] = [
      ...codingDrops.map(drop => ({ xp: drop.xp, skill: 'coding', at: drop.at })),
      ...recentEvents.map(event => ({ xp: event.skillXp!, skill: event.skill!, at: event.at })),
    ].sort((a, b) => a.at - b.at)
    const checks = home?.run.events.filter(event => event.kind === 'check') ?? []
    const heroIndex = Math.max(0, HEROES.indexOf(profile?.hero ?? 'wizard'))
    const hudWidth = renderWidth / zoom
    const recentLevel = await read($, levelUp)
    const hud = drawHud({
      width: hudWidth,
      scale: Math.max(1.1, Math.min(1.38, renderWidth / 315)),
      motion: profile?.motion !== false,
      now,
      portrait: AGENT_QUEST_SPRITES[roleFor('0', heroIndex)]!.idle.south,
      name: `${profile?.name ?? 'Claude'}${profile?.title ? ` · ${profile.title}` : ''}`,
      subtitle: demo ? 'Sample scene · saved progress unchanged' : `${profile?.hero ?? 'wizard'} · ${stage} · ${home?.run.name ?? 'Home'}`,
      status: workStatus,
      statusTone: demo ? 'demo' : failed ? 'alert' : turn || runningCrew.length ? 'live' : 'calm',
      coding: { level, xp: total, from, to },
      levelUpAt: recentLevel?.at,
      skills: SKILLS.map(skill => {
        const amount = home?.skills[skill.id] ?? 0
        const at = skillLevel(amount)
        return { id: skill.id, name: skill.name, level: at.level, progress: at.to > at.from ? (amount - at.from) / (at.to - at.from) : 1, lit: recentEvents.some(event => event.skill === skill.id) }
      }),
      drops: hudDrops,
      haul: {
        edits: session.edits, files: session.files.length, passed: checks.filter(event => event.ok).length, failed: checks.filter(event => !event.ok).length,
        quests: session.quests, banked: banked?.total ?? 0, crew: session.crew ?? 0, bugs: looseBugs, add: session.add ?? 0, del: session.del ?? 0,
      },
    })
    header = <Box flexDirection="column">
      <Svg key="hud" source={hud.svg} width={renderWidth} height={Math.round(hud.height * renderWidth / hud.width)} alt={hud.alt} />
      {alerts}
    </Box>
  } else {
    header = (
      <Box borderStyle="single" borderColor="#60766b" paddingX={1} flexDirection="column">
        <Box justifyContent="space-between">
          <Text color="#e0c78f" weight="semibold" wrap="truncate-end">{profile?.name ?? 'Claude'} · {profile?.hero ?? 'wizard'} · {stage}</Text>
          <Text color={failed ? '#e89a87' : turn ? '#9bc9a3' : '#a9b7a5'} size="caption">{workStatus}</Text>
        </Box>
        <Text>
          <Text color="#d8bf76">Coding {level} </Text>
          <Text color="#ffcc33">{'▰'.repeat(Math.round(filled * 8 / bar))}</Text>
          <Text color="#5a4a2e">{'▱'.repeat(8 - Math.round(filled * 8 / bar))}</Text>
          <Text color="#d4bd7a"> {total.toLocaleString()} xp</Text>
        </Text>
        <Text color="#b9c3ac" size="caption" wrap="truncate-end">
          {demo
            ? 'SAMPLE SCENE · SAVED PROGRESS UNCHANGED'
            : `${session.edits} edits · ${session.files.length} files · ${session.quests} quests · ${home?.landmarks.length ?? 0}/${LANDMARKS.length} marks${looseBugs ? ` · ${looseBugs} bug${looseBugs === 1 ? '' : 's'} loose` : ''}`}
        </Text>
        {alerts}
      </Box>
    )
  }

  const navigation = (
    <Box gap={1}>
      {(['world', 'focus', 'journal', 'skills', 'settings'] as const).map(view => <Button key={`view-${view}`} label={`${profile?.view === view ? '◆ ' : ''}${view === 'world' ? 'Trail' : view === 'journal' ? 'Log' : view === 'skills' ? 'Skills' : view === 'settings' ? 'More' : 'Focus'}`} plain onPress={() => setProfile($, { view })} />)}
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
      const act = acts[String(agent.index)]
      const location = act ? whereOf(String(agent.index), act) : 'Patchboard'
      const needsApproval = waiting[String(agent.index)] !== undefined
      const action = activityAction(act ?? { tool: '', file: '#crew', at: Date.now(), isActive: false, isEdit: false, mode: 'background' }, agent.status === 'running', needsApproval, false)
      const state = needsApproval ? 'approval' : agent.status === 'running' ? act?.isActive || action === 'thinking' && act?.mode === 'think' || action === 'replying' ? CREW_ACTION_LABELS[action] : 'between tools' : agent.status === 'failed' ? 'failed' : agent.status === 'killed' ? 'stopped' : 'done'
      const color = needsApproval || agent.status === 'failed' ? '#e6a18b' : agent.status === 'running' ? '#9bc9a3' : '#b9c3ac'
      const role = roleFor(String(agent.index), HEROES.indexOf(profile?.hero ?? 'wizard'))
      const sprite = AGENT_QUEST_SPRITES[role]!
      const working = agent.status === 'running' && Boolean(act?.isActive) && !['reading', 'searching', 'researching', 'planning', 'waiting'].includes(action)
      const animateAvatar = profile?.motion !== false && agent.status === 'running'
      // The same strip as on the map: a full work stroke and a breath, or a still pose.
      const body = working
        ? '<svg width="56" height="56" viewBox="0 0 56 56" overflow="hidden"><image href="' + sprite.attack + '" width="' + AGENT_QUEST_FRAME * AGENT_QUEST_FRAMES + '" height="56" image-rendering="pixelated" x="' + (animateAvatar ? 0 : -4 * AGENT_QUEST_FRAME) + '">' +
          (animateAvatar ? '<animate attributeName="x" calcMode="discrete" values="' + Array.from({ length: AGENT_QUEST_FRAMES }, (_, i) => -i * AGENT_QUEST_FRAME).join(';') + ';0" keyTimes="' + Array.from({ length: AGENT_QUEST_FRAMES }, (_, i) => (i * .75 / AGENT_QUEST_FRAMES / 1.35).toFixed(3)).join(';') + ';' + (.75 / 1.35).toFixed(3) + '" dur="1.35s" repeatCount="indefinite"/>' : '') + '</image></svg>'
        : '<g><image href="' + sprite.idle[['reading', 'searching', 'researching', 'planning', 'replying'].includes(action) ? 'west' : 'south'] + '" width="56" height="56" image-rendering="pixelated"/>' + (animateAvatar ? '<animateTransform attributeName="transform" type="translate" values="0 0;0 -1;0 0" dur="1.8s" repeatCount="indefinite"/>' : '') + '</g>'
      const badge = agent.status !== 'running' ? '' : needsApproval
        ? '<rect x="38" y="4" width="15" height="15" rx="3" fill="#f0d17d" stroke="#533b2b"/><text x="45.5" y="15.5" text-anchor="middle" font-size="11" font-weight="700" fill="#33271e">?</text>'
        : '<rect x="38" y="4" width="15" height="15" rx="3" fill="#24372c" stroke="' + (act?.isActive ? '#efca75' : '#9cc8a1') + '" stroke-width="1"/>' + actionIcon(action, 41, 7, 9, act?.isActive ? '#ffe6a1' : '#cfd8c4')
      const avatarSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="6 2 50 50" shape-rendering="crispEdges">' + body + badge + '</svg>'
      const age = act?.at ? Math.max(0, Math.floor((Date.now() - act.at) / 1000)) : undefined
      const seen = age === undefined ? 'not seen yet' : age < 60 ? `${age}s` : `${Math.floor(age / 60)}m`
      return <Box key={`task-${agent.id}`} flexDirection="row" gap={1}>
        {Svg && <Svg source={avatarSvg} width={22} height={24} alt={`${who} Agent Quest ${state} character`} />}
        <Box flexDirection="column">
          <Box flexDirection="row" gap={1}>
            <Button key={`agent-select-${agent.id}`} label={`${String(agent.index) === selectedCrewId ? '◆ ' : '◇ '}${who}`} plain onPress={async () => { await update($, selectedCrew, () => String(agent.index)); await setProfile($, { view: 'focus' }) }} />
            <Text color={color} size="caption">· {state}</Text>
          </Box>
          <Text color="#d2d2c2" size="caption" wrap="truncate-end">{location} · {detail} · {seen}</Text>
        </Box>
      </Box>
    })}
  </Box>

  if (profile?.view === 'skills' && home) {
    const rewards = earnedRewards(home.skills)
    const codingLevel = levelOf(total)
    return <Box flexDirection="column" gap={1}>
      {header}{navigation}
      <Text weight="semibold" color="#dfc68b">GUILD LEDGER · {settlementOf(home.landmarks).stage}</Text>
      <Box flexDirection="column" borderStyle="single" borderColor="#617b70" paddingX={1}>
        <Text color="#e0c782" weight="semibold">Coding · level {codingLevel.level} · {total.toLocaleString()} XP</Text>
        <Text size="caption" color="#b9c3ac">The classic OSRS level curve · XP carries between sessions.</Text>
      </Box>
      {SKILLS.map(skill => {
        const amount = home.skills[skill.id]
        const level = skillLevel(amount)
        const width = level.to > level.from ? Math.round((amount - level.from) / (level.to - level.from) * 10) : 10
        return <Box key={`skill-${skill.id}`} flexDirection="column" borderStyle="single" borderColor="#536b60" paddingX={1}>
          <Box justifyContent="space-between"><Text color="#e0c782" weight="semibold">{skill.icon} {skill.name} · {level.level}</Text><Text size="caption" color="#d4bd7a">{amount.toLocaleString()} XP</Text></Box>
          <Text color="#e8c86e">{'▰'.repeat(width)}<Text color="#53604f">{'▱'.repeat(10 - width)}</Text></Text>
          <Text size="caption" color="#b9c3ac">{skill.work} · {level.to > amount ? `${(level.to - amount).toLocaleString()} to level ${level.level + 1}` : 'Maximum level'}</Text>
        </Box>
      })}
      <Box flexDirection="column" borderStyle="single" borderColor="#806d49" paddingX={1}>
        <Text color="#e0c782" weight="semibold">FIELD RELICS · {rewards.length}/{REWARDS.length} titles</Text>
        {REWARDS.map(reward => {
          const unlocked = rewards.some(item => item.id === reward.id)
          return <Button key={`reward-${reward.id}`} label={`${unlocked ? (profile.title === reward.name ? '◆ ' : '◇ ') + reward.mark + ' ' + reward.name + ' · ' + reward.item : '🔒 ' + reward.item + ' · ' + reward.skill + ' level ' + reward.level}`} plain dimColor={!unlocked} onPress={() => unlocked && setProfile($, { title: reward.name })} />
        })}
      </Box>
      <Text size="caption" color="#aebdac">Skill gains reward distinct file reads and edits, successful checks and team milestones. Repeated calls earn less and each skill is capped per visit.</Text>
      {crewPanel}
    </Box>
  }

  if (profile?.view === 'settings' && home) {
    const latest = home.run.events.at(-1)
    const diagnostics = `${PATCHHAVEN_VERSION} · ${e.surface} · ${e.props.bodyColumns ?? 40} columns · ${home.run.events.length}/48 beats · ${home.saveError ? 'save issue' : 'saving normally'}`
    return <Box flexDirection="column" gap={1}>
      {header}{navigation}
      <Text weight="semibold" color="#dfc68b">HAVEN SETTINGS · {profile.size.toUpperCase()}</Text>
      <Box flexDirection="column" borderStyle="single" borderColor="#617b70" paddingX={1}>
        <Text color="#e0c782" weight="semibold">MAP SCALE</Text>
        <Box gap={1}>{(['auto', 'comfortable', 'large'] as const).map(size => <Button key={`scale-${size}`} label={`${profile.size === size ? '◆ ' : ''}${size}`} plain onPress={() => setProfile($, { size })} />)}</Box>
        <Box gap={1}>
          <Button key="settings-hero" label={`Hero · ${profile.hero} · change`} plain onPress={() => setProfile($, { hero: HEROES[(HEROES.indexOf(profile.hero) + 1) % HEROES.length]! })} />
          <Button key="settings-motion" label={profile.motion ? 'Motion on' : 'Motion off'} plain onPress={() => setProfile($, { motion: !profile.motion })} />
          <Button key="settings-sound" label={isSoundOn ? 'Chimes on' : 'Chimes off'} plain onPress={async () => { const result = await runHavenCommand($, 'sound'); $.ui.toast(result.text) }} />
        </Box>
      </Box>
      <Box flexDirection="column" borderStyle="single" borderColor="#806d49" paddingX={1}>
        <Text color="#e0c782" weight="semibold">TOKEN-FREE PREVIEW</Text>
        <Text size="caption" color="#b9c3ac">Sample scenes never call tools or write to your work log.</Text>
        <Box gap={1}>
          {DEMO_MODES.map(mode => <Button key={`demo-${mode}`} label={`${demo === mode ? '◆ ' : ''}${mode}`} plain onPress={async () => { await update($, demoMode, () => mode); await setProfile($, { view: 'world' }) }} />)}
          {demo && <Button key="demo-off" label="Return live" plain onPress={async () => { await update($, demoMode, () => null); await setProfile($, { view: 'world' }) }} />}
        </Box>
      </Box>
      <Box flexDirection="column" borderStyle="single" borderColor="#536b60" paddingX={1}>
        <Text color="#e0c782" weight="semibold">DIAGNOSTICS · Patchhaven {diagnostics}</Text>
        <Text size="caption" color="#b9c3ac" wrap="truncate-end">Last saved event: {latest ? `${eventText(latest)} · ${new Date(latest.at).toLocaleTimeString()}` : 'none yet'}</Text>
        <Text size="caption" color="#b9c3ac">{home.landmarks.length}/{LANDMARKS.length} landmarks · {runningCrew.length} background workers · /haven diagnostics</Text>
      </Box>
      {crewPanel}
    </Box>
  }

  if (profile?.view === 'journal' && home) {
    const visits = [home.run, ...home.history]
    const visit = visits[home.journalIndex] ?? home.run
    const earnedNames = LANDMARKS.filter(m => home.landmarks.some(l => l.id === m.id)).map(m => m.name)
    const nextLandmark = LANDMARKS.find(m => !home.landmarks.some(l => l.id === m.id))
    const recentEvents = [...visit.events].reverse().slice(0, 12)
    return <Box flexDirection="column" gap={1}>
      {header}{navigation}
      <Text weight="semibold" color="#dfc68b">FIELD LOG · {home.journalIndex === 0 ? 'This visit' : new Date(visit.startedAt).toLocaleString()}</Text>
      <Text size="caption">{visit.totals.edits} edits · {visit.totals.quests} quests · {visit.totals.checks} checks · {visit.totals.crew} crew · +{visit.totals.xp} XP</Text>
      {home.lastRecap && home.journalIndex === 0 && <Box flexDirection="column" borderStyle="single" borderColor="#806d49" paddingX={1}>
        <Text color="#e0c782" weight="semibold">LAST FIELD REPORT</Text>
        <Text size="caption" wrap="truncate-end">{recapText(home.lastRecap)}</Text>
        {!!home.lastRecap.files.length && <Text size="caption" color="#b9c3ac" wrap="truncate-end">Files: {home.lastRecap.files.slice(-4).join(' · ')}</Text>}
      </Box>}
      <Box flexDirection="column" borderStyle="single" borderColor="#617b70" paddingX={1}>
        <Text color="#dfc68b">LANDMARKS · {home.landmarks.length}/{LANDMARKS.length}</Text>
        <Text size="caption" color="#b9d3b2" wrap="truncate-end">{earnedNames.length ? earnedNames.join(' · ') : 'The camp is waiting for its first mark.'}</Text>
        {nextLandmark && <Text size="caption" color="#b9c3ac" wrap="truncate-end">Next: {nextLandmark.name} · {nextLandmark.goal}</Text>}
      </Box>
      <Box gap={1}>
        <Button key="visit-newer" label="← Newer" plain dimColor={home.journalIndex === 0} onPress={() => update($, haven, s => s ? { ...s, journalIndex: Math.max(0, s.journalIndex - 1) } : s).then(() => undefined)} />
        <Button key="visit-older" label="Older →" plain dimColor={home.journalIndex >= visits.length - 1} onPress={() => update($, haven, s => s ? { ...s, journalIndex: Math.min(visits.length - 1, s.journalIndex + 1) } : s).then(() => undefined)} />
        <Button key="visit-replay" label="Watch visit" plain onPress={async () => { const result = await runHavenCommand($, 'replay'); if (result.text !== 'Patchhaven opened.') $.ui.toast(result.text) }} />
      </Box>
      {!visit.events.length && <Text color="#b9c3ac">Your journal begins when Claude reads or edits a file. Nothing to claim or manage.</Text>}
      {recentEvents.map(event => <Text key={`beat-${event.seq}`} size="caption" color={event.kind === 'check' && !event.ok ? '#e6a18b' : '#d6d8c8'} wrap="truncate-end">{new Date(event.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {eventText(event)}</Text>)}
      <Text color="#b9c3ac" size="caption">Latest 24 visits · up to 48 recorded beats per visit. Landmarks stay earned.</Text>
      {crewPanel}
    </Box>
  }

  const replayNotice = playback && <Box flexDirection="column" borderStyle="single" borderColor="#9eb9b0" paddingX={1}>
    <Text color="#bcdbd1">{home?.replay?.finished ? 'Replay finished' : 'Recorded visit'} · {(home?.replay?.index ?? 0) + 1}/{playback.run.events.length}</Text>
    <Text size="caption">{eventText(playback.event)}</Text>
    <Button key="return-live" label="Return to live work" plain onPress={async () => { await runHavenCommand($, 'live') }} />
  </Box>

  // The terminal has no real Svg: its table stands one in that draws only the alt text.
  // Who is where, doing what: the map's facts as words, for the terminal and the map's alt text.
  const bugList = fixture ? fixture.mobs : playback ? [] : await read($, mobs)
  const field = [{ id: '0', who: profile?.name ?? 'Claude' }, ...runningCrew.map(agent => ({ id: String(agent.index), who: agent.name || agent.type || `Agent ${agent.index}` }))].map(({ id, who }) => {
    const act = acts[id] ?? { tool: '', file: id === '0' ? (turn ? '#hall' : '#inn') : '#crew', at: Date.now(), isActive: false, isEdit: false }
    const label = id === '0' && !turn ? 'resting' : labelFor(act, waiting[id] !== undefined, id !== '0' && runningIndexes.has(id), id === '0' && turn).toLowerCase()
    return { id, text: `${who} · ${label} · ${whereOf(id, act)}`, isWaiting: waiting[id] !== undefined }
  })
  const bugText = looseBugs ? `${looseBugs} bug${looseBugs === 1 ? '' : 's'} loose from failing checks · a passing check squashes ${looseBugs === 1 ? 'it' : 'them'}` : ''

  if (!Svg) {
    return (
      <Box flexDirection="column" gap={1}>
        {header}
        {navigation}
        <Box flexDirection="column">
          <Text weight="semibold" color="#dfc68b">IN THE FIELD</Text>
          {field.map(line => <Text key={`field-${line.id}`} color={line.isWaiting ? '#f0d17d' : line.id === '0' ? '#e0c78f' : '#b9d3b2'} size="caption" wrap="truncate-end">{line.isWaiting ? '? ' : '◆ '}{line.text}</Text>)}
          {bugText && <Text color="#f0a28f" size="caption" wrap="truncate-end">✶ {bugText}</Text>}
        </Box>
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

  const width = renderWidth / zoom
  let rooms = fixture ? fixture.rooms : roomsOf(touched, playback ? {} : git, Object.values(acts).map(a => a.file))
  if (!fixture) rooms = rooms.map(room => {
    const firstPath = room.desks[0]?.path ?? ''
    const relative = relativeFile(root, firstPath) ?? firstPath
    const cut = relative.lastIndexOf('/')
    const key = room.name === 'Forge' ? '#forge' : cut < 0 ? 'root' : relative.slice(0, cut).toLowerCase()
    return { ...room, key, slot: home?.siteSlots[key] }
  })
  const backgroundAgentIndexes = !playback && !liveTurn ? [...runningIndexes] : []
  const focusActivity = acts[focusAgentId] ?? acts['0']
  const focusPath = focusAgentId !== '0' ? focusActivity?.file : liveTurn ? acts[0]?.file : runningCrew.map(a => acts[String(a.index)]?.file).find(file => file && !file.startsWith('#')) ?? acts[0]?.file
  if (profile?.view === 'focus') {
    const focusedRoom = rooms.find(r => r.desks.some(d => d.path === focusPath))
    rooms = focusedRoom ? [focusedRoom] : focusPath?.startsWith('#') ? [] : rooms.slice(0, 1)
  }
  const sceneKey = `${profile?.view}:${focusAgentId}:${playback?.run.id ?? 'live'}:${profile?.size ?? 'auto'}:${Math.round(width)}:${demo ?? 'live'}`
  if (lastSceneKey !== sceneKey) { lastSpots = {}; lastSceneKey = sceneKey }
  const questStatus = fixture?.questStatus ?? (await read($, questState)).status
  const drawn = drawRooms({
    haven: home ? { hero: home.profile.hero, landmarks: home.landmarks, motion: home.profile.motion, size: home.profile.size, title: home.profile.title } : undefined,
    focusAgent: profile?.view === 'focus' ? focusAgentId : undefined,
    backgroundAgents: playback ? [] : backgroundAgentIndexes,
    crew: roster,
    crewTotal: runningCrew.length,
    siteSlots: home?.siteSlots,
    questStatus,
    demo: demo ?? undefined,
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
    mobs: bugList,
    failure: failed ?? undefined,
    stoppedAt: playback ? undefined : (await read($, stoppedAt)) ?? undefined,
    bank: playback ? undefined : banked ?? undefined,
  })
  lastSpots = drawn.spots

  return (
    <Box flexDirection="column" gap={1}>
      {header}
      {navigation}
      {replayNotice}
      {/* Drawn as an image, not interactive: an interactive Svg is a frame
          the app rebuilds on every redraw, which flashed white. Its SMIL
          animations run the same either way. Scaled to the pane's width: the
          narrower the scene came out, the closer the zoom. */}
      <Svg key="scene" source={drawn.svg} width={renderWidth} height={Math.round((drawn.height * renderWidth) / drawn.width)} alt={`Patchhaven${playback ? ' recorded visit' : ''}${demo ? ` ${demo} sample scene` : ''}: ${field.map(line => line.text).join('. ')}.${bugText ? ` ${bugText}.` : ''}`} />
      {!turn && !playback && !demo && home?.lastRecap && <Box flexDirection="column" borderStyle="single" borderColor="#806d49" paddingX={1}>
        <Text color="#e0c782" weight="semibold">LAST FIELD REPORT · {recapText(home.lastRecap)}</Text>
        {home.lastRecap.files.length > 0 && <Text size="caption" color="#b9c3ac" wrap="truncate-end">{home.lastRecap.files.slice(-4).join(' · ')}</Text>}
      </Box>}
      {crewPanel}
    </Box>
  )
}
