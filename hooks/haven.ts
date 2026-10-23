// Patchhaven's small, model-free progression model. Records contain metadata,
// never prompts, source text, tool arguments or raw command output.
export type Hero = 'wizard' | 'knight' | 'ranger' | 'smith'
export type HavenView = 'world' | 'focus' | 'journal'
export type HavenProfile = { name: string; hero: Hero; view: HavenView; motion: boolean }
export const HEROES: readonly Hero[] = ['wizard', 'knight', 'ranger', 'smith']
export const HERO_COLORS = ['#bba6df', '#e4b18a', '#93c9b4', '#dec17c'] as const
export const DEFAULT_PROFILE: HavenProfile = { name: 'Claude', hero: 'wizard', view: 'world', motion: true }
export type EventKind = 'read' | 'edit' | 'quest' | 'check' | 'commit' | 'crew'
export type HavenEvent = { seq: number; kind: EventKind; at: number; count: number; xp: number; file?: string; ok?: boolean; role?: string; ref?: string }
export type HavenTotals = { edits: number; quests: number; checks: number; commits: number; crew: number; xp: number }
export type HavenRun = {
  version: 2; id: string; root: string; name: string; startedAt: number; updatedAt: number; seq: number
  totals: HavenTotals; events: HavenEvent[]; places: string[]
}
export type Landmark = { id: string; at: number; runId: string; evidence: string; file?: string; ref?: string }
export type HavenState = {
  profile: HavenProfile; run: HavenRun; history: HavenRun[]; landmarks: Landmark[]
  journalIndex: number; replay?: { runId: string; index: number; finished: boolean }; saveError: boolean
}
export const MAX_EVENTS = 48
export const MAX_VISITS = 24
const ZERO: HavenTotals = { edits: 0, quests: 0, checks: 0, commits: 0, crew: 0, xp: 0 }
const KINDS: EventKind[] = ['read', 'edit', 'quest', 'check', 'commit', 'crew']
const number = (x: unknown) => typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.floor(x) : 0
const clean = (x: unknown, limit = 160) => typeof x === 'string' ? x.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, limit) : ''

export function profileOf(value: unknown): HavenProfile {
  const p = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return {
    name: clean(p.name, 24).trim() || 'Claude',
    hero: HEROES.includes(p.hero as Hero) ? p.hero as Hero : 'wizard',
    view: ['world', 'focus', 'journal'].includes(String(p.view)) ? p.view as HavenView : 'world',
    motion: p.motion !== false,
  }
}

// Windows paths are case insensitive. Preserve case on Unix so two distinct
// project directories there never share a settlement.
export function projectRoot(path: string): string {
  let root = path.replace(/\\/g, '/')
  if (!/^[a-z]:\/$/i.test(root)) root = root.replace(/\/+$/, '') || '/'
  if (/^[a-z]:/i.test(root) || root.startsWith('//')) root = root.toLowerCase()
  return root
}
export const projectKey = (root: string) => encodeURIComponent(projectRoot(root))
export const runPrefix = (root: string) => `haven.run/${projectKey(root)}/`
export const unlockKey = (root: string, id: string) => `haven.unlock/${projectKey(root)}/${id}`

export function relativeFile(root: string, path: string): string | undefined {
  if (typeof path !== 'string') return undefined
  const base = projectRoot(root)
  let file = path.replace(/\\/g, '/')
  const windows = /^[a-z]:/i.test(base) || base.startsWith('//')
  const cmp = windows ? file.toLowerCase() : file
  const prefix = base.endsWith('/') ? base : `${base}/`
  if (cmp.startsWith(prefix)) file = file.slice(prefix.length)
  else if (/^(?:[a-z]:|\/)/i.test(file)) return undefined
  const parts: string[] = []
  for (const part of file.split('/')) {
    if (part === '..') { if (!parts.length) return undefined; parts.pop() }
    else if (part && part !== '.') parts.push(part)
  }
  return parts.length ? clean(parts.join('/'), 220) : undefined
}
export function absoluteFile(root: string, path: string): string | undefined {
  const file = relativeFile(root, path)
  if (!file) return undefined
  const base = projectRoot(root)
  return `${base.endsWith('/') ? base : `${base}/`}${file}`
}

export function newRun(root: string, now: number, id = `${now}-${Math.random().toString(36).slice(2, 10)}`): HavenRun {
  const normal = projectRoot(root)
  return { version: 2, id, root: normal, name: normal.split('/').pop() || 'Home', startedAt: now, updatedAt: now, seq: 0, totals: { ...ZERO }, events: [], places: [] }
}

// Validate saves at the boundary: a damaged visit is skipped, not allowed to
// break startup or silently change the active project's identity.
export function runOf(value: unknown, root: string): HavenRun | undefined {
  if (!value || typeof value !== 'object') return undefined
  const r = value as HavenRun
  if (r.version !== 2 || typeof r.id !== 'string' || !/^[\w-]{1,80}$/.test(r.id) || r.root !== projectRoot(root)) return undefined
  if (!r.totals || !Array.isArray(r.events) || !Array.isArray(r.places)) return undefined
  const events = (r.events as unknown[]).filter((value): value is Record<string, unknown> =>
    Boolean(value && typeof value === 'object' && KINDS.includes((value as Record<string, unknown>).kind as EventKind)),
  ).slice(-MAX_EVENTS).map(e => ({
    seq: number(e.seq), kind: e.kind as EventKind, at: number(e.at), count: Math.max(1, number(e.count)), xp: number(e.xp),
    file: typeof e.file === 'string' ? relativeFile(root, e.file) : undefined,
    ok: typeof e.ok === 'boolean' ? e.ok : undefined,
    role: typeof e.role === 'string' ? clean(e.role, 20) : undefined,
    ref: typeof e.ref === 'string' && /^[0-9a-f]{7,40}$/i.test(e.ref) ? e.ref : undefined,
  }))
  return {
    ...newRun(root, number(r.startedAt), r.id), updatedAt: number(r.updatedAt), seq: number(r.seq), events,
    totals: Object.fromEntries(Object.keys(ZERO).map(k => [k, number(r.totals[k as keyof HavenTotals])])) as HavenTotals,
    places: [...new Set(r.places.filter(p => typeof p === 'string').map(p => relativeFile(root, p)).filter((p): p is string => Boolean(p)))].slice(-24),
  }
}

