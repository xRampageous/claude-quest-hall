import type { Activity, Mob } from '../types'
import { ROOMS } from './art'
import { HEROES } from './haven'
import type { Room, Scene, Spot } from './rooms'
import { AGENT_QUEST_GUILD, AGENT_QUEST_SCENES } from './agentquest-backgrounds'
import { AGENT_QUEST_FRAME, AGENT_QUEST_FRAMES, AGENT_QUEST_MOBS, AGENT_QUEST_SPRITES } from './agentquest-sprites'
import type { AgentQuestDirection } from './agentquest-sprites'

type Agent = { id: string; activity: Activity }
export type ActorAction = 'editing' | 'creating' | 'reading' | 'searching' | 'testing' | 'researching' | 'applying' | 'command' | 'tool' | 'delegating' | 'planning' | 'thinking' | 'replying' | 'waiting' | 'working' | 'idle'
type Node = {
  key: string
  kind: 'folder' | 'forge' | 'test' | 'library' | 'terminal' | 'board' | 'crew' | 'inn'
  title: string
  slot: number
  room?: Room
}

const COLORS = ['#d8a45e', '#67c7c0', '#d98cb2', '#9acb7b', '#d8c56e', '#8db9e0']
const ROLES = ['mage', 'rogue', 'ranger', 'sage'] as const
// Each station has its own Agent Quest backdrop; project folders draw from the rest,
// so a folder never borrows the Terminal's or the Patchboard's room.
const STATION_SCENES: Record<Exclude<Node['kind'], 'folder'>, string> = {
  board: 'guild', crew: 'conductors_nexus', inn: 'grassland', terminal: 'glitch_pit',
  forge: 'skyforge_aether', test: 'circuit_catacombs', library: 'oracles_athenaeum',
}
const DISTRICT_SCENES = Object.keys(AGENT_QUEST_SCENES).sort().filter(name => !Object.values(STATION_SCENES).includes(name))
// Agent Quest frames are 56 pixels square; the feet stand on row 43 and the head starts near row 14.
const FOOT = 43
const HEAD = 14
// Frame rates after Agent Quest: a calm walk, a quicker work stroke, a slow mob breath.
const WALK_FPS = 10
const WORK_FPS = 12
const MOB_FPS = 6
// The scene must stay under the Svg element's 131,072-character source limit.
const SVG_BUDGET = 124_000
// 7×7 pixel icons for each action's badge: a quill, a plus, an open book, a lens, a tick,
// a globe, a rune, a prompt, a gear, an arrow, a list, three dots, a speech scroll and a star.
const ICONS: Record<Exclude<ActorAction, 'idle' | 'waiting'>, readonly string[]> = {
  editing: ['......#', '.....##', '....##.', '...##..', '..##...', '.##....', '#......'],
  creating: ['...#...', '...#...', '...#...', '#######', '...#...', '...#...', '...#...'],
  reading: ['.......', '##...##', '#.#.#.#', '#..#..#', '#..#..#', '###.###', '.......'],
  searching: ['.###...', '#...#..', '#...#..', '#...#..', '.###...', '....##.', '.....##'],
  testing: ['.......', '......#', '.....##', '#...##.', '##.##..', '.###...', '..#....'],
  researching: ['..###..', '.#.#.#.', '#..#..#', '#######', '#..#..#', '.#.#.#.', '..###..'],
  applying: ['...#...', '..#.#..', '.#.#.#.', '#.###.#', '.#.#.#.', '..#.#..', '...#...'],
  command: ['.......', '#......', '.#.....', '..#....', '.#.....', '#..###.', '.......'],
  tool: ['...#...', '.#####.', '.##.##.', '###.###', '.##.##.', '.#####.', '...#...'],
  delegating: ['.......', '....#..', '.....#.', '#######', '.....#.', '....#..', '.......'],
  planning: ['#.####.', '.......', '#.####.', '.......', '#.####.', '.......', '#.###..'],
  thinking: ['.......', '.......', '.......', '#.#.#..', '.......', '.......', '.......'],
  replying: ['#######', '#.....#', '#.###.#', '#.....#', '#.##..#', '###...#', '#.#####'],
  working: ['...#...', '.#.#.#.', '..###..', '#######', '..###..', '.#.#.#.', '...#...'],
}
// Hands-on work plays the Agent Quest attack strip at the work prop; looking work holds a pose.
const STRIKES = new Set<ActorAction>(['editing', 'creating', 'testing', 'applying', 'command', 'tool', 'delegating', 'working'])
const FACING_PROP = new Set<ActorAction>(['reading', 'searching', 'researching', 'planning', 'replying'])
const esc = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const clip = (value: string, length: number) => value.length > length ? value.slice(0, Math.max(1, length - 1)) + '…' : value
const samePath = (a: string, b: string) => a.replace(/\\/g, '/').toLowerCase() === b.replace(/\\/g, '/').toLowerCase()
const scaleFor = (width: number) => Math.max(1.1, Math.min(1.38, width / 315))
const n = (value: number) => Math.round(value * 10) / 10

function palette(value: string) {
  let hash = 0
  for (const char of value.toLowerCase()) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return ROOMS[hash % ROOMS.length]!
}

export function activityAction(activity: Activity, running: boolean, waiting: boolean, turnActive: boolean): ActorAction {
  if (waiting || (activity.isActive && activity.mode === 'ask')) return 'waiting'
  // What the model is doing between tools, as its response streams in.
  if (!activity.isActive && (running || turnActive) && activity.mode === 'think') return 'thinking'
  if (!activity.isActive && (running || turnActive) && activity.mode === 'reply') return 'replying'
  if (activity.isActive) {
    if (activity.isNew || activity.mode === 'create') return 'creating'
    if (activity.mode === 'test' || /test|lint|check/i.test(activity.tool)) return 'testing'
    if (activity.mode === 'web') return 'researching'
    if (activity.mode === 'apply' || activity.isApply) return 'applying'
    if (activity.mode === 'read' || activity.tool === 'Read') return 'reading'
    if (activity.mode === 'search' || /^(?:⌕\s*)?(?:Grep|Glob|Search)/i.test(activity.tool)) return 'searching'
    if (activity.mode === 'quests') return 'planning'
    if (activity.mode === 'shell') return 'command'
    if (activity.mode === 'tool') return 'tool'
    if (activity.mode === 'background') return /^(?:↗|Task|Agent|Delegate)/i.test(activity.tool) ? 'delegating' : 'working'
    if (activity.isEdit) return 'editing'
    return 'working'
  }
  if (activity.mode === 'quests') return 'planning'
  if (running || turnActive) return 'thinking'
  return 'idle'
}

export function labelFor(activity: Activity, waiting: boolean, running = false, turnActive = false): string {
  const action = activityAction(activity, running, waiting, turnActive)
  if (action === 'waiting') return 'AWAITING YOU'
  if (activity.isActive) {
    if (action === 'testing') return 'CHECKING PATCH'
    if (action === 'researching') return 'RESEARCHING'
    if (action === 'applying') return 'APPLYING PATCH'
    if (action === 'command') return 'RUNNING COMMAND'
    if (action === 'tool') return 'USING TOOL'
    if (action === 'delegating') return 'SENDING CREW'
    if (action === 'planning') return 'PLANNING PATCH'
    if (action === 'reading') return 'READING FILE'
    if (action === 'searching') return 'SEARCHING'
    if (action === 'creating') return 'CREATING FILE'
    if (action === 'editing') return 'EDITING FILE'
    return 'WORKING'
  }
  if (action === 'planning') return 'PLANNING'
  if (action === 'replying') return 'WRITING REPLY'
  if (action === 'thinking' && activity.mode === 'think') return 'THINKING'
  if (running) return 'BETWEEN TOOLS'
  if (activity.mode === 'test' || /test|lint|check/i.test(activity.tool)) return 'CHECK COMPLETE'
  if (activity.mode === 'web') return 'RESULT LOGGED'
  if (activity.mode === 'apply' || activity.isApply) return 'PATCH APPLIED'
  if (activity.mode === 'search') return 'SEARCH COMPLETE'
  if (activity.mode === 'tool') return 'TOOL COMPLETE'
  if (activity.mode === 'shell') return 'BETWEEN COMMANDS'
  if (activity.isNew) return 'FILE CREATED'
  if (activity.isEdit) return 'PATCH SAVED'
  if (activity.mode === 'read' || activity.tool === 'Read') return 'READ COMPLETE'
  if (action === 'thinking') return 'THINKING'
  if (activity.file === '#terminal') return 'IN TERMINAL'
  if (activity.file === '#crew') return 'BETWEEN TASKS'
  if (activity.file === '#hall') return 'PLANNING'
  if (activity.file === '#inn') return 'AT CAMP'
  return 'READING'
}

