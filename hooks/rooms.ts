import type { Activity, Bank, Change, CrewAgent, Drop, Failure, Splat, Step, Touch } from '../types'
import type { Hero, Landmark } from './haven'
import { drawAtlas } from './atlas'

export type Desk = { path: string; name: string; touch: Touch; change?: Change }
export type Room = { key?: string; slot?: number; name: string; desks: Desk[] }

export type Scene = {
  haven?: { hero: Hero; landmarks: readonly Landmark[]; motion: boolean; size?: 'auto' | 'comfortable' | 'large'; title?: string }
  backgroundAgents?: readonly string[]
  crew?: readonly CrewAgent[]
  crewTotal?: number
  siteSlots?: Readonly<Record<string, number>>
  questStatus?: string
  demo?: string
  rooms: readonly Room[]
  activity: Readonly<Record<string, Activity>>
  from: Readonly<Record<string, { x: number; y: number }>>
  now: number
  isTurn: boolean
  width: number
  paneWidth: number
  steps: readonly Step[]
  drops: Readonly<Record<string, Drop>>
  levelUp?: { level: number; at: number }
  spawns: Readonly<Record<string, number>>
  bank?: Bank
  splats: Readonly<Record<string, Splat>>
  departs: Readonly<Record<string, number>>
  compactAt?: number
  asking: Readonly<Record<string, number>>
  failure?: Failure
  stoppedAt?: number
}

// New files are patches in the Forge district; existing files stay grouped by
// their parent folder so each directory has a stable place on the live map.
export const FORGE = 'Forge'
const MAX_ROOMS = 6
const MAX_DESKS = 8

export function roomsOf(touched: readonly Touch[], changes: Readonly<Record<string, Change>>, important: readonly string[] = []): Room[] {
  const rooms = new Map<string, Room>()
  for (const touch of touched) {
    const cut = touch.path.lastIndexOf('/')
    const dir = touch.isNew ? '#' + FORGE : cut < 0 ? 'root' : touch.path.slice(0, cut)
    const key = dir.toLowerCase()
    const room = rooms.get(key) ?? { key, name: touch.isNew ? FORGE : dir.slice(dir.lastIndexOf('/') + 1) || dir, desks: [] }
    room.desks.push({
      path: touch.path,
      name: cut < 0 ? touch.path : touch.path.slice(cut + 1),
      touch,
      change: changes[touch.path.toLowerCase()],
    })
    rooms.set(key, room)
  }

  const roomPath = (room: Room) => {
    const path = room.desks[0]?.path ?? ''
    const cut = path.lastIndexOf('/')
    return (cut < 0 ? 'root' : path.slice(0, cut)).toLowerCase()
  }
  const ordered = [...rooms.values()].sort((a, b) => Number(b.name === FORGE) - Number(a.name === FORGE) || roomPath(a).localeCompare(roomPath(b)))
  const duplicates = new Map<string, number>()
  for (const room of ordered) duplicates.set(room.name.toLowerCase(), (duplicates.get(room.name.toLowerCase()) ?? 0) + 1)
  for (const room of ordered) {
    if (room.name !== FORGE && (duplicates.get(room.name.toLowerCase()) ?? 0) > 1) {
      const directory = roomPath(room).split('/').filter(Boolean)
      room.name = directory.slice(-2).join('/') || room.name
    }
  }
  const priority = new Set(important)
  const selected = new Set([...new Set([...ordered.filter(room => room.desks.some(desk => priority.has(desk.path))), ...ordered])].slice(0, MAX_ROOMS))

  return ordered.filter(room => selected.has(room)).map(room => {
    const desks = new Set([...new Set([...room.desks.filter(desk => priority.has(desk.path)), ...room.desks])].slice(0, MAX_DESKS))
    return { ...room, desks: room.desks.filter(desk => desks.has(desk)) }
  })
}

export function drawRooms(scene: Scene): { svg: string; width: number; height: number; spots: Record<string, { x: number; y: number }> } {
  return drawAtlas(scene)
}