export function appendEvent(run: HavenRun, event: Omit<HavenEvent, 'seq'>): HavenRun {
  const next = { ...run, seq: run.seq + 1, updatedAt: event.at, totals: { ...run.totals }, places: [...run.places] }
  const count = Math.max(1, number(event.count))
  if (event.kind === 'edit') {
    next.totals.edits += count
    next.totals.xp += number(event.xp)
    if (event.file) next.places = [...next.places.filter(p => p !== event.file), event.file].slice(-24)
  } else if (event.kind === 'read' && event.file) next.places = [...next.places.filter(p => p !== event.file), event.file].slice(-24)
  else if (event.kind === 'quest') next.totals.quests++
  else if (event.kind === 'commit') next.totals.commits++
  else if (event.kind === 'crew') next.totals.crew++
  else if (event.kind === 'check' && event.ok) next.totals.checks++
  // A burst of edits to the same file is one readable journal entry; totals
  // still count every edit. Replay visits files instead of dozens of keystrokes.
  const last = run.events[run.events.length - 1]
  next.events = last?.kind === 'edit' && event.kind === 'edit' && last.file === event.file && event.at - last.at < 30_000
    ? [...run.events.slice(0, -1), { ...event, count: last.count + count, xp: last.xp + event.xp, seq: next.seq }]
    : [...run.events, { ...event, count, seq: next.seq }].slice(-MAX_EVENTS)
  return next
}

export function totalsOf(runs: readonly HavenRun[]): HavenTotals {
  return runs.reduce((out, run) => {
    for (const k of Object.keys(ZERO) as (keyof HavenTotals)[]) out[k] += run.totals[k]
    return out
  }, { ...ZERO })
}

export const LANDMARKS = [
  { id: 'garden', name: 'Patch Garden', title: 'Patchmaker', goal: 'Land your first successful edit', metric: 'edits', target: 1 },
  { id: 'board', name: 'Guild Noticeboard', title: 'Questkeeper', goal: 'Finish a plan', metric: 'quests', target: 1 },
  { id: 'tower', name: 'Signal Tower', title: 'Proofkeeper', goal: 'Record a successful test command', metric: 'checks', target: 1 },
  { id: 'banner', name: 'Shipping Banner', title: 'Shipwright', goal: 'Record a successful Git commit', metric: 'commits', target: 1 },
  { id: 'camp', name: 'Crew Camp', title: 'Guildkeeper', goal: 'Work with a subagent', metric: 'crew', target: 1 },
  { id: 'workshop', name: 'Grand Workshop', title: 'Master Crafter', goal: 'Land 25 edits across recent visits', metric: 'edits', target: 25 },
] as const

export function eventText(e: HavenEvent): string {
  switch (e.kind) {
    case 'read': return `Read ${e.file ?? 'an external file'}`
    case 'edit': return `${e.count === 1 ? 'Edited' : `${e.count} edits to`} ${e.file ?? 'an external file'} · +${e.xp} XP`
    case 'quest': return `Plan completed · ${e.count} step${e.count === 1 ? '' : 's'}`
    case 'check': return `Test command ${e.ok ? 'succeeded' : 'failed'}`
    case 'commit': return `Git commit ${e.ref ?? 'recorded'} · ${e.count} file${e.count === 1 ? '' : 's'}`
    case 'crew': return `${e.role ?? 'Crew member'} joined the work`
  }
}

export function earnedLandmarks(state: HavenState, run: HavenRun): Landmark[] {
  const totals = totalsOf([run, ...state.history])
  const event = run.events[run.events.length - 1]
  return LANDMARKS.filter(m => !state.landmarks.some(l => l.id === m.id) && totals[m.metric] >= m.target).map(m => ({
    id: m.id, at: run.updatedAt, runId: run.id, evidence: event ? eventText(event) : m.goal, file: event?.file, ref: event?.ref,
  }))
}
export function settlementOf(landmarks: readonly Landmark[]) {
  const count = landmarks.length
  return { stage: count === 0 ? 'Campsite' : count < 3 ? 'Homestead' : count < 6 ? 'Village' : 'Haven', title: [...LANDMARKS].reverse().find(m => landmarks.some(l => l.id === m.id))?.title ?? 'Wayfinder' }
}

export function replayFrame(state: HavenState) {
  const run = [state.run, ...state.history].find(r => r.id === state.replay?.runId)
  if (!run || !state.replay) return undefined
  const events = run.events.slice(0, state.replay.index + 1)
  const event = events[events.length - 1]
  return event ? { run, event, files: [...new Set(events.filter(e => e.file).map(e => e.file!))].slice(-12) } : undefined
}