export function roleFor(id: string, hero: number): typeof ROLES[number] {
  if (id === '0') return ROLES[hero] ?? 'mage'
  const others = [0, 1, 2, 3].filter(index => index !== hero)
  const parsed = Number.parseInt(id, 10)
  const castIndex = others[(Number.isFinite(parsed) ? Math.max(1, parsed) - 1 : id.length) % others.length] ?? 0
  return ROLES[castIndex] ?? 'mage'
}

// The cardinal direction of a move, after Agent Quest: the larger axis wins, and a tie reads as vertical.
export function facingFromDelta(dx: number, dy: number): AgentQuestDirection {
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'east' : 'west'
  return dy > 0 ? 'south' : 'north'
}

// An action's badge icon as pixel rectangles, `size` units across, its top-left at x, y.
export function actionIcon(action: ActorAction, x: number, y: number, size: number, color: string): string {
  const rows = action === 'idle' || action === 'waiting' ? undefined : ICONS[action]
  if (!rows) return ''
  const px = size / 7
  let path = ''
  rows.forEach((row, ry) => {
    let start = -1
    for (let rx = 0; rx <= row.length; rx++) {
      if (row[rx] === '#' && start < 0) start = rx
      if (row[rx] !== '#' && start >= 0) {
        path += 'M' + n(x + start * px) + ' ' + n(y + ry * px) + 'h' + n((rx - start) * px) + 'v' + n(px) + 'h' + n(-(rx - start) * px) + 'z'
        start = -1
      }
    }
  })
  return '<path d="' + path + '" fill="' + color + '"/>'
}

function nodeForRoom(room: Room, index: number, scene: Scene): Node {
  const path = room.desks[0]?.path ?? ''
  const cut = path.lastIndexOf('/')
  const key = room.key ?? (cut < 0 ? 'root' : path.slice(0, cut).toLowerCase())
  const kind: Node['kind'] = room.name === 'Forge' ? 'forge' : /test|spec|quality|qa/i.test(room.name) ? 'test' : /doc|wiki|guide/i.test(room.name) ? 'library' : 'folder'
  return { key: 'room:' + key, kind, title: room.name, room, slot: scene.siteSlots?.[key.toLowerCase()] ?? room.slot ?? index }
}

function backgroundFor(node: Node): string {
  if (node.kind !== 'folder') return STATION_SCENES[node.kind]
  let hash = 0
  for (const char of node.key.toLowerCase()) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return DISTRICT_SCENES[hash % DISTRICT_SCENES.length] ?? 'forest'
}

function activityNode(activity: Activity, rooms: readonly Node[], board: Node, terminal: Node, crew: Node, inn: Node): Node {
  if (activity.file === '#terminal') return terminal
  if (activity.file === '#crew') return crew
  if (activity.file === '#hall') return board
  if (activity.file === '#inn') return inn
  const found = rooms.find(node => node.room?.desks.some(desk => samePath(desk.path, activity.file)))
  if (found) return found
  const cut = activity.file.lastIndexOf('/')
  const key = cut < 0 ? 'root' : activity.file.slice(0, cut).toLowerCase()
  const title = cut < 0 ? 'Project root' : key.split('/').at(-1) || 'Project'
  return { key: 'room:' + key, kind: 'folder', title, slot: 0 }
}

// A strip of frames played through a 56-unit window: `use` steps along the strip.
function strip(id: string, frames: number, fps: number, motion: boolean, options: { begin?: number; repeat?: string; rest?: number; frame?: number } = {}): string {
  const still = options.frame ?? 0
  if (!motion || frames < 2) return '<use href="#' + id + '" x="' + -still * AGENT_QUEST_FRAME + '"/>'
  const stroke = frames / fps
  const total = stroke + (options.rest ?? 0)
  const values = Array.from({ length: frames }, (_, i) => -i * AGENT_QUEST_FRAME)
  const times = values.map((_, i) => (i * stroke / frames / total).toFixed(3))
  if (options.rest) { values.push(0); times.push((stroke / total).toFixed(3)) }
  return '<use href="#' + id + '" x="0"><animate attributeName="x" calcMode="discrete" values="' + values.join(';') + '" keyTimes="' + times.join(';') + '" dur="' + n(total) + 's" begin="' + n(options.begin ?? 0) + 's" repeatCount="' + (options.repeat ?? 'indefinite') + '"/></use>'
}

export function drawLivingTrail(scene: Scene): { svg: string; width: number; height: number; spots: Record<string, Spot> } {
  const full = drawTrail(scene, false)
  return full.svg.length <= SVG_BUDGET ? full : drawTrail(scene, true)
}

