import type { Activity, Bank, Change, Drop, Failure, Splat, Step, Touch } from '../types'
import { CHAIR, CHARACTERS, DESK, ICONS, MONITOR, PLANT, ROOMS } from './art'
import { HEROES } from './haven'
import type { Hero, Landmark } from './haven'
import { homestead } from './homestead'

// The Patchhaven scene: a compact settlement above a live map of folder rooms.
// Agents move between file desks as they read, edit and run tools. Drawn as
// one SVG; SMIL runs every animation (typing, breathing, blinking, walking,
// thinking dots, the bounce of a stuck agent), so nothing needs a redraw.

export type Desk = { path: string; name: string; touch: Touch; change?: Change }
export type Room = { name: string; desks: Desk[] }

const AGENT_COLORS = ['#D97757', '#22d3ee', '#e879f9', '#4ade80', '#facc15', '#60a5fa']
const READ_COLOR = '#a78bfa'
const GIT_COLORS: Record<Change['code'], string> = { M: '#e2c08d', A: '#73c991', U: '#73c991', D: '#f14c4c', R: '#4fc1ff' }
const GOLD = '#d9bd78'

const GAP = 10
const WALL = 22
// One desk's cell: the character, the desk in front of it, its name plate.
const DESK_W = 56
const DESK_H = 86
// Every character is drawn this tall, whatever its own size: a head taller
// than the desk is wide, so the desk hides only the legs.
const CHAR_H = 38
const FEET = 52
const MAX_ROOMS = 6
const MAX_DESKS = 8
const MAX_AGENTS = 4
// The narrowest a scene is drawn, which caps the close-up zoom.
const MIN_WIDTH = 150

// Claude's wizard: where its eyes are on its own 29x59 grid, for blinking.
const WIZARD_EYES = [12, 16]
const WIZARD_EYE_ROW = 23
const WIZARD_SKIN = '#fac591'

