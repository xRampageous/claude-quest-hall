import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'
import { appendEvent, earnedLandmarks, LANDMARKS, MAX_VISITS, newRun, profileOf, projectRoot, relativeFile, runOf, runPrefix, skillGains, unlockKey, ZERO_SKILLS } from './haven'
import type { HavenEvent, HavenProfile, HavenState, Landmark, VisitRecap } from './haven'

export const haven = atom({ plugin: 'task-board', key: 'haven' } as const, null)
// Tool calls can finish together. Serialize the local reducer and its writes;
// separate session keys keep other Claude sessions from replacing this visit.
let pending: Promise<unknown> = Promise.resolve()
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const task = pending.then(fn, fn)
  pending = task.catch(() => undefined)
  return task
}
async function save($: EngineInterface, key: string, value: unknown) {
  try { await $.store.set(key, value) }
  catch { await update($, haven, s => s ? { ...s, saveError: true } : s) }
}

export function initHaven($: EngineInterface, fresh = false) {
  return serial(async () => {
    const root = projectRoot(await $.session.cwd())
    const before = await read($, haven)
    const run = !fresh && before?.run.root === root ? runOf(before.run, root) ?? newRun(root, Date.now()) : newRun(root, Date.now())
    const currentKey = `${runPrefix(root)}${run.id}`
    const keys = (await $.store.keys().catch(() => [] as string[])).filter(k => k.startsWith(runPrefix(root)) && k !== currentKey).sort().reverse()
    const history = (await Promise.all(keys.slice(0, MAX_VISITS - 1).map(async key => runOf(await $.store.get(key).catch(() => undefined), root))))
      .filter((r): r is NonNullable<typeof r> => Boolean(r)).sort((a, b) => b.updatedAt - a.updatedAt)
    const savedSkills = await $.store.get(`haven.skills/${encodeURIComponent(root)}`).catch(() => undefined)
    const skills = savedSkills && typeof savedSkills === 'object'
      ? Object.fromEntries(Object.keys(ZERO_SKILLS).map(k => [k, Math.max(0, Math.floor(Number((savedSkills as Record<string, unknown>)[k]) || 0))])) as typeof ZERO_SKILLS
      : [...history, run].reduce((sum, item) => {
          for (const key of Object.keys(sum) as (keyof typeof sum)[]) sum[key] += item.skills?.[key] ?? 0
          return sum
        }, { ...ZERO_SKILLS })
    const savedSites = await $.store.get(`haven.sites/${encodeURIComponent(root)}`).catch(() => undefined)
    const siteSlots: Record<string, number> = {}
    if (savedSites && typeof savedSites === 'object') {
      for (const [key, value] of Object.entries(savedSites)) {
        const slot = Number(value)
        if (key && Number.isInteger(slot) && slot >= 0 && slot < 6) siteSlots[key.toLowerCase()] = slot
      }
    }
    if (siteSlots['#forge'] === undefined) siteSlots['#forge'] = 0
    const knownDirs = [...history, run].flatMap(item => [...item.places, ...item.events.map(event => event.file ?? '')])
      .map(file => { const cut = file.lastIndexOf('/'); return (cut < 0 ? 'root' : file.slice(0, cut)).toLowerCase() }).filter(Boolean)
    for (const dir of [...new Set(knownDirs)]) {
      if (siteSlots[dir] !== undefined) continue
      const used = new Set(Object.values(siteSlots))
      const free = [1, 2, 3, 4, 5].find(slot => !used.has(slot))
      let hash = 0
      for (const char of dir) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
      siteSlots[dir] = free ?? 1 + (hash % 5)
    }
    const rawRecap = await $.store.get(`haven.recap/${encodeURIComponent(root)}`).catch(() => undefined)
    const lastRecap = rawRecap && typeof rawRecap === 'object' ? rawRecap as VisitRecap : undefined
    const landmarks = (await Promise.all(LANDMARKS.map(async m => {
      const value = await $.store.get(unlockKey(root, m.id)).catch(() => undefined)
      if (!value || typeof value !== 'object') return undefined
      const saved = value as Partial<Landmark>
      const ref = typeof saved.ref === 'string' && /^[0-9a-f]{7,40}$/i.test(saved.ref) ? saved.ref : undefined
      return saved.id === m.id && typeof saved.at === 'number' && Number.isFinite(saved.at) && typeof saved.evidence === 'string'
        ? {
            id: m.id, at: saved.at, runId: typeof saved.runId === 'string' ? saved.runId.slice(0, 80) : '',
            evidence: saved.evidence.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 240),
            file: typeof saved.file === 'string' ? relativeFile(root, saved.file) : undefined, ref,
          } : undefined
    }))).filter((l): l is Landmark => Boolean(l))
    const profile = profileOf(await $.store.get('haven.profile').catch(() => undefined))
    const state: HavenState = { profile, run, history, landmarks, skills, siteSlots, lastRecap, journalIndex: 0, saveError: before?.saveError ?? false }
    await update($, haven, () => state)
    await $.store.set(`haven.sites/${encodeURIComponent(root)}`, siteSlots).catch(() => undefined)
    // Detailed visits are bounded. Earned landmarks and their evidence have
    // their own permanent keys, so retiring a visit never removes a building.
    for (const key of keys.slice(MAX_VISITS - 1)) await $.store.delete(key).catch(() => undefined)
    return state
  })
}