// `lean` keeps a crowded scene under the source limit: every worker but the stage's
// focus holds a still pose and glides instead of walking, so one worker's strips are embedded.
function drawTrail(scene: Scene, lean: boolean): { svg: string; width: number; height: number; spots: Record<string, Spot> } {
  const width = Math.max(240, Math.min(560, scene.paneWidth || scene.width * 1.5))
  const zoom = scene.haven?.size === 'large' ? 1.22 : scene.haven?.size === 'comfortable' ? 1.12 : 1
  const scale = scaleFor(width * zoom)
  const hero = Math.max(0, HEROES.indexOf(scene.haven?.hero ?? 'wizard'))
  const background = new Set(scene.backgroundAgents ?? [])
  const running = new Set((scene.crew ?? []).filter(member => member.status === 'running').map(member => String(member.index)))
  const actors: Agent[] = Object.entries(scene.activity)
    .filter(([id]) => scene.focusAgent ? id === scene.focusAgent : scene.isTurn || id === '0' || background.has(id) || (scene.departs[id] !== undefined && scene.now - scene.departs[id]! < 1200))
    .sort(([a], [b]) => a === '0' ? -1 : b === '0' ? 1 : Number(a) - Number(b))
    .map(([id, activity]) => ({ id, activity: id !== '0' && activity.file === '#hall' && (background.has(id) || running.has(id)) ? { ...activity, file: '#crew' } : activity }))

  for (const member of scene.crew ?? []) {
    const id = String(member.index)
    if ((scene.focusAgent ? scene.focusAgent === id : member.status === 'running') && !actors.some(actor => actor.id === id)) {
      actors.push({ id, activity: { tool: '', file: '#crew', at: scene.now, isActive: false, isEdit: false, mode: 'background' } })
    }
  }
  if (!actors.some(actor => actor.id === '0') && (!scene.focusAgent || scene.focusAgent === '0')) {
    actors.unshift({ id: '0', activity: { tool: '', file: scene.isTurn ? '#hall' : '#inn', at: scene.now, isActive: false, isEdit: false } })
  }
  const visible = actors.slice(0, 24).map(actor => !scene.isTurn && !scene.focusAgent && actor.id === '0'
    ? { ...actor, activity: { ...actor.activity, file: '#inn', tool: '', isActive: false, isEdit: false } }
    : actor)
  const rooms = scene.rooms.map((room, index) => nodeForRoom(room, index, scene)).sort((a, b) => a.slot - b.slot || a.key.localeCompare(b.key))
  const board: Node = { key: 'board', kind: 'board', title: 'Patchboard', slot: 0 }
  const terminal: Node = { key: 'terminal', kind: 'terminal', title: 'Terminal', slot: 1 }
  const crewLodge: Node = { key: 'crew', kind: 'crew', title: 'Crew Lodge', slot: 2 }
  const camp: Node = { key: 'inn', kind: 'inn', title: 'Camp', slot: 3 }
  const locate = (activity: Activity) => activityNode(activity, rooms, board, terminal, crewLodge, camp)
  const mainActor = visible.find(actor => actor.id === (scene.focusAgent ?? '0')) ?? visible[0]!
  const current = !scene.isTurn && !scene.focusAgent ? camp : locate(mainActor.activity)
  const at = (node: Node) => visible.filter(actor => locate(actor.activity).key === node.key)
  // Bugs stay where the failing check ran until a later check passes; a beaten one lingers to fall.
  const mobs = (scene.mobs ?? []).filter(mob => mob.defeatedAt === undefined || scene.now - mob.defeatedAt < 2600)
  const mobsAt = (node: Node) => mobs.filter(mob => locate({ tool: '', file: mob.file, at: 0, isActive: false, isEdit: false }).key === node.key)
  const attentionOrder = [...rooms].sort((a, b) => {
    const aCrew = at(a)
    const bCrew = at(b)
    const aWork = aCrew.filter(actor => actor.activity.isActive || running.has(actor.id)).length + mobsAt(a).length
    const bWork = bCrew.filter(actor => actor.activity.isActive || running.has(actor.id)).length + mobsAt(b).length
    return bWork - aWork || Math.max(0, ...bCrew.map(actor => actor.activity.at)) - Math.max(0, ...aCrew.map(actor => actor.activity.at)) || a.slot - b.slot
  })
  const terminalActive = visible.some(actor => actor.activity.file === '#terminal') || mobsAt(terminal).length > 0
  const crewActive = visible.some(actor => actor.id !== '0' && actor.activity.file === '#crew')
  const stations = [board, ...(terminalActive ? [terminal] : []), ...(crewActive ? [crewLodge] : []), ...attentionOrder]
  const nearby = scene.focusAgent ? [] : stations.filter(node => node.key !== current.key)
  const columns = width * zoom < 280 ? 1 : 2
  const shown = nearby.slice(0, columns === 1 ? 2 : 4)
  const hidden = nearby.length - shown.length
  const gap = columns === 1 ? 0 : 7
  const cardWidth = (width - 14 - gap) / columns
  const cardHeight = Math.max(62, Math.round(cardWidth / 3.4 + 12))
  const rowGap = 7
  const rows = Math.ceil(shown.length / columns)
  const stageX = 7
  const stageY = 28
  const stageWidth = width - 14
  // The stage keeps a caption band above a floor tall enough for a readable worker.
  const titleFont = 7.4 * scale
  const fileFont = 10 * scale
  const band = Math.round(titleFont + fileFont + 11)
  const stageHeight = Math.max(band + 64, Math.round(stageWidth / 3.1))
  const nearbyY = stageY + stageHeight + 17
  const cardsY = nearbyY + 9
  const footerY = cardsY + rows * (cardHeight + rowGap) + (hidden ? 2 : 0) + (shown.length ? 3 : -12)
  const height = footerY + 22
  const spots: Record<string, Spot> = {}
  const motion = scene.haven?.motion !== false
  const defs = new Map<string, string>()
  const image = (id: string, source: string, w: number, h: number) => defs.set(id, '<image id="' + id + '" href="' + source + '" width="' + w + '" height="' + h + '" image-rendering="pixelated"/>')
  const sceneNames = [...new Set([current, ...shown].map(backgroundFor))]
  const backgrounds = sceneNames.map(name => '<symbol id="aqbg-' + name + '" viewBox="0 0 256 82" preserveAspectRatio="xMidYMid slice"><image href="' + (name === 'guild' ? AGENT_QUEST_GUILD : AGENT_QUEST_SCENES[name]!) + '" width="256" height="82" image-rendering="pixelated"/></symbol>').join('')
  const bits: string[] = [
    '<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Patchhaven live work trail" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '" font-family="ui-monospace,Menlo,Consolas,monospace" shape-rendering="crispEdges">',
    '<rect width="' + width + '" height="' + height + '" fill="#101a1b"/>',
    '<path d="M2 22h' + (width - 4) + '" stroke="#4a6357"/>',
    '<text x="9" y="15" font-size="' + n(9.5 * scale) + '" font-weight="700" letter-spacing="1" fill="#e0c782">PATCH TRAIL</text>',
  ]
  const status = scene.demo ? 'DEMO · ' + scene.demo.toUpperCase() : scene.failure
    ? scene.failure.error === 'rate_limit' ? 'NO RUN ENERGY' : 'TURN PAUSED'
    : scene.stoppedAt !== undefined && scene.now - scene.stoppedAt < 60_000 ? 'STOPPED'
      : scene.compactAt !== undefined && scene.now - scene.compactAt < 5000 ? 'PACKING'
        : scene.isTurn ? 'IN THE FIELD' : background.size ? 'CREW ACTIVE' : 'AT CAMP'
  bits.push('<text x="' + (width - 9) + '" y="15" font-size="' + n(7.7 * scale) + '" text-anchor="end" letter-spacing=".4" fill="' + (scene.failure ? '#e89a87' : '#9bc9a3') + '">' + status + '</text>')
  // Landmark pips sit between the title and the status, and only where both leave room.
  if (width >= 300) for (let mark = 0; mark < 6; mark++) {
    const color = mark < (scene.haven?.landmarks.length ?? 0) ? '#e6c679' : '#46564c'
    const x = width / 2 - 24 + mark * 8
    bits.push('<path d="M' + x + ' 7h4v4h-4z" fill="' + color + '" stroke="#172426" stroke-width=".6"/>')
  }
  if (scene.levelUp && scene.now - scene.levelUp.at < 6000) bits.push('<text x="' + (width / 2) + '" y="21" text-anchor="middle" font-size="' + n(8 * scale) + '" font-weight="700" fill="#f1cc72">LEVEL UP · ' + scene.levelUp.level + '</text>')

  // A small original prop for each kind of work, in the sprite's own pixel units,
  // standing on the floor at x with its right edge toward the worker.
  const prop = (action: ActorAction, node: Node, x: number, floor: number, u: number, live: boolean): string => {
    const r = (px: number, py: number, w: number, h: number, fill: string, extra = '') => '<rect x="' + n(x + px * u) + '" y="' + n(floor - py * u) + '" width="' + n(w * u) + '" height="' + n(h * u) + '" fill="' + fill + '"' + extra + '/>'
    const animate = motion && live
    const blink = (dur: string, begin = '0s') => animate ? '><animate attributeName="opacity" values="1;.15;1" keyTimes="0;.5;1" calcMode="discrete" dur="' + dur + '" begin="' + begin + '" repeatCount="indefinite"/></rect>' : '/>'
    const lectern = r(-1, 7, 10, 2, '#6b4a2f') + r(3, 5, 3, 5, '#4f3522') + r(1, 1, 7, 1, '#3c2a1c')
    if (action === 'idle' && node.kind === 'inn') {
      // A campfire: logs, a flame that flickers, embers when moving.
      return '<g data-prop="campfire">' + r(-2, 1, 11, 2, '#5b3a22') + r(0, 2, 7, 1, '#7a4f2c') +
        '<g>' + (animate ? '<animate attributeName="opacity" values="1;.7;1;.85;1" dur="1.6s" repeatCount="indefinite"/>' : '') +
        r(1, 7, 5, 5, '#e2722c') + r(2, 9, 3, 2, '#f2a33a') + r(3, 10, 1, 3, '#ffe08a') + '</g>' +
        (animate ? '<circle cx="' + n(x + 4 * u) + '" cy="' + n(floor - 10 * u) + '" r="' + n(.6 * u) + '" fill="#ffcf6e"><animate attributeName="cy" values="' + n(floor - 10 * u) + ';' + n(floor - 18 * u) + '" dur="1.8s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;0" dur="1.8s" repeatCount="indefinite"/></circle>' : '') + '</g>'
    }
    if (action === 'replying') {
      // A message scroll with a line being written.
      return '<g data-prop="scroll">' + lectern + r(-.5, 12, 9, 1.4, '#c9b48a') + r(0, 11, 8, 5, '#efe3c4') + r(-.5, 6.4, 9, 1.4, '#c9b48a') +
        '<rect x="' + n(x + 1 * u) + '" y="' + n(floor - 9.4 * u) + '" width="' + n(5.5 * u) + '" height="' + n(.6 * u) + '" fill="#5d4a36">' + (animate ? '<animate attributeName="width" values="0;' + n(5.5 * u) + '" dur="1.4s" repeatCount="indefinite"/>' : '') + '</rect></g>'
    }
    if (action === 'editing' || action === 'creating') {
      // A page on a lectern; new lines are inked while the edit runs.
      const glow = action === 'creating' ? r(-2, 12, 14, 6, '#f2c768', ' opacity=".28"') : ''
      const lines = [0, 1, 2].map(line => '<rect x="' + n(x + 1 * u) + '" y="' + n(floor - (10 - line * 1.4) * u) + '" width="' + n((line === 2 ? 4 : 6) * u) + '" height="' + n(.6 * u) + '" fill="#5d4a36">' +
        (animate ? '<animate attributeName="width" values="0;' + n((line === 2 ? 4 : 6) * u) + '" dur=".9s" begin="' + (line * .3) + 's" fill="freeze"/>' : '') + '</rect>').join('')
      return '<g data-prop="' + (action === 'creating' ? 'new-page' : 'page') + '">' + glow + lectern + r(0, 11, 8, 5, '#efe3c4') + lines + (action === 'creating' ? r(8, 13, 1, 3, '#ffe08a', '') + r(7, 12, 3, 1, '#ffe08a', '') : '') + '</g>'
    }
    if (action === 'reading' || action === 'searching') {
      // An open book; a search sweeps a lens across it.
      const book = r(-1, 10, 5, 4, '#efe3c4') + r(4, 10, 5, 4, '#e3d4ae') + r(3.6, 10, .8, 4, '#7d5a3a')
      const lens = action === 'searching'
        ? '<g>' + (animate ? '<animateTransform attributeName="transform" type="translate" values="0 0;' + n(5 * u) + ' 0;0 0" dur="1.6s" repeatCount="indefinite"/>' : '') + '<circle cx="' + n(x + 1 * u) + '" cy="' + n(floor - 11 * u) + '" r="' + n(1.6 * u) + '" fill="#9fd6e8" fill-opacity=".35" stroke="#2c2c2c" stroke-width="' + n(.6 * u) + '"/>' + r(2, 9.4, 2, .7, '#2c2c2c') + '</g>'
        : '<rect x="' + n(x + 4.4 * u) + '" y="' + n(floor - 10 * u) + '" width="' + n(4 * u) + '" height="' + n(4 * u) + '" fill="#cdbb92"' + blink('2.4s') + ''
      return '<g data-prop="' + (action === 'searching' ? 'lens' : 'book') + '">' + lectern + book + lens + '</g>'
    }
    if (action === 'testing') {
      // A training dummy that rocks with each strike.
      return '<g data-prop="dummy">' + r(3, 12, 1, 12, '#6b4a2f') + '<g>' + (animate ? '<animateTransform attributeName="transform" type="translate" values="0 0;' + n(-.8 * u) + ' 0;0 0" keyTimes="0;.15;1" dur="' + n(AGENT_QUEST_FRAMES / WORK_FPS + .6) + 's" begin=".4s" repeatCount="indefinite"/>' : '') +
        r(1, 11, 5, 5, '#c9a35c') + r(2, 15, 3, 3, '#d8b878') + r(2.6, 9.4, 1.8, 1.8, '#b43d3d') + '</g>' + r(1, 1, 5, 1, '#4f3522') + '</g>'
    }
    if (action === 'researching') {
      // A globe on a stand with a turning meridian.
      return '<g data-prop="globe">' + r(3, 4, 1, 4, '#6b4a2f') + r(1, 1, 5, 1, '#4f3522') + '<circle cx="' + n(x + 3.5 * u) + '" cy="' + n(floor - 9 * u) + '" r="' + n(3.4 * u) + '" fill="#4f8fb8" stroke="#24384a" stroke-width="' + n(.5 * u) + '"/>' +
        r(1.5, 10, 2, 2, '#7cbf6a') + r(4, 8, 1.6, 1.4, '#7cbf6a') + '<rect x="' + n(x + 1 * u) + '" y="' + n(floor - 12.2 * u) + '" width="' + n(.6 * u) + '" height="' + n(6.4 * u) + '" fill="#e8f2f6" opacity=".8">' +
        (animate ? '<animate attributeName="x" values="' + n(x + 1 * u) + ';' + n(x + 5.6 * u) + '" dur="1.4s" repeatCount="indefinite"/>' : '') + '</rect></g>'
    }
    if (action === 'applying') {
      // A rune circle on the floor that pulses while a batch of changes lands.
      return '<g data-prop="rune"><ellipse cx="' + n(x + 4 * u) + '" cy="' + n(floor - .6 * u) + '" rx="' + n(7 * u) + '" ry="' + n(1.8 * u) + '" fill="none" stroke="#9fd0ff" stroke-width="' + n(.6 * u) + '" stroke-dasharray="' + n(1.2 * u) + ' ' + n(.8 * u) + '">' +
        (animate ? '<animate attributeName="stroke-dashoffset" values="0;' + n(4 * u) + '" dur="1.2s" repeatCount="indefinite"/>' : '') + '</ellipse>' + r(0, 9, 8, 4, '#efe3c4') + r(1, 10, 8, 4, '#e3d4ae') + r(2, 11, 8, 4, '#f1e8cf') + '</g>'
    }
    if (action === 'command') {
      // A console with a prompt and a blinking cursor.
      return '<g data-prop="console">' + r(-1, 12, 10, 8, '#2a3438') + r(0, 11, 8, 6, '#0d1f17') + r(1, 9.5, 1, 1, '#82efa4') + r(2.4, 9.5, 3, 1, '#82efa4') +
        '<rect x="' + n(x + 1 * u) + '" y="' + n(floor - 7.5 * u) + '" width="' + n(1.4 * u) + '" height="' + n(1 * u) + '" fill="#82efa4"' + blink('.9s') + r(2, 4, 4, 4, '#2a3438') + r(0, 1, 8, 1, '#1d2528') + '</g>'
    }
    if (action === 'tool' || action === 'working') {
      // A turning gear on a workbench.
      const cx = x + 4 * u
      const cy = floor - 10 * u
      const teeth = [0, 45, 90, 135].map(deg => '<rect x="' + n(cx - .8 * u) + '" y="' + n(cy - 3.6 * u) + '" width="' + n(1.6 * u) + '" height="' + n(7.2 * u) + '" fill="#a9b4bb" transform="rotate(' + deg + ' ' + n(cx) + ' ' + n(cy) + ')"/>').join('')
      return '<g data-prop="gear">' + lectern + '<g>' + (animate ? '<animateTransform attributeName="transform" type="rotate" values="0 ' + n(cx) + ' ' + n(cy) + ';90 ' + n(cx) + ' ' + n(cy) + '" dur="1.2s" repeatCount="indefinite"/>' : '') + teeth + '<circle cx="' + n(cx) + '" cy="' + n(cy) + '" r="' + n(2.6 * u) + '" fill="#8a959c"/><circle cx="' + n(cx) + '" cy="' + n(cy) + '" r="' + n(1 * u) + '" fill="#2a3438"/></g></g>'
    }
    if (action === 'delegating') {
      // A sealed work order that flies off to the crew.
      return '<g data-prop="order">' + lectern + '<g>' + (animate ? '<animateTransform attributeName="transform" type="translate" values="0 0;' + n(-10 * u) + ' ' + n(-6 * u) + '" dur="1.4s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;1;0" keyTimes="0;.7;1" dur="1.4s" repeatCount="indefinite"/>' : '') +
        r(1, 11, 6, 4, '#efe3c4') + r(3.4, 9.6, 1.4, 1.4, '#b43d3d') + '</g></g>'
    }
    if (action === 'planning') {
      // The work-order board; the current step's note is pinned with a moving tick.
      return '<g data-prop="board">' + r(-1, 15, 10, 9, '#6b4a2f') + r(0, 14, 8, 7, '#a37a4d') + r(.6, 13.4, 3, 2.4, '#efe3c4') + r(4.4, 13.4, 3, 2.4, '#efe3c4') + r(.6, 10.4, 3, 2.4, '#efe3c4') +
        '<rect x="' + n(x + 4.4 * u) + '" y="' + n(floor - 10.4 * u) + '" width="' + n(3 * u) + '" height="' + n(2.4 * u) + '" fill="#f2c768"' + blink('1.8s') + r(1, 6, 1, 6, '#4f3522') + r(6, 6, 1, 6, '#4f3522') + '</g>'
    }
    return ''
  }

  const mobArt = (mob: Mob, x: number, floor: number, size: number, hurt: boolean) => {
    const id = mob.file === '#terminal' ? 'glitch_pit' : 'circuit_catacombs'
    image('aqmob-' + id, AGENT_QUEST_MOBS[id], AGENT_QUEST_FRAME * AGENT_QUEST_FRAMES, AGENT_QUEST_FRAME)
    const beaten = mob.defeatedAt !== undefined
    const u = size / AGENT_QUEST_FRAME
    const out: string[] = ['<g data-mob="' + esc(mob.id) + '" data-mob-state="' + (beaten ? 'defeated' : hurt ? 'hurt' : 'lurking') + '" aria-label="' + (beaten ? 'Bug defeated' : 'Bug from a failing check') + '">']
    out.push('<ellipse cx="' + n(x) + '" cy="' + n(floor - 1) + '" rx="' + n(size * .2) + '" ry="' + n(1.6 * u + 1) + '" fill="#091211" opacity=".55"/>')
    // Mirrored so the bug faces the worker who comes to fix it.
    out.push('<g transform="translate(' + n(x) + ' ' + n(floor) + ') scale(-1 1)"' + (beaten && !motion ? ' opacity=".35"' : '') + '>')
    if (beaten && motion) out.push('<animate attributeName="opacity" values="1;0" dur=".9s" fill="freeze"/>')
    if (hurt && motion && !beaten) out.push('<animate attributeName="opacity" calcMode="discrete" values="1;.35;1;1" keyTimes="0;.08;.16;1" dur="' + n(AGENT_QUEST_FRAMES / WORK_FPS + .6) + 's" begin=".4s" repeatCount="indefinite"/>')
    out.push('<svg x="' + n(-size / 2) + '" y="' + n(-size * FOOT / AGENT_QUEST_FRAME) + '" width="' + n(size) + '" height="' + n(size) + '" viewBox="0 0 56 56" overflow="hidden">' + strip('aqmob-' + id, AGENT_QUEST_FRAMES, MOB_FPS, motion && !beaten && !lean) + '</svg></g>')
    if (beaten) {
      out.push('<text x="' + n(x) + '" y="' + n(floor - size * .62) + '" text-anchor="middle" font-size="' + n(Math.max(7, 6.4 * scale)) + '" font-weight="700" fill="#9be08a">SQUASHED</text>')
    } else {
      // One pip per failing check reported, up to five.
      const pip = Math.max(2.4, 1.6 * u)
      const top = floor - size * (FOOT - HEAD) / AGENT_QUEST_FRAME - pip - 3
      for (let i = 0; i < mob.hp; i++) out.push('<rect x="' + n(x - (mob.hp * (pip + 1)) / 2 + i * (pip + 1)) + '" y="' + n(top) + '" width="' + n(pip) + '" height="' + n(pip) + '" fill="#d8524a" stroke="#2a0e0e" stroke-width=".5"/>')
    }
    out.push('</g>')
    return out.join('')
  }

  const assigned = (actor: Agent) => actor.activity.isActive || (actor.id !== '0' && running.has(actor.id))
  // Draws one worker standing on `feet`; `stroke` lets the stage worker keep its
  // animated strip when a crowded scene must hold the others to one frame.
  const drawActor = (actor: Agent, x: number, feet: number, size: number, node: Node, withProp: boolean, mob: Mob | undefined, stroke = !lean) => {
    const u = size / AGENT_QUEST_FRAME
    // A worker who changed places on the same spot walks in from the room's west side.
    const last = scene.from[actor.id]
    const previous = last && last.place !== undefined && last.place !== node.key && Math.hypot(x - last.x, feet - last.y) < 4 ? { x: x - 34 * u, y: feet } : last
    const dx = previous ? x - previous.x : 0
    const dy = previous ? feet - previous.y : 0
    const distance = Math.hypot(dx, dy)
    const walking = Boolean(previous && motion && distance > 2)
    const walkTime = Math.max(.55, Math.min(1.5, distance / 150))
    const direction: AgentQuestDirection = walking ? facingFromDelta(dx, dy) : 'south'
    const isRunning = actor.id !== '0' && running.has(actor.id)
    const turnActive = actor.id === '0' && scene.isTurn
    const action = activityAction(actor.activity, isRunning, scene.asking[actor.id] !== undefined, turnActive)
    const waiting = action === 'waiting'
    const fighting = Boolean(mob && mob.defeatedAt === undefined && actor.activity.isActive && STRIKES.has(action))
    const striking = actor.activity.isActive && STRIKES.has(action)
    // Work faces its prop (west); waiting and thinking face you; looking work holds the west idle pose.
    const pose: AgentQuestDirection = waiting || action === 'thinking' ? 'south' : striking || FACING_PROP.has(action) || mob ? 'west' : action === 'idle' && node.kind === 'inn' ? 'west' : 'south'
    const role = roleFor(actor.id, hero)
    const art = AGENT_QUEST_SPRITES[role]!
    const color = COLORS[Number(actor.id) % COLORS.length]!
    const live = actor.activity.isActive || action === 'thinking' || action === 'replying' || action === 'planning' || (action === 'idle' && node.kind === 'inn')
    const hurt = scene.splats[actor.id] && (scene.splats[actor.id]!.kind === 'hit' || scene.splats[actor.id]!.kind === 'fail') && scene.now - scene.splats[actor.id]!.at < 1500
    const out: string[] = []
    spots[actor.id] = { x, y: feet, place: node.key }
    if (withProp && !mob) out.push(prop(action, node, x - 24 * u, feet, u * 1.35, live))
    out.push('<ellipse cx="' + n(x) + '" cy="' + n(feet - .5) + '" rx="' + n(Math.max(4, size * .17)) + '" ry="' + n(Math.max(1.6, 1.8 * u)) + '" fill="#091211" opacity=".6"/>')
    out.push('<g transform="translate(' + n(x) + ' ' + n(feet) + ')" data-traveller="' + esc(actor.id) + '">')
    if (motion && scene.departs[actor.id] !== undefined && scene.now - scene.departs[actor.id]! < 1200) out.push('<animate attributeName="opacity" from="1" to="0" dur="1.1s" fill="freeze"/>')
    if (walking) out.push('<animateTransform attributeName="transform" type="translate" additive="sum" from="' + n(-dx) + ' ' + n(-dy) + '" to="0 0" dur="' + n(walkTime) + 's" fill="freeze"/>')
    const spawned = scene.spawns[actor.id]
    if (motion && spawned !== undefined && scene.now - spawned < 1100) out.push('<circle cx="0" cy="' + n(-size * .3) + '" r="8" fill="none" stroke="#f0c86e" stroke-width="1"><animate attributeName="r" from="3" to="' + n(size * .3) + '" dur=".6s" fill="freeze"/><animate attributeName="opacity" from=".85" to="0" dur=".6s" fill="freeze"/></circle>')
    out.push('<g data-agent="' + esc(actor.id) + '" data-role="' + role + '" data-state="' + (walking ? 'walking' : action) + '" data-action="' + action + '">')
    if (hurt && motion) out.push('<animate attributeName="opacity" calcMode="discrete" values="1;.3;1;.3;1" dur=".5s" repeatCount="2"/>')
    // Breathing for anyone not striking: a one-pixel rise, slower at rest.
    if (motion && !striking && !walking) out.push('<animateTransform attributeName="transform" type="translate" values="0 0;0 ' + n(-u) + ';0 0" dur="' + (action === 'idle' ? '2.4s' : action === 'thinking' || action === 'waiting' ? '1.2s' : '1.8s') + '" repeatCount="indefinite"/>')
    const frame = (inner: string) => '<svg x="' + n(-size / 2) + '" y="' + n(-size * FOOT / AGENT_QUEST_FRAME) + '" width="' + n(size) + '" height="' + n(size) + '" viewBox="0 0 56 56" overflow="hidden">' + inner + '</svg>'
    const attackId = 'aq-' + role + '-attack'
    const idleId = 'aq-' + role + '-idle-' + pose
    const standing = () => {
      if (striking && stroke) {
        image(attackId, art.attack, AGENT_QUEST_FRAME * AGENT_QUEST_FRAMES, AGENT_QUEST_FRAME)
        // A full stroke, then a breath: a rhythm that reads as work rather than a spar.
        return strip(attackId, AGENT_QUEST_FRAMES, WORK_FPS, motion && stroke, { rest: .6, begin: walking ? walkTime : 0, frame: 4 })
      }
      image(idleId, art.idle[pose], AGENT_QUEST_FRAME, AGENT_QUEST_FRAME)
      return '<use href="#' + idleId + '"/>'
    }
    if (walking && stroke) {
      const walkId = 'aq-' + role + '-walk-' + direction
      image(walkId, art.walk[direction], AGENT_QUEST_FRAME * AGENT_QUEST_FRAMES, AGENT_QUEST_FRAME)
      out.push('<g>' + frame(strip(walkId, AGENT_QUEST_FRAMES, WALK_FPS, true)) + '<animate attributeName="opacity" calcMode="discrete" values="1;0" keyTimes="0;1" dur="' + n(walkTime) + 's" fill="freeze"/></g>')
      out.push('<g opacity="0">' + frame(standing()) + '<animate attributeName="opacity" calcMode="discrete" values="0;1" keyTimes="0;1" dur=".01s" begin="' + n(walkTime) + 's" fill="freeze"/></g>')
    } else {
      out.push(frame(standing()))
    }
    out.push('</g></g>')
    // The worker's marker sits on the ground; the action badge floats over the head.
    out.push('<path d="M' + n(x - 1.6) + ' ' + n(feet + 2.4) + 'h3.2v1.6h-3.2z" fill="' + color + '"/>')
    const headTop = feet - size * (FOOT - HEAD) / AGENT_QUEST_FRAME
    if (action !== 'idle' && action !== 'waiting') {
      const badge = Math.max(9, Math.min(13, size * .17))
      const badgeX = x - badge / 2
      const badgeY = headTop - badge - 2
      out.push('<g data-action-marker="' + action + '">')
      if (motion && actor.activity.isActive) out.push('<rect x="' + n(badgeX - 1) + '" y="' + n(badgeY - 1) + '" width="' + n(badge + 2) + '" height="' + n(badge + 2) + '" rx="3" fill="none" stroke="#f5d780" stroke-width=".8"><animate attributeName="opacity" values=".9;0;.9" dur="1.6s" repeatCount="indefinite"/></rect>')
      out.push('<rect x="' + n(badgeX) + '" y="' + n(badgeY) + '" width="' + n(badge) + '" height="' + n(badge) + '" rx="2.5" fill="' + (action === 'thinking' ? '#1b3430' : '#24372c') + '" stroke="' + (action === 'thinking' ? '#9cc8a1' : actor.activity.isActive ? '#efca75' : '#8fa58c') + '" stroke-width=".8"/>')
      if (action === 'thinking') {
        // Three dots that light in turn while the worker thinks between tools.
        for (let dot = 0; dot < 3; dot++) out.push('<rect x="' + n(badgeX + badge * (.2 + dot * .24)) + '" y="' + n(badgeY + badge * .45) + '" width="' + n(badge * .14) + '" height="' + n(badge * .14) + '" fill="#cfe7c9"' + (motion ? '><animate attributeName="opacity" values=".25;1;.25" dur="1.2s" begin="' + (dot * .2).toFixed(1) + 's" repeatCount="indefinite"/></rect>' : '/>'))
      } else {
        out.push(actionIcon(action, badgeX + badge * .18, badgeY + badge * .18, badge * .64, actor.activity.isActive ? '#ffe6a1' : '#cfd8c4'))
      }
      out.push('</g>')
    }
    if (waiting) {
      const bubble = Math.max(11, Math.min(14, size * .19))
      out.push('<g transform="translate(' + n(x - bubble / 2) + ' ' + n(headTop - bubble - 3) + ')"' + (motion ? '><animateTransform attributeName="transform" type="translate" additive="sum" values="0 0;0 -1.5;0 0" dur=".8s" repeatCount="indefinite"/>' : '>') + '<rect width="' + n(bubble) + '" height="' + n(bubble) + '" rx="3" fill="#f0d17d" stroke="#533b2b"/><text x="' + n(bubble / 2) + '" y="' + n(bubble * .74) + '" text-anchor="middle" font-size="' + n(bubble * .72) + '" font-weight="700" fill="#33271e">?</text></g>')
    }
    return { svg: out.join(''), fighting }
  }

  const ambient = (node: Node, x: number, y: number, w: number, h: number) => {
    if (!motion) return
    if (node.kind === 'terminal') bits.push('<rect x="' + n(x + w - 17) + '" y="' + n(y + h * .35) + '" width="3" height="3" fill="#82efa4"><animate attributeName="opacity" values=".2;1;.2" dur="1.6s" repeatCount="indefinite"/></rect>')
    else if (node.kind === 'forge') bits.push('<circle cx="' + n(x + w * .5) + '" cy="' + n(y + h - 11) + '" r="1.5" fill="#ffb46f"><animate attributeName="cy" values="' + n(y + h - 9) + ';' + n(y + h * .45) + '" dur="2.2s" repeatCount="indefinite"/><animate attributeName="opacity" values=".8;0" dur="2.2s" repeatCount="indefinite"/></circle>')
  }

  // ── The stage: the current place, its caption band, and its workers on the floor.
  const stageActors = at(current).slice(0, 4)
  const stageActor = stageActors.find(actor => actor.id === mainActor.id) ?? mainActor
  const stageDesk = current.room?.desks.find(desk => samePath(desk.path, stageActor.activity.file)) ?? current.room?.desks.find(desk => desk.touch.isActive)
  const stageFile = current.kind === 'inn' ? 'Resting between turns'
    : current.kind === 'board' ? scene.steps.find(step => step.status === 'in_progress')?.text ?? scene.steps[0]?.text ?? 'Plan the next patch'
      : current.kind === 'terminal' ? stageActor.activity.tool || 'Running a command'
        : current.kind === 'crew' ? (scene.crew ?? []).find(member => String(member.index) === stageActor.id)?.description ?? (stageActor.activity.tool.replace(/^↗\s*/, '') || 'Between file assignments')
          : stageDesk?.name ?? (current.kind === 'folder' ? stageActor.activity.file.split('/').at(-1) : current.title) ?? current.title
  const stageStatus = current.kind === 'inn' ? 'READY FOR WORK'
    : labelFor(stageActor.activity, scene.asking[stageActor.id] !== undefined, stageActor.id !== '0' && running.has(stageActor.id), stageActor.id === '0' && scene.isTurn)
  const accentOf = (node: Node) => node.kind === 'folder' ? palette(node.title).accent : node.kind === 'forge' ? '#df9160' : node.kind === 'test' ? '#91bd86' : node.kind === 'library' ? '#c5a2d2' : node.kind === 'terminal' ? '#81c4bd' : node.kind === 'crew' ? '#9bc9a3' : node.kind === 'inn' ? '#e8a35c' : '#e0c782'
  const stageAccent = accentOf(current)
  bits.push('<g data-current-location="' + esc(current.key) + '" data-station="' + current.kind + '" aria-label="Current scene: ' + esc(current.title) + '">')
  bits.push('<use href="#aqbg-' + backgroundFor(current) + '" x="' + stageX + '" y="' + stageY + '" width="' + stageWidth + '" height="' + stageHeight + '"/>')
  // A soft vignette at the top keeps the caption readable over any backdrop.
  bits.push('<rect x="' + stageX + '" y="' + stageY + '" width="' + stageWidth + '" height="' + band + '" fill="#0c1414" opacity=".82"/>')
  bits.push('<path d="M' + stageX + ' ' + (stageY + band) + 'h' + stageWidth + '" stroke="' + stageAccent + '" stroke-width=".6" opacity=".7"/>')
  const statusWidth = Math.min(stageWidth * .46, stageStatus.length * 4.7 * scale + 8)
  bits.push('<text x="' + (stageX + 7) + '" y="' + n(stageY + titleFont + 3) + '" font-size="' + n(titleFont) + '" font-weight="700" letter-spacing=".5" fill="' + stageAccent + '">NOW · ' + esc(clip(current.title.toUpperCase(), Math.floor((stageWidth - statusWidth - 20) / (4.9 * scale)))) + '</text>')
  bits.push('<text x="' + (stageX + stageWidth - 7) + '" y="' + n(stageY + titleFont + 3) + '" text-anchor="end" font-size="' + n(titleFont) + '" font-weight="700" letter-spacing=".3" fill="' + (scene.asking[stageActor.id] !== undefined ? '#f0d17d' : '#e2c579') + '">' + esc(clip(stageStatus, Math.floor(statusWidth / (4.7 * scale)))) + '</text>')
  const newTag = stageDesk?.touch.isNew ? 'NEW · +' + (stageDesk.change?.add ?? stageDesk.touch.add ?? 0) : ''
  bits.push('<text x="' + (stageX + 7) + '" y="' + n(stageY + band - 5) + '" font-size="' + n(fileFont) + '" font-weight="700" fill="#f1efdf">' + esc(clip(stageFile, Math.floor((stageWidth - 16 - newTag.length * 5.2 * scale) / (6 * scale)))) + '</text>')
  if (newTag) bits.push('<text x="' + (stageX + stageWidth - 7) + '" y="' + n(stageY + band - 5) + '" text-anchor="end" font-size="' + n(titleFont) + '" font-weight="700" fill="#f2c768">' + newTag + '</text>')
  ambient(current, stageX, stageY + band, stageWidth, stageHeight - band)
  const floor = stageY + stageHeight - Math.max(6, stageHeight * .1)
  const stageSize = Math.min(118 * scale / 1.38, (floor - stageY - band - 16) * AGENT_QUEST_FRAME / (FOOT - HEAD))
  const su = stageSize / AGENT_QUEST_FRAME
  const stageMobs = mobsAt(current)
  // The current worker stands right of centre with room for its prop to the west;
  // anyone else in the room stands further along the floor, slightly staggered.
  const mainX = stageX + Math.max(stageWidth * .56, 26 * su)
  const order = [stageActor, ...stageActors.filter(actor => actor !== stageActor)]
  const placed = order.map((actor, index) => {
    const step = 21 * su
    let x = mainX + index * step
    if (x > stageX + stageWidth - 9 * su) x = mainX - 30 * su - (index - Math.floor((stageX + stageWidth - 9 * su - mainX) / step) - 1) * step
    return { actor, x, feet: floor - (index % 2) * 3 * su }
  })
  const stageMob = stageMobs[0]
  if (stageMob) bits.push(mobArt(stageMob, mainX - 22 * su, floor, stageSize * .86, placed.some(({ actor }) => actor.activity.isActive && STRIKES.has(activityAction(actor.activity, false, false, false)))))
  for (const { actor, x, feet } of [...placed].sort((a, b) => a.feet - b.feet)) {
    bits.push(drawActor(actor, x, feet, stageSize, current, actor === stageActor, actor === stageActor ? stageMob : undefined, actor === stageActor || !lean).svg)
  }
  const stageDrop = stageDesk ? scene.drops[stageDesk.path] : undefined
  if (stageDrop && scene.now - stageDrop.at < 2500) {
    // The XP an edit earned rises beside the worker's badge.
    const dropX = mainX + Math.max(9, stageSize * .17) / 2 + 4
    const dropY = floor - stageSize * (FOOT - HEAD) / AGENT_QUEST_FRAME - 4
    bits.push('<text x="' + n(dropX) + '" y="' + n(dropY) + '" font-size="' + n(8.5 * scale) + '" font-weight="700" fill="#f2c768" stroke="#1b1408" stroke-width="1.4" paint-order="stroke">+' + stageDrop.xp + (motion ? '<animate attributeName="y" values="' + n(dropY + 4) + ';' + n(dropY - 6) + '" dur="1.2s" fill="freeze"/>' : '') + '</text>')
  }
  const stageSplatActor = stageActors.find(actor => scene.splats[actor.id] && scene.now - scene.splats[actor.id]!.at < 3000)
  const stageSplat = stageSplatActor ? scene.splats[stageSplatActor.id] : undefined
  if (stageSplat) {
    const glyph = stageSplat.kind === 'pass' ? '✓' : stageSplat.kind === 'denied' ? '✋' : stageSplat.kind === 'hit' ? String(stageSplat.damage) : '×'
    const spot = spots[stageSplatActor!.id]!
    const sx = spot.x + 6 * su
    const sy = spot.y - stageSize * .52
    bits.push('<g data-splat="' + stageSplat.kind + '"><rect x="' + n(sx) + '" y="' + n(sy) + '" width="14" height="14" fill="' + (stageSplat.kind === 'pass' ? '#2f8f2f' : '#b43d3d') + '" stroke="#0b1315"/><text x="' + n(sx + 7) + '" y="' + n(sy + 10.5) + '" text-anchor="middle" font-size="9" font-weight="700" fill="#fff">' + glyph + '</text></g>')
  }
  bits.push('<rect x="' + stageX + '" y="' + stageY + '" width="' + stageWidth + '" height="' + stageHeight + '" fill="none" stroke="' + (scene.failure ? '#d87865' : stageAccent) + '" stroke-width="1.2"/>', '</g>')

  // ── Nearby stations: a strip of cards, each a small window on its room.
  if (shown.length) {
    bits.push('<text x="9" y="' + (nearbyY + 1) + '" font-size="' + n(7.5 * scale) + '" font-weight="700" letter-spacing="1" fill="#d7c491">NEARBY STATIONS</text>')
    bits.push('<text x="' + (width - 9) + '" y="' + (nearbyY + 1) + '" text-anchor="end" font-size="' + n(7 * scale) + '" fill="#84968a">' + (hidden ? shown.length + ' OF ' + nearby.length : shown.length + (shown.length === 1 ? ' PLACE' : ' PLACES')) + '</text>')
  }
  const cardSize = Math.min(cardHeight * .95, 76)
  const cu = cardSize / AGENT_QUEST_FRAME
  shown.forEach((node, index) => {
    const row = Math.floor(index / columns)
    const col = index % columns
    const x = columns === 2 ? 7 + col * (cardWidth + gap) : 7
    const y = cardsY + row * (cardHeight + rowGap)
    const occupants = at(node)
    const nodeMobs = mobsAt(node)
    const workers = occupants.slice(0, cardWidth > 190 ? 3 : 2)
    const active = occupants.some(assigned) || nodeMobs.some(mob => mob.defeatedAt === undefined)
    const accent = accentOf(node)
    const desk = node.room?.desks.find(file => occupants.some(agent => samePath(agent.activity.file, file.path))) ?? node.room?.desks.find(file => file.touch.isActive) ?? node.room?.desks[node.room.desks.length - 1]
    const agent = occupants[0]
    const fileName = node.kind === 'terminal' ? agent?.activity.tool || (nodeMobs.length ? 'Failing check' : 'Running a command')
      : node.kind === 'board' ? scene.steps.find(step => step.status === 'in_progress')?.text ?? scene.steps[0]?.text ?? 'Plan the next patch'
        : node.kind === 'crew' ? (scene.crew ?? []).find(member => String(member.index) === agent?.id)?.description ?? 'Waiting for a file assignment'
          : desk?.name ?? node.title
    const change = (desk?.change?.add ?? desk?.touch.add ?? 0) + (desk?.change?.del ?? desk?.touch.del ?? 0)
    const liveMob = nodeMobs.find(mob => mob.defeatedAt === undefined)
    const state = node.kind === 'board'
      ? (occupants.some(member => scene.asking[member.id] !== undefined) ? 'AWAITING APPROVAL' : scene.questStatus === 'blocked' ? 'QUEST PAUSED' : scene.questStatus === 'cancelled' ? 'QUEST CANCELLED' : scene.questStatus === 'replaced' ? 'NEW PATCH' : scene.questStatus === 'completed' ? 'QUEST COMPLETE' : scene.steps.length ? scene.steps.filter(step => step.status === 'completed').length + '/' + scene.steps.length + ' STEPS' : 'READY FOR WORK')
      : agent ? labelFor(agent.activity, scene.asking[agent.id] !== undefined, agent.id !== '0' && running.has(agent.id), agent.id === '0' && scene.isTurn)
        : liveMob ? 'BUG LOOSE · CHECK FAILED'
          : desk?.touch.isNew ? 'NEW · +' + (desk.change?.add ?? desk.touch.add ?? 0) : desk?.touch.kind === 'read' ? 'LAST READ' : change ? 'PATCH SAVED · +' + change : 'RECENT DISTRICT'
    const crowd = workers.length + (nodeMobs.length ? 1 : 0)
    const occupied = crowd ? Math.min(cardWidth * .5, 10 + crowd * 15 * cu) : 0
    bits.push('<g data-station="' + node.kind + '" aria-label="' + esc(node.title + ' work station') + '">')
    bits.push('<svg x="' + n(x) + '" y="' + n(y) + '" width="' + n(cardWidth) + '" height="' + cardHeight + '" overflow="hidden"><use href="#aqbg-' + backgroundFor(node) + '" width="' + n(cardWidth) + '" height="' + cardHeight + '"/></svg>')
    const tab = Math.min(cardWidth - occupied - 8, node.title.length * 5.1 * scale + 12)
    bits.push('<rect x="' + (x + 4) + '" y="' + (y + 3) + '" width="' + n(Math.max(30, tab)) + '" height="' + n(7.3 * scale + 5) + '" fill="#111a19" opacity=".92" stroke="' + accent + '" stroke-width=".5"/>')
    bits.push('<text x="' + (x + 8) + '" y="' + n(y + 7.3 * scale + 4.5) + '" font-size="' + n(7.3 * scale) + '" font-weight="700" letter-spacing=".35" fill="' + accent + '">' + esc(clip(node.title.toUpperCase(), Math.floor((Math.max(30, tab) - 8) / (5 * scale)))) + '</text>')
    const boxWidth = cardWidth - 8 - occupied
    const boxHeight = n(9.3 * scale + 7 * scale + 6)
    bits.push('<rect x="' + (x + 4) + '" y="' + n(y + cardHeight - 4 - boxHeight) + '" width="' + n(boxWidth) + '" height="' + boxHeight + '" fill="#101719" opacity=".9" stroke="#596c61" stroke-width=".5"/>')
    const textMax = Math.max(5, Math.floor((boxWidth - 10) / (5.9 * scale)))
    bits.push('<text x="' + (x + 8) + '" y="' + n(y + cardHeight - 7 - 7 * scale - 2) + '" font-size="' + n(9.3 * scale) + '" fill="#f0efdc">' + esc(clip(fileName, textMax)) + '</text>')
    bits.push('<text x="' + (x + 8) + '" y="' + n(y + cardHeight - 7) + '" font-size="' + n(7 * scale) + '" fill="' + (active ? '#f0c86e' : '#b2bdad') + '">' + esc(clip(state, Math.max(5, Math.floor((boxWidth - 10) / (4.7 * scale))))) + '</text>')
    ambient(node, x, y, cardWidth, cardHeight)
    const cardFloor = y + cardHeight - 4
    let wx = x + cardWidth - 13 * cu
    const mob = nodeMobs[0]
    workers.forEach(worker => {
      bits.push(drawActor(worker, wx, cardFloor, cardSize, node, false, undefined).svg)
      const workerDesk = node.room?.desks.find(file => samePath(file.path, worker.activity.file))
      const drop = workerDesk ? scene.drops[workerDesk.path] : undefined
      if (drop && scene.now - drop.at < 2500) bits.push('<text x="' + n(wx) + '" y="' + n(y + 12) + '" text-anchor="middle" font-size="' + n(7 * scale) + '" font-weight="700" fill="#f2c768">+' + drop.xp + '</text>')
      wx -= 16 * cu
    })
    if (mob) bits.push(mobArt(mob, wx - 2 * cu, cardFloor, cardSize * .8, workers.some(worker => worker.activity.isActive && STRIKES.has(activityAction(worker.activity, false, false, false)))))
    const recentDrop = desk ? scene.drops[desk.path] : undefined
    if (!workers.length && recentDrop && scene.now - recentDrop.at < 2500) bits.push('<text x="' + n(x + cardWidth - 9) + '" y="' + n(y + 12) + '" text-anchor="end" font-size="' + n(8 * scale) + '" font-weight="700" fill="#f2c768">+' + recentDrop.xp + '</text>')
    if (occupants.length > workers.length) bits.push('<text x="' + n(x + cardWidth - 5) + '" y="' + n(y + 11) + '" text-anchor="end" font-size="' + n(7 * scale) + '" font-weight="700" fill="#ffe398">+' + (occupants.length - workers.length) + '</text>')
    const splatActor = occupants.find(worker => scene.splats[worker.id] && scene.now - scene.splats[worker.id]!.at < 3000)
    const splat = splatActor ? scene.splats[splatActor.id] : undefined
    if (splat && splatActor) {
      const label = splat.kind === 'pass' ? '✓' : splat.kind === 'denied' ? '✋' : splat.kind === 'hit' ? String(splat.damage) : '×'
      const spot = spots[splatActor.id]!
      const sx = Math.min(x + cardWidth - 13, spot.x + 4 * cu)
      const sy = Math.max(y + 3, spot.y - cardSize * .55)
      bits.push('<g data-splat="' + splat.kind + '"><rect x="' + n(sx) + '" y="' + n(sy) + '" width="11" height="11" fill="' + (splat.kind === 'pass' ? '#2f8f2f' : '#b43d3d') + '" stroke="#0b1315"/><text x="' + n(sx + 5.5) + '" y="' + n(sy + 8.5) + '" text-anchor="middle" font-size="7.5" font-weight="700" fill="#fff">' + label + '</text></g>')
    }
    bits.push('<rect x="' + x + '" y="' + y + '" width="' + n(cardWidth) + '" height="' + cardHeight + '" fill="none" stroke="' + (active ? accent : '#607267') + '" stroke-width="' + (active ? 1.2 : .7) + '"/></g>')
  })

  const completed = scene.steps.filter(step => step.status === 'completed').length
  const activeStep = scene.steps.find(step => step.status === 'in_progress') ?? scene.steps.find(step => step.status === 'pending')
  const crewCount = scene.crewTotal ?? new Set(visible.filter(actor => actor.id !== '0').map(actor => actor.id)).size
  const loose = mobs.filter(mob => mob.defeatedAt === undefined).length
  const footer = scene.steps.length
    ? 'PATCHBOARD ' + completed + '/' + scene.steps.length + ' · ' + (activeStep?.text ? clip(activeStep.text, Math.floor((width - 122) / (5 * scale))) : 'ALL PATCHES COMPLETE')
    : 'CREW ' + crewCount + ' · ' + (scene.haven?.landmarks.length ?? 0) + '/6 MARKS' + (loose ? ' · ' + loose + (loose === 1 ? ' BUG' : ' BUGS') : '') + (hidden ? ' · +' + hidden + ' STATIONS' : '')
  bits.push('<path d="M7 ' + footerY + 'h' + (width - 14) + 'v15H7z" fill="#182522" stroke="#53685b"/>')
  bits.push('<text x="12" y="' + (footerY + 10.5) + '" font-size="' + n(7 * scale) + '" font-weight="700" fill="#e6c679">' + esc(footer) + '</text>')
  if (scene.bank?.total) bits.push('<text x="' + (width - 13) + '" y="' + (footerY + 10.5) + '" text-anchor="end" font-size="' + n(7 * scale) + '" fill="#e6c679">' + scene.bank.total + ' BANKED</text>')
  if (scene.failure) bits.push('<rect x="' + (stageX + stageWidth - 106) + '" y="' + (stageY + band + 4) + '" width="100" height="13" fill="#3d2221" stroke="#d87865"/><text x="' + (stageX + stageWidth - 56) + '" y="' + (stageY + band + 13.5) + '" text-anchor="middle" font-size="' + n(Math.min(7.2 * scale, 8.4)) + '" fill="#f0b2a3">' + (scene.failure.error === 'rate_limit' ? 'OUT OF RUN ENERGY' : 'TURN PAUSED') + '</text>')
  bits.push('<defs>' + backgrounds + [...defs.values()].join('') + '</defs>', '</svg>')
  return { svg: bits.join(''), width, height, spots }
}