// A desk's name plate holds 11 characters a line. A longer name wraps at a
// capital, dot or dash where it can; a second line still too long ends in "…".
const PLATE_CHARS = 11
function nameLines(name: string): string[] {
  if (name.length <= PLATE_CHARS) return [name]
  let cut = PLATE_CHARS
  for (let i = PLATE_CHARS; i >= 4; i--) {
    if (/[A-Z._-]/.test(name[i] ?? '')) {
      cut = i
      break
    }
  }

  return [name.slice(0, cut), clip(name.slice(cut), PLATE_CHARS)]
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

// The same folder always gets the same theme.
function themeOf(name: string): number {
  let h = 0
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0

  return h % ROOMS.length
}

// Groups files in play by the folder that holds them: one room per folder.
// Files made this turn are not filed under their folder: they are crafted
// in the Forge, a room of their own.
export const FORGE = 'Forge'
const FORGE_THEME = 3

export function roomsOf(touched: readonly Touch[], changes: Readonly<Record<string, Change>>, important: readonly string[] = []): Room[] {
  const rooms = new Map<string, Room>()
  for (const t of touched) {
    const cut = t.path.lastIndexOf('/')
    const dir = t.isNew ? `#${FORGE}` : t.path.slice(0, cut)
    const room = rooms.get(dir.toLowerCase()) ?? { name: t.isNew ? FORGE : dir.slice(dir.lastIndexOf('/') + 1) || dir, desks: [] }
    room.desks.push({ path: t.path, name: t.path.slice(cut + 1), touch: t, change: changes[t.path.toLowerCase()] })
    rooms.set(dir.toLowerCase(), room)
  }

  // The Forge first: what is being made leads the scene.
  const ordered = [...rooms.values()]
    .sort((a, b) => Number(b.name === FORGE) - Number(a.name === FORGE))
  const priority = new Set(important)
  const selected = new Set([...new Set([...ordered.filter(r => r.desks.some(d => priority.has(d.path))), ...ordered])].slice(0, MAX_ROOMS))
  return ordered.filter(r => selected.has(r)).map(r => {
    const desks = new Set([...new Set([...r.desks.filter(d => priority.has(d.path)), ...r.desks])].slice(0, MAX_DESKS))
    return { ...r, desks: r.desks.filter(d => desks.has(d)) }
  })
}

// The Forge's furnace and anvil, 26 wide and 20 tall, their base at y: the
// furnace mouth glows and flickers.
function forgeCorner(x: number, y: number): string {
  return (
    `<g shape-rendering="crispEdges"><rect x="${x + 12}" y="${y - 20}" width="14" height="20" fill="#3a3530" stroke="#1b1b24" stroke-width="1"/>` +
    `<rect x="${x + 14}" y="${y - 22}" width="10" height="3" fill="#2a2622"/>` +
    `<rect x="${x + 15}" y="${y - 11}" width="8" height="8" fill="#ff7a1a"><animate attributeName="fill" values="#ff7a1a;#ffb347;#ff5a0a;#ff7a1a" dur="0.9s" repeatCount="indefinite"/></rect>` +
    `<rect x="${x}" y="${y - 7}" width="11" height="3" fill="#5d6b82" stroke="#1b1b24" stroke-width="0.8"/>` +
    `<rect x="${x + 3}" y="${y - 4}" width="5" height="4" fill="#45454a" stroke="#1b1b24" stroke-width="0.8"/></g>`
  )
}

const symbol = (id: string, s: { w: number; h: number }, inner: string) =>
  `<symbol id="${id}" viewBox="0 0 ${s.w} ${s.h}" shape-rendering="crispEdges">${inner}</symbol>`
const use = (id: string, x: number, y: number, w: number, h: number) =>
  `<use href="#${id}" x="${x}" y="${y}" width="${w}" height="${h}"/>`
type RoomPalette = { wall: string; wallLight: string; wallLine: string; floor: string; floorLight: string; floorLine: string; wood: string }
const ROOM_PALETTES: readonly RoomPalette[] = [
  { wall: '#53675b', wallLight: '#6e7c66', wallLine: '#40534a', floor: '#405449', floorLight: '#526758', floorLine: '#2e413b', wood: '#9a7951' },
  { wall: '#74624e', wallLight: '#8a7559', wallLine: '#5d5043', floor: '#55483d', floorLight: '#695747', floorLine: '#403931', wood: '#bf8b56' },
  { wall: '#4a6460', wallLight: '#628079', wallLine: '#384f4d', floor: '#385454', floorLight: '#486664', floorLine: '#294446', wood: '#b9905d' },
  { wall: '#65554b', wallLight: '#806456', wallLine: '#4b403d', floor: '#4e423a', floorLight: '#665344', floorLine: '#382f2d', wood: '#c18755' },
  { wall: '#49616a', wallLight: '#62808a', wallLine: '#354e58', floor: '#39515a', floorLight: '#4c6970', floorLine: '#2c414a', wood: '#b28c5d' },
  { wall: '#705c5a', wallLight: '#8a7169', wallLine: '#584848', floor: '#514546', floorLight: '#695453', floorLine: '#3b3339', wood: '#c09363' },
]

// Broad, low-contrast finishes give rooms depth without the old checkerboard
// texture. The same finish is reused consistently for each folder.
function materialPatterns(theme: number): string[] {
  const p = ROOM_PALETTES[theme]!
  return [
    `<pattern id="floor${theme}" width="40" height="20" patternUnits="userSpaceOnUse"><rect width="40" height="20" fill="${p.floor}"/>` +
      `<path d="M0 1H40M0 10H40M9 1V10M30 10V20" fill="none" stroke="${p.floorLine}" stroke-width="1" opacity=".62"/>` +
      `<path d="M3 4h5m8 0h8m6 4h7M3 14h10m7 3h8" fill="none" stroke="${p.floorLight}" stroke-width=".7" opacity=".4"/>` +
      `<path d="M1 2H39M1 11H39" fill="none" stroke="${p.floorLight}" stroke-width=".5" opacity=".22"/></pattern>`,
    `<pattern id="wall${theme}" width="32" height="22" patternUnits="userSpaceOnUse"><rect width="32" height="22" fill="${p.wall}"/>` +
      `<path d="M0 1H32M0 21H32M9 2v5m14-5v5M4 13h9m10 0h8" fill="none" stroke="${p.wallLine}" stroke-width="1" opacity=".54"/>` +
      `<path d="M2 3h5m17 5h6M15 17h8" fill="none" stroke="${p.wallLight}" stroke-width="1" opacity=".38"/>` +
      `<rect x="1" y="2" width="1" height="1" fill="${p.wood}" opacity=".5"/><rect x="29" y="16" width="1" height="1" fill="${p.wood}" opacity=".4"/></pattern>`,
  ]
}

function roomWindow(x: number, y: number, accent: string): string {
  return `<g shape-rendering="crispEdges"><rect x="${x}" y="${y}" width="20" height="14" fill="#1d2c32" stroke="#243035" stroke-width="1.5"/>` +
    `<rect x="${x + 2}" y="${y + 2}" width="16" height="10" fill="#356169"/>` +
    `<path d="M${x + 3} ${y + 3}h6v3H${x + 3}zM${x + 11} ${y + 3}h6v3h-6z" fill="#78a9a2" opacity=".7"/>` +
    `<path d="M${x + 10} ${y + 2}v10M${x + 2} ${y + 7}h16" stroke="#263e3c" stroke-width="1.5"/>` +
    `<rect x="${x - 1}" y="${y + 12}" width="22" height="2" fill="${accent}" opacity=".88"/></g>`
}

function wallKeepsake(x: number, y: number, style: number, p: RoomPalette, accent: string): string {
  if (style === 0) {
    return `<g shape-rendering="crispEdges"><rect x="${x}" y="${y + 2}" width="18" height="2" fill="${p.wood}"/>` +
      `<rect x="${x + 2}" y="${y + 4}" width="3" height="5" fill="#b9a16d" stroke="#392f2a" stroke-width=".6"/>` +
      `<rect x="${x + 8}" y="${y + 4}" width="3" height="4" fill="${accent}" stroke="#392f2a" stroke-width=".6"/>` +
      `<rect x="${x + 14}" y="${y + 4}" width="2" height="6" fill="#557c5c" stroke="#263b31" stroke-width=".6"/></g>`
  }
  if (style === 1) {
    return `<g shape-rendering="crispEdges"><rect x="${x + 2}" y="${y}" width="13" height="12" fill="#cdbb91" stroke="${p.wood}" stroke-width="1"/>` +
      `<rect x="${x + 4}" y="${y + 2}" width="8" height="1" fill="${accent}"/><rect x="${x + 4}" y="${y + 5}" width="7" height="1" fill="#8f8064"/>` +
      `<rect x="${x + 4}" y="${y + 8}" width="5" height="1" fill="#8f8064"/><circle cx="${x + 3}" cy="${y + 1}" r="1" fill="#d87865"/></g>`
  }
  return `<g shape-rendering="crispEdges"><path d="M${x + 3} ${y + 12}v-7l5-4l5 4v7z" fill="${p.wood}" stroke="#352f2b" stroke-width=".8"/>` +
    `<rect x="${x + 5}" y="${y + 6}" width="6" height="6" fill="${accent}"/><rect x="${x + 7}" y="${y + 8}" width="2" height="4" fill="#26383b"/>` +
    `<path d="M${x} ${y + 13}h17" stroke="${p.wood}" stroke-width="2"/></g>`
}

// Each room gets a timber frame, small view window and one quiet wall detail.
// Its folder plate stays in the top-right, clear of activity bubbles.
function room(id: string, x: number, y: number, w: number, h: number, theme: number, name: string): string {
  const t = ROOMS[theme]!
  const p = ROOM_PALETTES[theme]!
  const label = clip(name, 20)
  const plateW = label.length * 5.2 + 15
  const px = x + w - plateW - 4
  const hasWindow = name !== 'Patchboard' && w > plateW + 38
  const window = hasWindow ? roomWindow(x + 7, y + 4, t.accent) : ''
  const keepsakeX = x + (hasWindow ? 33 : 8)
  const keepsake = name !== 'Patchboard' && px - keepsakeX > 20
    ? wallKeepsake(keepsakeX, y + 4, theme % 3, p, t.accent)
    : ''

  return (
    `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath>` +
    `<rect x="${x + 2}" y="${y + 3}" width="${w}" height="${h}" fill="#071315" opacity=".52"/>` +
    `<g clip-path="url(#${id})"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#floor${theme})"/>` +
    `<rect x="${x}" y="${y}" width="${w}" height="${WALL}" fill="url(#wall${theme})"/>` +
    `<rect x="${x}" y="${y + WALL - 2}" width="${w}" height="3" fill="${p.wood}"/>` +
    `<rect x="${x}" y="${y + WALL + 1}" width="${w}" height="2" fill="${p.floorLine}" opacity=".8"/>` +
    `<rect x="${x + 2}" y="${y + 1}" width="${w - 4}" height="1" fill="${p.wallLight}" opacity=".65"/>` +
    `<path d="M${x + 2} ${y + h - 2}h${w - 4}" stroke="#182527" stroke-width="2" opacity=".8"/>` +
    window + keepsake + `</g>` +
    `<rect x="${x + .5}" y="${y + .5}" width="${w - 1}" height="${h - 1}" fill="none" stroke="#1a2527" stroke-width="2"/>` +
    `<rect x="${x + 2}" y="${y + 2}" width="${w - 4}" height="${h - 4}" fill="none" stroke="#b39a6d" stroke-width=".7" opacity=".72"/>` +
    `<rect x="${px}" y="${y + 4}" width="${plateW}" height="12" fill="#17272b" stroke="${t.accent}" stroke-width=".9"/>` +
    `<rect x="${px + 3}" y="${y + 7}" width="3" height="3" fill="${t.accent}"/>` +
    `<text x="${px + 9}" y="${y + 12}" font-size="8" font-weight="700" fill="#f1e5c7">${esc(label)}</text>`
  )
}

const QUEST = { pending: '#5a302b', in_progress: '#50380f', completed: '#1e4636' } as const
const HALL_THEME = 2
// Between turns Claude rests at the Inn, by the fire, until the next prompt.
// Shell commands, searches and outside tools are worked at the Terminal's
// rune console, in a room of its own that appears once something is run.
const TERMINAL = 'Terminal'
const TERMINAL_THEME = 0
const INN = 'Inn'
const INN_THEME = 5
const INN_W = 96
// How long after a turn ends the wizard dozes off by the fire, in seconds.
const DOZE_AFTER = 120

export type Scene = {
  haven?: { hero: Hero; landmarks: readonly Landmark[]; motion: boolean }
  backgroundAgents?: readonly string[]
  rooms: readonly Room[]
  activity: Readonly<Record<string, Activity>>
  from: Readonly<Record<string, { x: number; y: number }>>
  now: number
  isTurn: boolean
  width: number
  // How wide the pane draws the scene, in screen pixels: the quest board sizes
  // its text from it, so the text reads the same at any zoom.
  paneWidth: number
  steps: readonly Step[]
  drops: Readonly<Record<string, Drop>>
  // A level just reached, shown as a banner for a few seconds.
  levelUp?: { level: number; at: number }
  // When each subagent appeared, and the last commit's deposit.
  spawns: Readonly<Record<string, number>>
  bank?: Bank
  splats: Readonly<Record<string, Splat>>
  // When each finished subagent left, and when context was last compacted.
  departs: Readonly<Record<string, number>>
  compactAt?: number
  // Agents waiting on a permission prompt, from the app's own event.
  asking: Readonly<Record<string, number>>
  // The error the last turn died on, and when you last stopped one.
  failure?: Failure
  stoppedAt?: number
}

const SPLAT = { hit: '#b3201e', pass: '#2f8f2f', fail: '#b3201e', denied: '#5b6170' } as const

// A hitsplat as a game draws one: a blob with the number (or a tick or a
// cross for a test run) that pops in and fades.
function splat(sp: Splat, y: number): string {
  const text = sp.kind === 'hit' ? String(sp.damage) : sp.kind === 'pass' ? '✓' : sp.kind === 'denied' ? '✋' : '✗'
  return (
    `<g><animateTransform attributeName="transform" type="scale" values="0.4;1.15;1" dur="0.25s" fill="freeze" additive="sum"/>` +
    `<animate attributeName="opacity" values="1;1;0" keyTimes="0;0.75;1" dur="1.8s" fill="freeze"/>` +
    `<path d="M-7 ${y - 4}q0-4 4-4h6q4 0 4 4v3q0 4-4 4h-1l-2 2-2-2h-1q-4 0-4-4z" fill="${SPLAT[sp.kind]}" stroke="#1b1b24" stroke-width="1"/>` +
    `<text x="0" y="${y + 1.5}" font-size="7.5" font-weight="700" text-anchor="middle" fill="#fff">${text}</text></g>`
  )
}

// A straw training dummy on a post, 14 wide, its base at y; it shakes while hit.
function dummy(x: number, y: number): string {
  return (
    `<g><animateTransform attributeName="transform" type="rotate" values="0 ${x} ${y};-6 ${x} ${y};4 ${x} ${y};0 ${x} ${y}" dur="0.5s" repeatCount="indefinite"/>` +
    `<rect x="${x - 1}" y="${y - 26}" width="2" height="26" fill="#5a3a1e"/>` +
    `<rect x="${x - 7}" y="${y - 20}" width="14" height="2" fill="#5a3a1e"/>` +
    `<ellipse cx="${x}" cy="${y - 14}" rx="5" ry="7" fill="#d9b456" stroke="#1b1b24" stroke-width="0.8"/>` +
    `<circle cx="${x}" cy="${y - 24}" r="3.5" fill="#d9b456" stroke="#1b1b24" stroke-width="0.8"/>` +
    `<circle cx="${x}" cy="${y - 14}" r="2" fill="none" stroke="#b3201e" stroke-width="0.8"/></g>`
  )
}

// A stitched file archive, where commits are shelved rather than turned into loot.
function archiveFiles(x: number, y: number): string {
  return (
    `<g shape-rendering="crispEdges"><path d="M${x + 1} ${y + 4}h13v7H${x + 1}z" fill="#d3c49d" stroke="#263b39" stroke-width="1"/>` +
    `<path d="M${x + 4} ${y + 2}h13v8H${x + 4}z" fill="#a9bd9b" stroke="#263b39" stroke-width="1"/>` +
    `<path d="M${x + 2} ${y + 5}h13v7H${x + 2}z" fill="#c9b98f" stroke="#263b39" stroke-width="1"/>` +
    `<path d="M${x + 4} ${y + 7}h7m-7 2h5" stroke="#826e50" stroke-width=".8"/>` +
    `<path d="M${x + 13} ${y + 6}v5" stroke="#d87865" stroke-width="2"/></g>`
  )
}

export function drawRooms(scene: Scene): { svg: string; width: number; height: number; spots: Record<string, { x: number; y: number }> } {
  const { activity, from, now, isTurn, width: maxWidth, steps, drops, levelUp, spawns, bank, splats, departs, compactAt } = scene
  const backgroundAgents = new Set(scene.backgroundAgents ?? [])
  const hero = HEROES.indexOf(scene.haven?.hero ?? 'wizard')
  const cast = [0, 1, 2, 3].filter(i => i !== hero)
  // Where the chest sits, for the coins a commit sends into it.
  let chestAt = { x: 0, y: 0 }
  // Thinking at the start of a turn, before any tool:
  // the wizard studies the quest board in the hall.
  const claude = activity[0]
  // Only at the very start of a turn, before Claude has done anything: once
  // it is working, it thinks at its desk and visits the hall for the quests alone.
  const isPondering = isTurn && !claude
  // Between turns, Claude rests at the Inn while background agents remain at
  // their last file or the Terminal.
  const isResting = !isTurn
  const atTerminal = Object.entries(activity).filter(([k, a]) => a.file === '#terminal' && (!isResting || backgroundAgents.has(k))).map(([k]) => k)
  const rooms: readonly Room[] = isResting
    ? [{ name: INN, desks: [] }, ...(atTerminal.length ? [{ name: TERMINAL, desks: [] }] : []), ...scene.rooms]
    : atTerminal.length
      ? [...scene.rooms.filter(r => r.name === FORGE), { name: TERMINAL, desks: [] }, ...scene.rooms.filter(r => r.name !== FORGE)]
      : scene.rooms
  const acting: Readonly<Record<string, Activity>> = isResting
    ? {
        0: { tool: '', file: '#inn', at: now, isActive: false, isEdit: false },
        ...Object.fromEntries([...backgroundAgents].filter(agent => activity[agent]).map(agent => [agent, activity[agent]!])),
      }
    : isPondering
      ? { ...activity, 0: { tool: '', file: '#hall', at: now, isActive: false, isEdit: false } }
      : activity
  const visibleActors = Object.entries(acting)
    .sort(([a, aa], [b, bb]) => a === '0' ? -1 : b === '0' ? 1 : Number(bb.isActive) - Number(aa.isActive) || bb.at - aa.at)
    .slice(0, MAX_AGENTS)
  // Each room is as wide as its desks need (and its name plate), and rooms
  // are packed side by side into shelves, at most the widest the pane allows.
  const widest = maxWidth - GAP * 2
  const maxPerRow = Math.max(1, Math.floor((widest - 6) / DESK_W))
  const sized = rooms.map(r => {
    const perRow = Math.min(Math.max(1, r.desks.length), maxPerRow)
    const plate = clip(r.name, 20).length * 5.2 + 18 + (r.name === FORGE ? 30 : 0)

    if (r.name === INN) return { room: r, perRow, w: INN_W, h: WALL + DESK_H + 2 }
    if (r.name === TERMINAL) return { room: r, perRow, w: 52 + 32 * atTerminal.length, h: WALL + DESK_H + 2 }

    return { room: r, perRow, w: Math.max(perRow * DESK_W + 6 + (r.name === FORGE ? 30 : 0), plate), h: WALL + Math.ceil(Math.max(1, r.desks.length) / perRow) * DESK_H + 2 }
  })
  const shelves: (typeof sized)[] = []
  for (const s of sized) {
    const shelf = shelves[shelves.length - 1]
    const used = shelf ? shelf.reduce((n, o) => n + o.w + GAP, 0) : Infinity
    if (shelf && used + s.w <= widest) shelf.push(s)
    else shelves.push([s])
  }
  // The scene is only as wide as its widest shelf needs (never narrower than
  // the Patchboard reads well at), and the pane scales it up to fit: one desk
  // is a close-up, a busy turn zooms out. Shelves then end flush with it.
  const fullest = Math.max(...shelves.map(sh => sh.reduce((n, s) => n + s.w, 0) + GAP * (sh.length - 1)))
  const width = Math.min(maxWidth, Math.max(MIN_WIDTH, Math.ceil(fullest + GAP * 2)))
  const avail = width - GAP * 2

  const defs = new Set<string>([
    symbol('desk', DESK, DESK.svg),
    symbol('monitor', MONITOR, MONITOR.svg),
    symbol('plant', PLANT, PLANT.svg),
    symbol('chair', CHAIR, CHAIR.svg),
    symbol('stuck', ICONS.stuck, ICONS.stuck.svg),
    symbol('idle', ICONS.idle, ICONS.idle.svg),
    symbol('xp', ICONS.xp, ICONS.xp.svg),
    ...(scene.haven ? [symbol(`c${hero}f0`, CHARACTERS[hero]!, CHARACTERS[hero]!.frames[0]!)] : []),
  ])
  // Drawn in layers: rooms, then characters, then the desks in front of
  // them, then names, XP and bubbles on top of everything.
  const floors: string[] = []
  const bodies: string[] = []
  const furniture: string[] = []
  const overlays: string[] = []
  // Where each desk's character stands, and the room it is in, to keep its bubble inside.
  const deskAt = new Map<string, { x: number; y: number; left: number; right: number }>()
  let y = GAP
  if (scene.haven) {
    const home = homestead(width, scene.haven.landmarks, hero)
    floors.push(home.svg)
    y = home.height + GAP
  }

// The Patchboard: work orders, the file archive, and a place for agents to
// think, test and search. Its text is sized against the zoom, so it is always
  // about 11px on screen, and long steps wrap rather than being cut.
  {
    // Agents thinking, testing or searching stand in the hall, right of the board.
    const hallAgents = visibleActors
      .filter(([, a]) => a.file === '#hall')
      .map(([k]) => k)
    const w = width - GAP * 2
    const zoom = scene.paneWidth / width
    const fs = 11 / zoom
    const lineH = fs * 1.35
    const bw = w - 12 - hallAgents.length * 34
    const perLine = Math.max(8, Math.floor(((bw - 14) * zoom) / 6.7))
    const isQuestDone = steps.length > 0 && steps.every(st => st.status === 'completed')
    // Steps word-wrapped to the board; a finished quest folds into its title.
    const lines: { text: string; status: Step['status']; first: boolean }[] = []
    for (const st of isQuestDone ? [] : steps) {
      let rest = st.text
      let first = true
      while (rest) {
        let cut = rest.length <= perLine - 2 ? rest.length : rest.lastIndexOf(' ', perLine - 2)
        if (cut <= 0) cut = perLine - 2
        lines.push({ text: rest.slice(0, cut).trim(), status: st.status, first })
        rest = rest.slice(cut).trim()
        first = false
      }
    }
    const boardH = steps.length ? fs * 1.6 + lineH * Math.max(lines.length, isQuestDone ? 1 : 0) + 8 : 0
    const hallH = Math.max(boardH ? WALL + boardH + 8 : WALL + 4, hallAgents.length ? WALL + FEET + 8 : 0)
    hallAgents.forEach((k, n) => deskAt.set(`#hall@${k}`, { x: GAP + w - 20 - n * 34, y: y + hallH - FEET - 4, left: GAP + w - 34 * hallAgents.length - 40, right: GAP + w }))
    materialPatterns(HALL_THEME).forEach(pattern => defs.add(pattern))
    floors.push(room('hall', GAP, y, w, hallH, HALL_THEME, 'Patchboard'))
    // The chest on the hall's wall, with this session's banked files beside it.
    chestAt = { x: GAP + 6, y: y + 3 }
    floors.push(
      `<rect x="${GAP + 4}" y="${y + 2}" width="${bank ? 22 + String(bank.total).length * 5 + 34 : 22}" height="14" rx="2" fill="#1b1b24cc"/>`,
      archiveFiles(chestAt.x, chestAt.y),
      bank ? `<text x="${GAP + 27}" y="${y + 12}" font-size="7.5" font-weight="700" fill="${GOLD}">${bank.total} banked</text>` : '',
    )
    // Compaction: old context deposited all at once, scrolls flying off the
    // board into the chest in a puff of smoke.
    if (compactAt !== undefined && now - compactAt < 4000) {
      const cx = chestAt.x + 9
      const cy = chestAt.y + 6
      overlays.push(
        ...[0, 1, 2, 3, 4].map(n => {
          const sx = GAP + 40 + n * 30
          const sy = y + WALL + 30
          return (
            `<rect x="${sx}" y="${sy}" width="6" height="4" fill="#e9dbb1" stroke="#5a3a1e" stroke-width="0.6" opacity="0">` +
            `<animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.8;1" dur="0.9s" begin="${n * 0.1}s" fill="freeze"/>` +
            `<animate attributeName="x" from="${sx}" to="${cx - 3}" dur="0.9s" begin="${n * 0.1}s" fill="freeze"/>` +
            `<animate attributeName="y" from="${sy}" to="${cy - 2}" dur="0.9s" begin="${n * 0.1}s" fill="freeze"/></rect>`
          )
        }),
        ...[0, 1, 2, 3].map(
          n =>
            `<circle cx="${cx + (n - 1.5) * 6}" cy="${cy}" r="3" fill="#c8c8ce" opacity="0">` +
            `<animate attributeName="r" from="3" to="11" dur="1.2s" begin="${0.7 + n * 0.08}s" fill="freeze"/>` +
            `<animate attributeName="opacity" values="0;0.8;0" dur="1.2s" begin="${0.7 + n * 0.08}s" fill="freeze"/></circle>`,
        ),
        `<text x="${cx + 14}" y="${cy + 20}" font-size="8.5" font-weight="700" fill="${GOLD}" stroke="#1b1b24" stroke-width="2" paint-order="stroke" opacity="0">Deposit-all` +
          `<animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.15;0.8;1" dur="3s" begin="0.8s" fill="freeze"/></text>`,
      )
    }
    // The quest board: parchment on wood, the title, and each step in its
    // quest color; the step in progress pulses gently.
    if (steps.length) {
      const bx = GAP + 6
      const by = y + WALL + 4
      const done = steps.filter(st => st.status === 'completed').length
      floors.push(
        `<rect x="${bx}" y="${by}" width="${bw}" height="${boardH}" fill="#263b39" stroke="#142426" stroke-width="1.4"/>`,
        `<rect x="${bx + 3}" y="${by + 3}" width="${bw - 6}" height="${boardH - 6}" fill="#b9a77f"/>`,
        `<rect x="${bx + 3}" y="${by + 3}" width="${bw - 6}" height="${fs * 1.65}" fill="#405d53"/>`,
        `<path d="M${bx + 5} ${by + 4}h${Math.max(0, bw - 10)}" stroke="#8eab83" stroke-width=".8" opacity=".8"/>`,
        `<circle cx="${bx + 7}" cy="${by + 7}" r="1.6" fill="#d87865"/><circle cx="${bx + bw - 7}" cy="${by + 7}" r="1.6" fill="#d87865"/>`,
        `<text x="${bx + 12}" y="${by + 3 + fs * 1.2}" font-size="${fs * 1.05}" font-weight="700" fill="#f0e5c6">` +
          `${isQuestDone ? `✓ All patches complete · ${steps.length} steps` : `Work orders ${done}/${steps.length}`}</text>`,
      )
      lines.forEach((l, i) => {
        const isNow = l.status === 'in_progress'
        floors.push(
          `<text x="${bx + 7}" y="${by + 3 + fs * 1.6 + lineH * (i + 0.85)}" font-size="${fs}" fill="${QUEST[l.status]}"` +
            `${l.status === 'completed' ? ' text-decoration="line-through" opacity="0.75"' : ''}${isNow ? ' font-weight="700"' : ''}>` +
            `${l.first ? (l.status === 'completed' ? '● ' : isNow ? '◐ ' : '○ ') : '  '}${esc(l.text)}` +
            `${isNow ? '<animate attributeName="opacity" values="1;0.6;1" dur="2s" repeatCount="indefinite"/>' : ''}</text>`,
        )
      })
    }
    // A level just reached: a gold banner over the hall, with sparks.
    if (levelUp && now - levelUp.at < 6000) {
      const cx = GAP + w / 2
      const cy = y + hallH / 2
      overlays.push(
        `<g><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.08;0.85;1" dur="6s" fill="freeze"/>`,
        `<rect x="${cx - 70}" y="${cy - 14}" width="140" height="28" rx="4" fill="#1b1b24ee" stroke="${GOLD}" stroke-width="1.5"/>`,
        `<text x="${cx}" y="${cy - 1}" font-size="11" font-weight="700" text-anchor="middle" fill="${GOLD}">LEVEL UP!</text>`,
        `<text x="${cx}" y="${cy + 10}" font-size="8" text-anchor="middle" fill="#f3f4f6">Coding level ${levelUp.level}</text>`,
        ...[0, 1, 2, 3, 4, 5].map(n => {
          const a = (n / 6) * Math.PI * 2
          return (
            `<circle cx="${cx}" cy="${cy}" r="2" fill="${GOLD}">` +
            `<animate attributeName="cx" from="${cx}" to="${cx + Math.cos(a) * 80}" dur="1.2s" fill="freeze"/>` +
            `<animate attributeName="cy" from="${cy}" to="${cy + Math.sin(a) * 30}" dur="1.2s" fill="freeze"/>` +
            `<animate attributeName="opacity" values="1;0" dur="1.2s" fill="freeze"/></circle>`
          )
        }),
        `</g>`,
      )
    }
    y += hallH + GAP
  }

  let id = 0
  for (const shelf of shelves) {
    const rowH = Math.max(...shelf.map(s => s.h))
    // The shelf's spare width, shared out so its rooms end flush with the pane.
    const spare = avail - shelf.reduce((n, s) => n + s.w, 0) - GAP * (shelf.length - 1)
    let x = GAP
    for (const { room: r, perRow, w: natural } of shelf) {
      const roomW = natural + spare / shelf.length
      const isForge = r.name === FORGE
      const isInn = r.name === INN
      const isTerminal = r.name === TERMINAL
      const t = isInn ? INN_THEME : isTerminal ? TERMINAL_THEME : isForge ? FORGE_THEME : themeOf(r.name)
      materialPatterns(t).forEach(pattern => defs.add(pattern))
      floors.push(room(`r${id++}`, x, y, roomW, rowH, t, r.name))
      // Desks spread evenly across the room, not bunched at its left.
      const step = Math.max(DESK_W, (roomW - 6) / perRow)
      // A plant fills a corner wherever the desks leave one free.
      // The Forge has its furnace and anvil in the corner; other rooms a plant.
      if (isTerminal) {
        // A dim room lit by a rune console: a stone frame round a dark screen
        // whose green lines scroll up, over and over.
        const cx = x + 6
        const cy = y + WALL + 10
        floors.push(
          `<rect x="${x}" y="${y + WALL}" width="${roomW}" height="${rowH - WALL}" fill="#05070d" opacity="0.5"/>`,
          `<clipPath id="screen${id}"><rect x="${cx + 4}" y="${cy + 4}" width="26" height="34"/></clipPath>`,
          `<rect x="${cx}" y="${cy}" width="34" height="42" rx="2" fill="#4a4a52" stroke="#1b1b24" stroke-width="1"/>`,
          `<rect x="${cx + 4}" y="${cy + 4}" width="26" height="34" fill="#071a0f"/>`,
          `<g clip-path="url(#screen${id})"><g><animateTransform attributeName="transform" type="translate" from="0 0" to="0 -24" dur="2.4s" repeatCount="indefinite"/>` +
            [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
              .map(n => `<rect x="${cx + 6}" y="${cy + 7 + n * 6}" width="${[14, 20, 9, 17, 12, 22, 8, 15, 19, 11, 16, 13][n]}" height="2" fill="${n % 4 === 0 ? '#9cf6b8' : '#3fd27a'}"/>`)
              .join('') +
            `</g></g>`,
          `<rect x="${cx + 4}" y="${cy + 4}" width="26" height="34" fill="#3fd27a" opacity="0.08"><animate attributeName="opacity" values="0.08;0.16;0.08" dur="1.8s" repeatCount="indefinite"/></rect>`,
          `<rect x="${cx + 2}" y="${cy + 42}" width="30" height="5" fill="#5a3a1e" stroke="#1b1b24" stroke-width="0.8"/>`,
        )
        atTerminal.forEach((k, n) => deskAt.set(`#terminal@${k}`, { x: x + 54 + n * 32, y: y + WALL + 8, left: x, right: x + roomW }))
      } else if (isInn) {
        // A fireplace with live flames, a rug, and a stool by the fire.
        const fx = x + 8
        const fy = y + rowH - 4
        floors.push(
          `<ellipse cx="${x + roomW / 2 + 6}" cy="${fy - 12}" rx="${roomW / 2.6}" ry="7" fill="#7a2e2e" stroke="#4a1a1a" stroke-width="1"/>`,
          `<ellipse cx="${x + roomW / 2 + 6}" cy="${fy - 12}" rx="${roomW / 3.6}" ry="4.5" fill="none" stroke="#d9a93a" stroke-width="0.6" stroke-dasharray="2 1"/>`,
          `<g shape-rendering="crispEdges"><rect x="${fx}" y="${fy - 40}" width="30" height="40" fill="#6b6b73" stroke="#1b1b24" stroke-width="1"/>` +
            `<rect x="${fx - 2}" y="${fy - 42}" width="34" height="4" fill="#4a4a52" stroke="#1b1b24" stroke-width="0.8"/>` +
            `<rect x="${fx + 6}" y="${fy - 22}" width="18" height="22" fill="#1b1b24"/></g>`,
          // Flames: three tongues that flicker out of step, and a warm glow.
          `<circle cx="${fx + 15}" cy="${fy - 8}" r="14" fill="#ff8a1a" opacity="0.12"><animate attributeName="opacity" values="0.12;0.2;0.1;0.12" dur="1.4s" repeatCount="indefinite"/></circle>`,
          ...[
            [fx + 10, '#ff5a0a', '0.7s'],
            [fx + 15, '#ffb347', '0.55s'],
            [fx + 20, '#ff7a1a', '0.8s'],
          ].map(
            // Each flame is drawn from its own base, so it flickers up and down in place.
            ([cx, c, d]) =>
              `<g transform="translate(${cx} ${fy - 1})"><path d="M-3 0q3-12 3-12q3 12 3 12z" fill="${c}">` +
              `<animateTransform attributeName="transform" type="scale" values="1 1;1 0.8;1 1.1;1 1" dur="${d}" repeatCount="indefinite"/>` +
              `<animate attributeName="opacity" values="1;0.75;1" dur="${d}" repeatCount="indefinite"/></path></g>`,
          ),
          `<rect x="${fx + 7}" y="${fy - 3}" width="16" height="3" fill="#5a3a1e"/>`,
          use('chair', x + roomW - CHAIR.w - 8, fy - CHAIR.h - 6, CHAIR.w, CHAIR.h),
        )
        deskAt.set('#inn', { x: x + 52, y: y + WALL + 8, left: x, right: x + roomW })
      } else if (isForge) {
        floors.push(forgeCorner(x + roomW - 30, y + rowH - 3))
      } else if (roomW - perRow * step >= PLANT.w + 4 || rowH - (r.desks.length > perRow ? DESK_H * 2 : DESK_H) - WALL >= PLANT.h + 6) {
        floors.push(use('plant', x + roomW - PLANT.w - 3, y + rowH - PLANT.h - 3, PLANT.w, PLANT.h))
      }
      const deskX = x
      x += roomW + GAP
      r.desks.forEach((d, n) => {
        const dx = deskX + 3 + (n % perRow) * step + (step - DESK_W) / 2
        const dy = y + WALL + Math.floor(n / perRow) * DESK_H
        deskAt.set(d.path, { x: dx + 20, y: dy, left: deskX, right: deskX + roomW })
        const tch = d.touch
        const glow = tch.isActive ? (tch.kind === 'read' ? READ_COLOR : AGENT_COLORS[tch.agent % AGENT_COLORS.length]) : '#3b4252'
        const isCreating = tch.isNew && tch.isActive
        // A desk for a new file builds itself in: it rises out of the floor.
        if (isCreating) furniture.push(`<g><animateTransform attributeName="transform" type="translate" from="0 6" to="0 0" dur="0.5s" fill="freeze"/><animate attributeName="opacity" from="0" to="1" dur="0.5s" fill="freeze"/>`)
        furniture.push(
          use('desk', dx + 11, dy + 46, DESK.w, DESK.h),
          use('monitor', dx + 31, dy + 37, MONITOR.w, MONITOR.h),
          `<svg x="${dx + 31}" y="${dy + 37}" width="${MONITOR.w}" height="${MONITOR.h}" viewBox="0 0 ${MONITOR.w} ${MONITOR.h}" shape-rendering="crispEdges"><path fill="${glow}" d="${MONITOR.glow}">` +
            // A working monitor glows softly.
            `${tch.isActive ? '<animate attributeName="opacity" values="1;0.6;1" dur="1.2s" repeatCount="indefinite"/>' : ''}</path></svg>`,
        )
        if (isCreating) {
          furniture.push('</g>')
          // Anvil sparks while the new file is being made, over and over.
          furniture.push(
            ...[0, 1, 2, 3, 4, 5].map(n => {
              const sx = dx + 37
              const sy = dy + 40
              const tx = sx + (n - 2.5) * 5
              return (
                `<rect x="${sx}" y="${sy}" width="1.6" height="1.6" fill="${n % 2 ? '#ffb347' : '#ffe066'}" opacity="0">` +
                `<animate attributeName="x" from="${sx}" to="${tx}" dur="0.6s" begin="${n * 0.1}s" repeatCount="indefinite"/>` +
                `<animate attributeName="y" values="${sy};${sy - 8 - (n % 3) * 3};${sy + 2}" dur="0.6s" begin="${n * 0.1}s" repeatCount="indefinite"/>` +
                `<animate attributeName="opacity" values="1;1;0" dur="0.6s" begin="${n * 0.1}s" repeatCount="indefinite"/></rect>`
              )
            }),
          )
        }
        // The file's whole name, wrapped onto a second line rather than cut.
        const lines = nameLines(d.name)
        // Its changes: git's letter and counts when git has them, else what this
        // turn's edits wrote and replaced.
        const add = d.change ? d.change.add : (tch.add ?? 0)
        const del = d.change ? d.change.del : (tch.del ?? 0)
        const hasLines = Boolean(d.change || add || del)
        const plateH = 3 + lines.length * 8 + (hasLines ? 8 : 0)
        overlays.push(
          `<rect x="${dx + 1}" y="${dy + 60}" width="${DESK_W - 2}" height="${plateH}" rx="2" fill="#0b0f19dd"/>`,
          ...lines.map(
            (line, i) =>
              `<text x="${dx + 28}" y="${dy + 67 + i * 8}" font-size="7.5" text-anchor="middle" fill="${tch.kind === 'read' ? READ_COLOR : '#f3f4f6'}">${esc(line)}</text>`,
          ),
        )
        // A file made this turn wears a small gold NEW tag on its plate.
        if (tch.isNew) {
          overlays.push(
            `<rect x="${dx + DESK_W - 16}" y="${dy + 56}" width="16" height="7" rx="1.5" fill="${GOLD}"/>`,
            `<text x="${dx + DESK_W - 8}" y="${dy + 61.5}" font-size="5.5" font-weight="700" text-anchor="middle" fill="#1b1b24">NEW</text>`,
          )
        }
        if (hasLines) {
          overlays.push(
            `<text x="${dx + 28}" y="${dy + 67 + lines.length * 8}" font-size="7" text-anchor="middle">` +
              (d.change ? `<tspan fill="${GIT_COLORS[d.change.code]}" font-weight="700">${d.change.code} </tspan>` : '') +
              (add ? `<tspan fill="#73c991">+${add}</tspan>` : '') +
              (del ? `<tspan fill="#f14c4c">${add ? ' ' : ''}−${del}</tspan>` : '') +
              `</text>`,
          )
        }
        const drop = drops[d.path]
        if (drop && now - drop.at < 4000) {
          // The XP the last edit earned rises from the desk with a sparkle, and fades.
          overlays.push(
            `<g><animateTransform attributeName="transform" type="translate" from="0 0" to="0 -22" dur="1.6s" fill="freeze"/>` +
              `<animate attributeName="opacity" values="1;1;0" dur="2.4s" fill="freeze"/>` +
              use('xp', dx + 30, dy + 28, 8, 8) +
              `<text x="${dx + 40}" y="${dy + 35}" font-size="8.5" font-weight="700" fill="${GOLD}" stroke="#1b1b24" stroke-width="2" paint-order="stroke">+${drop.xp}</text></g>`,
          )
        }
      })
    }
    y += rowH + GAP
  }

  // A commit just landed: coins fly from each desk into the chest, which
  // hops, and "+N files banked" rises over it.
  if (bank && now - bank.at < 3500) {
    const cx = chestAt.x + 9
    const cy = chestAt.y + 4
    ;[...deskAt.values()].slice(0, 8).forEach((d, n) => {
      const sx = d.x + 9
      const sy = d.y + 42
      overlays.push(
        `<circle cx="${sx}" cy="${sy}" r="2.6" fill="${GOLD}" stroke="#8a6a1e" stroke-width="0.8" opacity="0">` +
          `<animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.85;1" dur="1s" begin="${n * 0.12}s" fill="freeze"/>` +
          `<animate attributeName="cx" from="${sx}" to="${cx}" dur="1s" begin="${n * 0.12}s" fill="freeze"/>` +
          `<animate attributeName="cy" values="${sy};${Math.min(sy, cy) - 24};${cy}" dur="1s" begin="${n * 0.12}s" fill="freeze"/></circle>`,
      )
    })
    overlays.push(
      `<text x="${cx + 12}" y="${cy + 26}" font-size="8.5" font-weight="700" fill="${GOLD}" stroke="#1b1b24" stroke-width="2" paint-order="stroke" opacity="0">` +
        `+${bank.files} file${bank.files === 1 ? '' : 's'} banked` +
        `<animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.15;0.8;1" dur="3s" begin="0.6s" fill="freeze"/>` +
        `<animate attributeName="y" from="${cy + 26}" to="${cy + 14}" dur="3s" begin="0.6s" fill="freeze"/></text>`,
    )
  }

  // Characters behind their desks: each at the desk of its last file.
  const spots: Record<string, { x: number; y: number }> = {}
  // How many bubbles each room (by its left edge) has so far.
  const bubbled = new Map<number, number>()
  visibleActors.forEach(([agent, act], order) => {
      // A subagent that finished teleports out, and is gone after.
      const left = departs[agent]
      const isLeaving = left !== undefined && act.at <= left
      if (isLeaving && now - left > 2000) return
      const at = deskAt.get(act.file === '#hall' ? `#hall@${agent}` : act.file === '#terminal' ? `#terminal@${agent}` : act.file)
      if (!at) return
      spots[agent] = at
      // The wizard is Claude's alone; subagents take the rest of the cast in turn.
      const index = agent === '0' ? hero : cast[(Number(agent) - 1) % cast.length]!
      const ch = CHARACTERS[index] ?? CHARACTERS[0]!
      const scale = CHAR_H / ch.h
      const cw = ch.w * scale
      const top = FEET - CHAR_H
      const pondering = agent === '0' && isPondering
      const background = backgroundAgents.has(agent)
      const applying = act.isActive && (act.isApply || act.mode === 'apply')
      const testing = act.mode === 'test' && act.isActive
      // At the Terminal: typing at the rune console while the command runs.
      const commanding = act.mode === 'shell' && act.isActive
      const searching = act.mode === 'web' && act.isActive
      // Reading the work orders at the Patchboard.
      const questing = act.mode === 'quests' && act.file === '#hall'
      const pose = pondering || questing || searching || background ? [3, 4] : testing || commanding ? [1, 2] : act.isActive ? (act.isEdit ? [1, 2] : [3, 4]) : [0]
      for (const f of pose) defs.add(symbol(`c${index}f${f}`, ch, ch.frames[f] ?? ''))
      const frame = (f: number) => use(`c${index}f${f}`, -cw / 2, top, cw, CHAR_H)
      const body =
        pose.length === 1
          ? frame(0)
          : `<g>${frame(pose[0]!)}<animate attributeName="opacity" values="1;0" calcMode="discrete" dur="0.5s" repeatCount="indefinite"/></g>` +
            `<g opacity="0">${frame(pose[1]!)}<animate attributeName="opacity" values="0;1" calcMode="discrete" dur="0.5s" repeatCount="indefinite"/></g>`
      // Claude's wizard blinks every few seconds: skin over both eyes for a moment.
      const blink =
        index === 0
          ? WIZARD_EYES.map(
              ex =>
                `<rect x="${-cw / 2 + ex * scale}" y="${top + WIZARD_EYE_ROW * scale}" width="${2 * scale}" height="${2 * scale}" fill="${WIZARD_SKIN}" opacity="0">` +
                `<animate attributeName="opacity" values="0;0;1;0" keyTimes="0;0.94;0.97;1" dur="${4 + order * 0.7}s" repeatCount="indefinite"/>` +
                // Dozing by the fire: the eyes close and stay closed.
                `${isResting && agent === '0' ? `<set attributeName="opacity" to="1" begin="${DOZE_AFTER}s"/>` : ''}</rect>`,
            ).join('')
          : ''
      const color = AGENT_COLORS[Number(agent) % AGENT_COLORS.length]
      const waiting = scene.asking[agent] !== undefined
      const idle = !act.isActive && isTurn && now - act.at > 120_000
      const thinking = !testing && !searching && !questing && !commanding && (pondering || background || (isTurn && !act.isActive && !idle))
      const drop = drops[act.file]
      const hopped = drop && now - drop.at < 1500
      const was = from[agent]
      // A walk from where it stood at the last drawing, played once when it moved.
      const walk =
        was && (was.x !== at.x || was.y !== at.y)
          ? `<animateTransform attributeName="transform" type="translate" from="${was.x} ${was.y}" to="${at.x} ${at.y}" dur="0.7s" fill="freeze"/>`
          : ''
      // Standing still, a character breathes: a 1px bob. Stuck, it bounces;
      // just earning XP, it hops once.
      const motion = waiting || idle
        ? `<animateTransform attributeName="transform" type="translate" values="0 0;0 -4;0 0" dur="0.7s" repeatCount="indefinite"/>`
        : hopped
          ? `<animateTransform attributeName="transform" type="translate" values="0 0;0 -5;0 0" dur="0.45s" fill="freeze"/>`
          : pose.length === 1
            ? `<animateTransform attributeName="transform" type="translate" values="0 0;0 1;0 0" dur="2.4s" begin="${order * 0.4}s" repeatCount="indefinite"/>`
            : ''
      // A subagent that just arrived teleports in: it fades in out of a
      // ring of rising blue and violet sparks, as a teleport spell does.
      const born = spawns[agent]
      const isArriving = born !== undefined && now - born < 2000
      const arrive = isLeaving
        ? '<animate attributeName="opacity" values="1;1;0" keyTimes="0;0.55;1" dur="1s" fill="freeze"/>'
        : isArriving
          ? '<animate attributeName="opacity" values="0;0;1" keyTimes="0;0.45;1" dur="1s" fill="freeze"/>'
          : ''
      const puff = isArriving || isLeaving
        ? `<ellipse cx="0" cy="${FEET - 1}" rx="2" ry="1" fill="none" stroke="#9cc8ff" stroke-width="1.5">` +
          `<animate attributeName="rx" from="2" to="${cw / 1.4}" dur="0.8s" fill="freeze"/><animate attributeName="ry" from="1" to="4" dur="0.8s" fill="freeze"/>` +
          `<animate attributeName="opacity" values="1;0" dur="0.9s" fill="freeze"/></ellipse>` +
          [0, 1, 2, 3, 4, 5, 6, 7]
            .map(n => {
              const sx = Math.cos((n / 8) * Math.PI * 2) * (cw / 2)
              return (
                `<rect x="${sx - 1}" y="${FEET - 2}" width="2" height="2" fill="${n % 2 ? '#c8a2ff' : '#9cc8ff'}">` +
                `<animate attributeName="y" from="${FEET - 2}" to="${FEET - CHAR_H - 6}" dur="1s" begin="${n * 0.05}s" fill="freeze"/>` +
                `<animate attributeName="opacity" values="1;1;0" dur="1s" begin="${n * 0.05}s" fill="freeze"/></rect>`
              )
            })
            .join('')
        : ''
      // Testing: a training dummy beside it, shaking under each swing.
      // Searching: a map scroll held up in front of it.
      // Applying a batch of changes: a violet rune circle turns under it, like an enchantment.
      const rune = applying
        ? `<g><animateTransform attributeName="transform" type="rotate" from="0 0 ${FEET - 1}" to="360 0 ${FEET - 1}" dur="3s" repeatCount="indefinite"/>` +
          `<ellipse cx="0" cy="${FEET - 1}" rx="${cw / 1.5}" ry="4" fill="#7c3aed22" stroke="#a78bfa" stroke-width="1" stroke-dasharray="3 2"/>` +
          `<ellipse cx="0" cy="${FEET - 1}" rx="${cw / 2.4}" ry="2.4" fill="none" stroke="#c4b5fd" stroke-width="0.7" stroke-dasharray="1 2"/></g>` +
          `<animate attributeName="opacity" values="0.6;1;0.6" dur="1.2s" repeatCount="indefinite"/>`
        : ''
      const prop = testing ? dummy(-cw / 2 - 9, FEET) : applying ? `<g transform="translate(${at.x} ${at.y})">${rune}</g>` : ''
      const scroll = searching
        ? `<g><rect x="${-cw * 0.4}" y="${top + CHAR_H * 0.42}" width="${cw * 0.8}" height="9" fill="#e9dbb1" stroke="#5a3a1e" stroke-width="0.8"/>` +
          `<path d="M${-cw * 0.3} ${top + CHAR_H * 0.42 + 6}l3-2l3 1l3-3" fill="none" stroke="#7a4a2a" stroke-width="0.7" stroke-dasharray="1 1"/>` +
          `<text x="${cw * 0.22}" y="${top + CHAR_H * 0.42 + 7}" font-size="6" font-weight="700" text-anchor="middle" fill="#b3201e">✗</text></g>`
        : ''
      const hitsplat = splats[agent] && now - splats[agent]!.at < 1800 ? splat(splats[agent]!, top + CHAR_H * 0.45) : ''
      const isSpent = isResting && agent === '0' && scene.failure?.error === 'rate_limit'
      bodies.push(prop,
        `<g transform="translate(${at.x} ${at.y})"${isSpent ? ' opacity="0.55"' : ''}>${walk}${isSpent ? '<g transform="translate(0 3)">' : ''}`,
        `<ellipse cx="0" cy="${FEET - 1}" rx="${cw / 2.6}" ry="2" fill="#000" opacity="0.35">${arrive}</ellipse>`,
        `<g>${arrive}${motion}${body}${blink}${scroll}</g>${puff}${isSpent ? '</g>' : ''}</g>`,
      )
      // The hitsplat goes over desks and bubbles alike.
      if (hitsplat) overlays.push(`<g transform="translate(${at.x} ${at.y})">${hitsplat}</g>`)

      // The bubble over its head, drawn on top of every desk.
      const icon = waiting ? 'stuck' : idle ? 'idle' : ''
      // At the Inn after a failed or stopped turn, the bubble says why.
      const restLine =
        scene.failure?.error === 'rate_limit'
          ? '⚡ out of run energy'
          : scene.failure
            ? '⚠ the turn failed'
            : scene.stoppedAt !== undefined && now - scene.stoppedAt < 60_000
              ? 'stopped'
              : 'ready for a quest'
      const full = isResting && agent === '0' ? restLine : commanding ? act.tool : applying ? '✦ apply' : testing ? '⚔ tests' : searching ? '⌕ search' : questing ? '📜 quests' : waiting ? 'needs you' : idle ? 'idle' : thinking ? '' : `${act.isNew ? '✚' : act.isEdit ? '✎' : '◉'} ${clip(act.file.slice(act.file.lastIndexOf('/') + 1), 12)}`
      // Shortened to fit a narrow room.
      const fits = Math.max(3, Math.floor((at.right - at.left - 14 - (icon ? 11 : 0)) / 4.6))
      const label = clip(full, fits)
      const bw = thinking ? 26 : Math.min(118, 10 + label.length * 4.6 + (icon ? 11 : 0))
      // Kept inside its room: never over a neighbour's bubble.
      const bx = Math.max(at.left + 2 - at.x, Math.min(-bw / 2, at.right - 2 - at.x - bw))
      // Every second agent in the same room has its bubble a row higher, so
      // two side by side (at the Terminal, say) never cover each other's.
      const neighbours = bubbled.get(at.left) ?? 0
      bubbled.set(at.left, neighbours + 1)
      const by = top - 14 - (neighbours % 2) * 13
      const inside = thinking
        ? [0, 1, 2]
            .map(
              n =>
                `<circle cx="${bx + 7 + n * 6}" cy="${by + 6}" r="1.6" fill="#f3f4f6">` +
                `<animate attributeName="opacity" values="0.25;1;0.25" dur="1.2s" begin="${n * 0.2}s" repeatCount="indefinite"/></circle>`,
            )
            .join('') +
          // A thought, not speech: two little puffs trail down to the head.
          `<circle cx="${bx + 8}" cy="${by + 14}" r="1.8" fill="#0b0f19" stroke="${color}" stroke-width="0.8"/>` +
          `<circle cx="${bx + 5}" cy="${by + 17.5}" r="1.1" fill="#0b0f19" stroke="${color}" stroke-width="0.8"/>`
        : (icon ? use(icon, bx + 3, by + 1.5, 9, 9) : '') +
          `<text x="${bx + bw / 2 + (icon ? 5 : 0)}" y="${by + 8.7}" font-size="7.5" text-anchor="middle" fill="#f3f4f6">${esc(label)}</text>`
      overlays.push(
        `<g transform="translate(${at.x} ${at.y})">${walk}<g>${waiting || idle ? `<animateTransform attributeName="transform" type="translate" values="0 0;0 -4;0 0" dur="0.7s" repeatCount="indefinite"/>` : ''}`,
        // At rest, the bubble fades once the wizard dozes off, and Zz rise instead.
        `<g>${isResting && agent === '0' ? `<set attributeName="opacity" to="0" begin="${DOZE_AFTER}s"/>` : ''}`,
        `<rect x="${bx}" y="${by}" width="${bw}" height="12" rx="6" fill="#0b0f19" stroke="${icon ? GOLD : color}" stroke-width="1"/>`,
        inside,
        `</g>`,
        isResting && agent === '0'
          ? `<g opacity="0"><set attributeName="opacity" to="1" begin="${DOZE_AFTER}s"/>` +
            `<g>${use('idle', 4, top - 6, 9, 9)}<animateTransform attributeName="transform" type="translate" from="0 0" to="5 -16" dur="2.4s" begin="${DOZE_AFTER}s" repeatCount="indefinite"/>` +
            `<animate attributeName="opacity" values="1;0" dur="2.4s" begin="${DOZE_AFTER}s" repeatCount="indefinite"/></g></g>`
          : '',
        // Idle, a Zz drifts up and fades, over and over.
        idle
          ? `<g>${use('idle', 6, top - 4, 8, 8)}<animateTransform attributeName="transform" type="translate" from="0 0" to="4 -14" dur="2s" repeatCount="indefinite"/>` +
            `<animate attributeName="opacity" values="1;0" dur="2s" repeatCount="indefinite"/></g>`
          : '',
        `</g></g>`,
      )
    })

  // A failed turn: a banner across the top of the scene. The usage limit is
  // out of run energy, in red; the rest are grey and name the problem.
  if (scene.failure) {
    const isLimit = scene.failure.error === 'rate_limit'
    const bw = Math.min(width - GAP * 2, 150)
    const bx = (width - bw) / 2
    overlays.push(
      `<rect x="${bx}" y="${GAP + 2}" width="${bw}" height="16" rx="3" fill="${isLimit ? '#3a0d0d' : '#24262e'}ee" stroke="${isLimit ? '#ff5b5b' : '#8a8f99'}" stroke-width="1"/>`,
      `<text x="${width / 2}" y="${GAP + 13}" font-size="8" font-weight="700" text-anchor="middle" fill="${isLimit ? '#ff8a8a' : '#d0d3da'}">` +
        `${isLimit ? '⚡ Out of run energy' : '⚠ The turn stopped'}` +
        `${isLimit ? '<animate attributeName="opacity" values="1;0.55;1" dur="1.6s" repeatCount="indefinite"/>' : ''}</text>`,
    )
  }

  const height = Math.max(y, 40)
  let svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" font-family="ui-monospace,Menlo,Consolas,monospace">` +
    `<defs>${[...defs].join('')}</defs>` +
    // A quiet, continuous backdrop lets the settlement and room frames carry
    // the scene without a dividing seam through the middle.
    `<rect width="${width}" height="${height}" fill="#172b2d"/>` +
    `<rect y="${height - 3}" width="${width}" height="3" fill="#233c37" opacity=".8"/>` +
    floors.join('') +
    bodies.join('') +
    furniture.join('') +
    overlays.join('') +
    `</svg>`

  if (scene.haven?.motion === false) svg = svg.replace(/<(?:animate|animateTransform|set)\b[^>]*\/>/g, '')

  return { svg, width, height, spots }
}