export function saveRecap($: EngineInterface, recap: VisitRecap) {
  return serial(async () => {
    const state = await read($, haven)
    if (!state) return
    await update($, haven, s => s ? { ...s, lastRecap: recap } : s)
    await save($, `haven.recap/${encodeURIComponent(state.run.root)}`, recap)
  }).catch(() => undefined)
}

export function recordHaven($: EngineInterface, event: Omit<HavenEvent, 'seq' | 'at' | 'count' | 'xp'> & { count?: number; xp?: number }) {
  return serial(async () => {
    const state = await read($, haven)
    if (!state) return
    const gained = skillGains(state.run, { ...event, at: Date.now(), count: event.count ?? 1, xp: event.xp ?? 0 })
    const run = appendEvent(state.run, gained.event)
    const earned = earnedLandmarks(state, run)
    const skills = { ...state.skills }
    if (gained.event.skill) skills[gained.event.skill] = (skills[gained.event.skill] ?? 0) + (gained.event.skillXp ?? 0)
    const siteSlots = { ...state.siteSlots }
    if (event.file) {
      const cut = event.file.lastIndexOf('/')
      const dir = (cut < 0 ? 'root' : event.file.slice(0, cut)).toLowerCase()
      if (siteSlots[dir] === undefined) {
        const occupied = new Set(Object.values(siteSlots))
        const free = [1, 2, 3, 4, 5].find(slot => !occupied.has(slot))
        let hash = 0
        for (const char of dir) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
        siteSlots[dir] = free ?? 1 + (hash % 5)
      }
    }
    await update($, haven, s => s ? { ...s, run, skills, siteSlots, landmarks: [...s.landmarks, ...earned] } : s)
    await save($, `${runPrefix(run.root)}${run.id}`, run)
    await save($, `haven.skills/${encodeURIComponent(run.root)}`, skills)
    await save($, `haven.sites/${encodeURIComponent(run.root)}`, siteSlots)
    for (const landmark of earned) await save($, unlockKey(run.root, landmark.id), landmark)
  }).catch(() => undefined) // Progress recording must never fail a successful tool.
}

export async function setProfile($: EngineInterface, patch: Partial<HavenProfile>) {
  return serial(async () => {
    const state = await read($, haven)
    if (!state) return
    const profile = profileOf({ ...state.profile, ...patch })
    await update($, haven, s => s ? { ...s, profile } : s)
    await save($, 'haven.profile', profile)
  })
}

export async function advanceReplay($: EngineInterface) {
  const state = await read($, haven)
  if (!state?.replay || state.replay.finished) return
  const run = [state.run, ...state.history].find(r => r.id === state.replay!.runId)
  if (!run) return
  await update($, haven, s => s?.replay ? { ...s, replay: { ...s.replay, index: Math.min(s.replay.index + 1, run.events.length - 1), finished: s.replay.index >= run.events.length - 2 } } : s)
}
