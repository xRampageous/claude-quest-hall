import type { Activity } from '../types'
import { ROOMS } from './art'
import { HEROES } from './haven'
import type { Room, Scene } from './rooms'
import { AGENT_QUEST_GUILD, AGENT_QUEST_SCENES } from './agentquest-backgrounds'
import { AGENT_QUEST_SPRITES } from './agentquest-sprites'
import type { AgentQuestDirection } from './agentquest-sprites'

type Agent = { id: string; activity: Activity }
export type ActorAction = 'editing' | 'creating' | 'reading' | 'searching' | 'testing' | 'researching' | 'applying' | 'command' | 'tool' | 'delegating' | 'planning' | 'thinking' | 'waiting' | 'working' | 'idle'
type Node = {
  key: string
  kind: 'folder' | 'forge' | 'test' | 'library' | 'terminal' | 'board' | 'crew' | 'inn'
  title: string
  slot: number
  room?: Room
}

const COLORS = ['#d8a45e', '#67c7c0', '#d98cb2', '#9acb7b', '#d8c56e', '#8db9e0']
const ROLES = ['mage', 'rogue', 'ranger', 'sage'] as const
const SCENES = Object.keys(AGENT_QUEST_SCENES).sort()
const FRAMES = [0, 4, 8] as const
export const ACTION_GLYPHS: Record<ActorAction, string> = {
  editing: 'E', creating: '+', reading: 'R', searching: 'S', testing: '✓', researching: 'O',
  applying: 'A', command: '$', tool: '*', delegating: '>', planning: '=', thinking: '...', waiting: '?', working: '*', idle: '',
}
const esc = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const clip = (value: string, length: number) => value.length > length ? value.slice(0, Math.max(1, length - 1)) + '…' : value
const samePath = (a: string, b: string) => a.replace(/\\/g, '/').toLowerCase() === b.replace(/\\/g, '/').toLowerCase()
const scaleFor = (width: number) => Math.max(1.1, Math.min(1.38, width / 315))

function palette(value: string) {
  let hash = 0
  for (const char of value.toLowerCase()) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return ROOMS[hash % ROOMS.length]!
}

export function activityAction(activity: Activity, running: boolean, waiting: boolean, turnActive: boolean): ActorAction {
  if (waiting) return 'waiting'
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
    if (activity.mode === 'background') return /^(?:Task|Agent|Delegate)/i.test(activity.tool) ? 'delegating' : 'working'
    if (activity.isEdit) return 'editing'
    return 'working'
  }
  if (activity.mode === 'quests') return 'planning'
  if (running || turnActive) return 'thinking'
  return 'idle'
}

function labelFor(activity: Activity, waiting: boolean, running = false, turnActive = false): string {
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

function roleFor(id: string, hero: number): typeof ROLES[number] {
  if (id === '0') return ROLES[hero] ?? 'mage'
  const others = [0, 1, 2, 3].filter(index => index !== hero)
  const parsed = Number.parseInt(id, 10)
  const castIndex = others[(Number.isFinite(parsed) ? Math.max(1, parsed) - 1 : id.length) % others.length] ?? 0
  return ROLES[castIndex] ?? 'mage'
}

function nodeForRoom(room: Room, index: number, scene: Scene): Node {
  const path = room.desks[0]?.path ?? ''
  const cut = path.lastIndexOf('/')
  const key = room.key ?? (cut < 0 ? 'root' : path.slice(0, cut).toLowerCase())
  const kind: Node['kind'] = room.name === 'Forge' ? 'forge' : /test|spec|quality|qa/i.test(room.name) ? 'test' : /doc|wiki|guide/i.test(room.name) ? 'library' : 'folder'
  return { key: 'room:' + key, kind, title: room.name, room, slot: scene.siteSlots?.[key.toLowerCase()] ?? room.slot ?? index }
}

function backgroundFor(node: Node): string {
  if (node.kind === 'board' || node.kind === 'crew' || node.kind === 'inn') return 'guild'
  if (node.kind === 'terminal') return 'glitch_pit'
  if (node.kind === 'forge') return 'skyforge_aether'
  if (node.kind === 'test') return 'circuit_catacombs'
  if (node.kind === 'library') return 'oracles_athenaeum'
  let hash = 0
  for (const char of node.key.toLowerCase()) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return SCENES[hash % SCENES.length] ?? 'grassland'
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

function frameAnimation(ids: readonly string[], x: number, y: number, width: number, height: number, duration: number, phase: number, motion: boolean, repeat: string, delay = 0): string {
  if (!motion || ids.length < 2) return `<use href="#${ids[0]}" x="${x}" y="${y}" width="${width}" height="${height}"/>`
  const keyTimes = Array.from({ length: ids.length + 1 }, (_, i) => (i / ids.length).toFixed(3)).join(';')
  const begin = delay + (phase % 5) * .07
  return ids.map((id, index) => {
    const values = [...Array.from({ length: ids.length }, (_, frame) => frame === index ? '1' : '0'), index === 0 ? '1' : '0'].join(';')
    return `<use href="#${id}" x="${x}" y="${y}" width="${width}" height="${height}" opacity="${index === 0 ? '1' : '0'}"><animate attributeName="opacity" calcMode="discrete" values="${values}" keyTimes="${keyTimes}" dur="${duration}s" begin="${begin.toFixed(2)}s" repeatCount="${repeat}"/></use>`
  }).join('')
}

function character(role: typeof ROLES[number], height: number, working: boolean, walking: boolean, phase: number, motion: boolean, direction: AgentQuestDirection): string {
  const art = AGENT_QUEST_SPRITES[role]
  const standing = working ? FRAMES.map(frame => `aq-${role}-attack-${frame}`) : [`aq-${role}-idle-${direction}`]
  const body = walking && motion
    ? '<g>' + frameAnimation(FRAMES.map(frame => `aq-${role}-walk-${direction}-${frame}`), 0, 0, 56, 56, .45, phase, true, '1') +
      '<animate attributeName="opacity" values="1;1;0" keyTimes="0;.9;1" dur=".45s" fill="freeze"/></g>' +
      '<g opacity="0">' + frameAnimation(standing, 0, 0, 56, 56, 1.15, phase, true, 'indefinite', .45) +
      '<animate attributeName="opacity" values="0;1" keyTimes="0;1" dur=".01s" begin=".45s" fill="freeze"/></g>'
    : frameAnimation(standing, 0, 0, 56, 56, 1.15, phase, motion, 'indefinite')
  return '<svg x="' + (-height / 2) + '" y="' + (-height) + '" width="' + height + '" height="' + height + '" viewBox="0 0 56 56" shape-rendering="crispEdges" image-rendering="pixelated">' + body + '</svg>'
}

export function drawLivingTrail(scene: Scene): { svg: string; width: number; height: number; spots: Record<string, { x: number; y: number }> } {
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
  const hearth: Node = { key: 'inn', kind: 'inn', title: 'Hearth', slot: 3 }
  const locate = (activity: Activity) => activityNode(activity, rooms, board, terminal, crewLodge, hearth)
  const mainActor = visible.find(actor => actor.id === (scene.focusAgent ?? '0')) ?? visible[0]!
  const current = !scene.isTurn && !scene.focusAgent ? hearth : locate(mainActor.activity)
  const at = (node: Node) => visible.filter(actor => locate(actor.activity).key === node.key)
  const attentionOrder = [...rooms].sort((a, b) => {
    const aCrew = at(a)
    const bCrew = at(b)
    const aWork = aCrew.filter(actor => actor.activity.isActive || running.has(actor.id)).length
    const bWork = bCrew.filter(actor => actor.activity.isActive || running.has(actor.id)).length
    return bWork - aWork || Math.max(0, ...bCrew.map(actor => actor.activity.at)) - Math.max(0, ...aCrew.map(actor => actor.activity.at)) || a.slot - b.slot
  })
  const terminalActive = visible.some(actor => actor.activity.file === '#terminal')
  const crewActive = visible.some(actor => actor.id !== '0' && actor.activity.file === '#crew')
  const stations = [board, ...(terminalActive ? [terminal] : []), ...(crewActive ? [crewLodge] : []), ...attentionOrder]
  const nearby = scene.focusAgent ? [] : stations.filter(node => node.key !== current.key)
  const columns = width * zoom < 280 ? 1 : 2
  const shown = nearby.slice(0, columns === 1 ? 2 : 4)
  const hidden = nearby.length - shown.length
  const gap = columns === 1 ? 0 : 7
  const cardWidth = (width - 14 - gap) / columns
  const cardHeight = Math.max(60, Math.round(cardWidth / 3.1 + 10))
  const rowGap = 7
  const rows = Math.ceil(shown.length / columns)
  const stageX = 7
  const stageY = 28
  const stageWidth = width - 14
  const stageHeight = Math.max(68, Math.round(stageWidth / 3.1))
  const nearbyY = stageY + stageHeight + 17
  const cardsY = nearbyY + 9
  const footerY = cardsY + rows * (cardHeight + rowGap) + (hidden ? 14 : 5)
  const height = footerY + 22
  const spots: Record<string, { x: number; y: number }> = {}
  const motion = scene.haven?.motion !== false
  const symbol = (id: string, source: string, w: number, h: number, aspect = 'xMidYMid meet') =>
    `<symbol id="${id}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="${aspect}"><image href="${source}" width="${w}" height="${h}" image-rendering="pixelated"/></symbol>`
  const sceneNames = [...new Set([current, ...shown].map(backgroundFor))]
  const backgrounds = sceneNames.map(name => symbol('aqbg-' + name, name === 'guild' ? AGENT_QUEST_GUILD : AGENT_QUEST_SCENES[name]!, 256, 82, 'xMidYMid slice')).join('')
  const sprites = new Map<string, string>()
  const bits: string[] = [
    '<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Patchhaven live work trail" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '" font-family="ui-monospace,Menlo,Consolas,monospace" shape-rendering="crispEdges">',
    '<rect width="' + width + '" height="' + height + '" fill="#101a1b"/>',
    '<path d="M2 22h' + (width - 4) + '" stroke="#4a6357"/>',
    '<text x="9" y="15" font-size="' + (9.5 * scale) + '" font-weight="700" letter-spacing="1" fill="#e0c782">PATCH TRAIL</text>',
  ]
  const status = scene.demo ? 'DEMO · ' + scene.demo.toUpperCase() : scene.failure
    ? scene.failure.error === 'rate_limit' ? 'NO RUN ENERGY' : 'TURN PAUSED'
    : scene.stoppedAt !== undefined && scene.now - scene.stoppedAt < 60_000 ? 'STOPPED'
      : scene.compactAt !== undefined && scene.now - scene.compactAt < 5000 ? 'PACKING'
        : scene.isTurn ? 'IN THE FIELD' : background.size ? 'CREW ACTIVE' : 'AT CAMP'
  bits.push('<text x="' + (width - 9) + '" y="15" font-size="' + (7.7 * scale) + '" text-anchor="end" letter-spacing=".4" fill="' + (scene.failure ? '#e89a87' : '#9bc9a3') + '">' + status + '</text>')
  for (let mark = 0; mark < 6; mark++) {
    const color = mark < (scene.haven?.landmarks.length ?? 0) ? '#e6c679' : '#46564c'
    const x = width / 2 - 24 + mark * 8
    bits.push('<path d="M' + x + ' 7h4v4h-4z" fill="' + color + '" stroke="#172426" stroke-width=".6"/>')
  }
  if (scene.levelUp && scene.now - scene.levelUp.at < 6000) bits.push('<text x="' + (width / 2) + '" y="21" text-anchor="middle" font-size="' + (8 * scale) + '" font-weight="700" fill="#f1cc72">LEVEL UP · ' + scene.levelUp.level + '</text>')

  const assigned = (actor: Agent) => actor.activity.isActive || (actor.id !== '0' && running.has(actor.id))
  const drawActor = (actor: Agent, x: number, feet: number, size: number) => {
    const previous = scene.from[actor.id]
    const walking = Boolean(previous && motion && (Math.abs(previous.x - x) > 2 || Math.abs(previous.y - feet) > 2))
    const direction: AgentQuestDirection = walking ? x > previous!.x ? 'east' : x < previous!.x ? 'west' : feet < previous!.y ? 'north' : 'south' : 'south'
    const waiting = scene.asking[actor.id] !== undefined
    const isRunning = actor.id !== '0' && running.has(actor.id)
    const turnActive = actor.id === '0' && scene.isTurn
    const action = activityAction(actor.activity, isRunning, waiting, turnActive)
    const actionDirection: AgentQuestDirection = action === 'reading' || action === 'searching' || action === 'researching' || action === 'thinking' || action === 'planning' ? 'north' : action === 'editing' || action === 'creating' || action === 'testing' || action === 'applying' || action === 'command' || action === 'tool' ? 'east' : 'south'
    const activeMotion = actor.activity.isActive && ['editing', 'creating', 'testing', 'applying', 'command', 'tool', 'delegating', 'working'].includes(action)
    const role = roleFor(actor.id, hero)
    const art = AGENT_QUEST_SPRITES[role]!
    const color = COLORS[Number(actor.id) % COLORS.length]!
    if (walking) for (const frame of FRAMES) sprites.set(`aq-${role}-walk-${direction}-${frame}`, art.walk[direction][frame]!)
    if (activeMotion) for (const frame of FRAMES) sprites.set(`aq-${role}-attack-${frame}`, art.attack[frame]!)
    else sprites.set(`aq-${role}-idle-${actionDirection}`, art.idle[actionDirection])
    spots[actor.id] = { x, y: feet }
    bits.push('<ellipse cx="' + x + '" cy="' + (feet - 1) + '" rx="' + Math.max(4, size * .24) + '" ry="2" fill="#091211" opacity=".62"/>')
    bits.push('<path d="M' + (x - 2) + ' ' + (feet - 6) + 'l2-3 2 3-2 3z" fill="' + color + '" stroke="#17201d" stroke-width=".6"/>')
    bits.push('<g transform="translate(' + x + ' ' + feet + ')" data-traveller="' + esc(actor.id) + '">')
    if (motion && scene.departs[actor.id] !== undefined && scene.now - scene.departs[actor.id]! < 1200) bits.push('<animate attributeName="opacity" from="1" to="0" dur="1.1s" fill="freeze"/>')
    if (walking) bits.push('<animateTransform attributeName="transform" type="translate" from="' + (previous!.x - x) + ' ' + (previous!.y - feet) + '" to="0 0" dur=".45s" fill="freeze"/>')
    const spawned = scene.spawns[actor.id]
    if (motion && spawned !== undefined && scene.now - spawned < 1100) bits.push('<circle cx="0" cy="-12" r="8" fill="none" stroke="#f0c86e" stroke-width="1"><animate attributeName="r" from="3" to="10" dur=".6s" fill="freeze"/><animate attributeName="opacity" from=".85" to="0" dur=".6s" fill="freeze"/></circle>')
    bits.push('<g data-agent="' + esc(actor.id) + '" data-role="' + role + '" data-state="' + (walking ? 'walking' : action) + '" data-action="' + action + '">')
    if (motion && !activeMotion && !walking) bits.push('<animateTransform attributeName="transform" type="translate" values="0 0;0 -1;0 0" dur="' + (action === 'thinking' ? '1s' : '1.2s') + '" repeatCount="indefinite"/>')
    bits.push(character(role, size, activeMotion, walking, Number(actor.id) || 0, motion, walking ? direction : actionDirection), '</g></g>')
    if (action !== 'idle' && action !== 'waiting') {
      const badge = Math.max(9, Math.min(12, size * .26))
      const badgeX = x - badge * .12
      const badgeY = feet - size * .94
      const glyph = ACTION_GLYPHS[action]
      bits.push('<g data-action-marker="' + action + '">')
      if (motion && actor.activity.isActive) bits.push('<circle cx="' + (badgeX + badge / 2) + '" cy="' + (badgeY + badge / 2) + '" r="' + (badge * .48) + '" fill="none" stroke="#f5d780" stroke-width=".8"><animate attributeName="r" values="' + (badge * .46) + ';' + (badge * .78) + '" dur=".8s" repeatCount="indefinite"/><animate attributeName="opacity" values=".8;0" dur=".8s" repeatCount="indefinite"/></circle>')
      bits.push('<rect x="' + badgeX + '" y="' + badgeY + '" width="' + badge + '" height="' + badge + '" rx="3" fill="' + (action === 'thinking' ? '#1b3430' : '#24372c') + '" stroke="' + (action === 'thinking' ? '#9cc8a1' : '#efca75') + '" stroke-width=".8"/><text x="' + (badgeX + badge / 2) + '" y="' + (badgeY + badge * .72) + '" text-anchor="middle" font-size="' + Math.max(7, badge * .7) + '" font-weight="700" fill="#ffe6a1">' + glyph + '</text>')
      if (motion && action === 'thinking') bits.push('<circle cx="' + (badgeX + badge + 2) + '" cy="' + (badgeY + badge - 1) + '" r="1.2" fill="#9cc8a1"><animate attributeName="opacity" values=".25;1;.25" dur="1s" repeatCount="indefinite"/></circle>')
      bits.push('</g>')
    }
    if (waiting) {
      const bubbleY = feet - size - 15
      bits.push('<g transform="translate(' + (x - 6) + ' ' + bubbleY + ')"' + (motion ? '><animateTransform attributeName="transform" type="translate" values="0 0;0 -1;0 0" dur=".8s" repeatCount="indefinite"/>' : '>') + '<rect width="12" height="12" rx="3" fill="#f0d17d" stroke="#533b2b"/><text x="6" y="8.5" text-anchor="middle" font-size="8" font-weight="700" fill="#33271e">?</text></g>')
    }
  }
  const ambient = (node: Node, x: number, y: number, w: number, h: number) => {
    if (!motion) return
    const cx = x + w * .72
    const cy = y + h * .62
    if (node.kind === 'inn') bits.push('<circle cx="' + cx + '" cy="' + cy + '" r="15" fill="#f5a64a" opacity=".13"><animate attributeName="opacity" values=".08;.2;.08" dur="2.4s" repeatCount="indefinite"/></circle>')
    else if (node.kind === 'terminal') bits.push('<rect x="' + (x + w - 17) + '" y="' + (y + 8) + '" width="4" height="4" fill="#82efa4"><animate attributeName="opacity" values=".2;1;.2" dur=".8s" repeatCount="indefinite"/></rect>')
    else if (node.kind === 'forge') bits.push('<circle cx="' + cx + '" cy="' + (y + h - 11) + '" r="2" fill="#ffb46f"><animate attributeName="cy" values="' + (y + h - 9) + ';' + (y + h - 22) + ';' + (y + h - 9) + '" opacity=".8;0;.8" dur="1.2s" repeatCount="indefinite"/></circle>')
    else if (node.kind === 'test') bits.push('<path d="M' + (x + w - 17) + ' ' + (y + 11) + 'l4 4-4 4-4-4z" fill="#b4d58a"><animate attributeName="opacity" values=".35;1;.35" dur="1.4s" repeatCount="indefinite"/></path>')
    else bits.push('<circle cx="' + (x + w - 11) + '" cy="' + (y + 10) + '" r="1.5" fill="#f0c86e"><animate attributeName="opacity" values=".25;.9;.25" dur="1.8s" repeatCount="indefinite"/></circle>')
  }

  const stageActors = at(current).slice(0, 4)
  const stageActor = stageActors.find(actor => actor.id === mainActor.id) ?? mainActor
  const stageDesk = current.room?.desks.find(desk => samePath(desk.path, stageActor.activity.file)) ?? current.room?.desks.find(desk => desk.touch.isActive)
  const stageFile = current.kind === 'inn' ? 'Resting between turns'
    : current.kind === 'board' ? scene.steps.find(step => step.status === 'in_progress')?.text ?? scene.steps[0]?.text ?? 'Plan the next patch'
      : current.kind === 'terminal' ? stageActor.activity.tool || 'Running a command'
        : current.kind === 'crew' ? (scene.crew ?? []).find(member => String(member.index) === stageActor.id)?.description ?? 'Between file assignments'
          : stageDesk?.name ?? (current.kind === 'folder' ? stageActor.activity.file.split('/').at(-1) : current.title) ?? current.title
  const stageStatus = current.kind === 'inn' ? 'AT CAMP · READY FOR WORK'
    : labelFor(stageActor.activity, scene.asking[stageActor.id] !== undefined, stageActor.id !== '0' && running.has(stageActor.id), stageActor.id === '0' && scene.isTurn)
  const stageAccent = current.kind === 'folder' ? palette(current.title).accent : current.kind === 'forge' ? '#df9160' : current.kind === 'test' ? '#91bd86' : current.kind === 'library' ? '#c5a2d2' : current.kind === 'terminal' ? '#81c4bd' : current.kind === 'crew' ? '#9bc9a3' : '#e0c782'
  const stageBackground = 'aqbg-' + backgroundFor(current)
  bits.push('<g data-current-location="' + esc(current.key) + '" data-station="' + current.kind + '" aria-label="Current scene: ' + esc(current.title) + '">')
  bits.push('<use href="#' + stageBackground + '" x="' + stageX + '" y="' + stageY + '" width="' + stageWidth + '" height="' + stageHeight + '"/>')
  bits.push('<rect x="' + stageX + '" y="' + stageY + '" width="' + stageWidth + '" height="' + stageHeight + '" fill="#071010" opacity=".1"/>')
  const plaqueWidth = Math.min(stageWidth * .68, 260)
  bits.push('<rect x="' + (stageX + 5) + '" y="' + (stageY + 5) + '" width="' + plaqueWidth + '" height="42" fill="#111a19" opacity=".9" stroke="' + stageAccent + '" stroke-width=".8"/>')
  bits.push('<text x="' + (stageX + 10) + '" y="' + (stageY + 16) + '" font-size="' + (7.6 * scale) + '" font-weight="700" letter-spacing=".5" fill="' + stageAccent + '">NOW · ' + esc(clip(current.title.toUpperCase(), Math.floor((plaqueWidth - 12) / (5.2 * scale)))) + '</text>')
  bits.push('<text x="' + (stageX + 10) + '" y="' + (stageY + 30) + '" font-size="' + (10.5 * scale) + '" font-weight="700" fill="#f1efdf">' + esc(clip(stageFile, Math.floor((plaqueWidth - 12) / (6.2 * scale)))) + '</text>')
  bits.push('<text x="' + (stageX + 10) + '" y="' + (stageY + 40) + '" font-size="' + (7.5 * scale) + '" fill="#e2c579">' + esc(clip(stageStatus, Math.floor((plaqueWidth - 12) / (5 * scale)))) + '</text>')
  if (stageDesk?.touch.isNew) bits.push('<text x="' + (stageX + stageWidth - 9) + '" y="' + (stageY + 13) + '" text-anchor="end" font-size="' + (7.5 * scale) + '" font-weight="700" fill="#f2c768">NEW · +' + (stageDesk.change?.add ?? stageDesk.touch.add ?? 0) + '</text>')
  ambient(current, stageX, stageY, stageWidth, stageHeight)
  let spotHash = 0
  for (const char of current.key) spotHash = (spotHash * 31 + char.charCodeAt(0)) >>> 0
  const stageSpotX = stageX + stageWidth * (.84 + (spotHash % 4) * .035)
  const stageSpotY = stageY + stageHeight * (.77 + ((spotHash >>> 3) % 3) * .06)
  stageActors.forEach((actor, index) => drawActor(actor, stageSpotX - index * 23, stageSpotY, Math.min(64 * scale, stageHeight * .67)))
  const stageDrop = stageDesk ? scene.drops[stageDesk.path] : undefined
  if (stageDrop && scene.now - stageDrop.at < 2500) bits.push('<text x="' + (stageX + stageWidth - 10) + '" y="' + (stageY + 14) + '" text-anchor="end" font-size="' + (8 * scale) + '" font-weight="700" fill="#f2c768">+' + stageDrop.xp + '</text>')
  const stageSplatActor = stageActors.find(actor => scene.splats[actor.id] && scene.now - scene.splats[actor.id]!.at < 3000)
  const stageSplat = stageSplatActor ? scene.splats[stageSplatActor.id] : undefined
  if (stageSplat) {
    const glyph = stageSplat.kind === 'pass' ? '✓' : stageSplat.kind === 'denied' ? '✋' : stageSplat.kind === 'hit' ? String(stageSplat.damage) : '×'
    bits.push('<rect x="' + (stageX + stageWidth - 19) + '" y="' + (stageY + 20) + '" width="13" height="13" fill="' + (stageSplat.kind === 'pass' ? '#2f8f2f' : '#b43d3d') + '" stroke="#0b1315"/><text x="' + (stageX + stageWidth - 12.5) + '" y="' + (stageY + 30) + '" text-anchor="middle" font-size="8" font-weight="700" fill="#fff">' + glyph + '</text>')
  }
  bits.push('<rect x="' + stageX + '" y="' + stageY + '" width="' + stageWidth + '" height="' + stageHeight + '" fill="none" stroke="' + (scene.failure ? '#d87865' : stageAccent) + '" stroke-width="1.2"' + (scene.isTurn && motion ? '><animate attributeName="opacity" values=".78;1;.78" dur="2.1s" repeatCount="indefinite"/></rect>' : '/>'), '</g>')

  if (shown.length) {
    bits.push('<text x="9" y="' + (nearbyY + 1) + '" font-size="' + (7.5 * scale) + '" font-weight="700" letter-spacing="1" fill="#d7c491">NEARBY STATIONS</text>')
    bits.push('<text x="' + (width - 9) + '" y="' + (nearbyY + 1) + '" text-anchor="end" font-size="' + (7 * scale) + '" fill="#84968a">' + shown.length + (hidden ? ' +' + hidden : '') + ' PLACES</text>')
  }
  shown.forEach((node, index) => {
    const row = Math.floor(index / columns)
    const col = index % columns
    const x = columns === 2 ? 7 + col * (cardWidth + gap) : 7
    const y = cardsY + row * (cardHeight + rowGap)
    const occupants = at(node)
    const workers = occupants.slice(0, 2)
    const active = occupants.some(assigned)
    const accent = node.kind === 'folder' ? palette(node.title).accent : node.kind === 'forge' ? '#df9160' : node.kind === 'test' ? '#91bd86' : node.kind === 'library' ? '#c5a2d2' : node.kind === 'terminal' ? '#81c4bd' : node.kind === 'crew' ? '#9bc9a3' : '#e0c782'
    const bg = 'aqbg-' + backgroundFor(node)
    const desk = node.room?.desks.find(file => occupants.some(agent => samePath(agent.activity.file, file.path))) ?? node.room?.desks.find(file => file.touch.isActive) ?? node.room?.desks[node.room.desks.length - 1]
    const agent = occupants[0]
    const fileName = node.kind === 'terminal' ? agent?.activity.tool || 'Running a command'
      : node.kind === 'board' ? scene.steps.find(step => step.status === 'in_progress')?.text ?? scene.steps[0]?.text ?? 'Plan the next patch'
        : node.kind === 'crew' ? (scene.crew ?? []).find(member => String(member.index) === agent?.id)?.description ?? 'Waiting for a file assignment'
          : desk?.name ?? node.title
    const change = (desk?.change?.add ?? desk?.touch.add ?? 0) + (desk?.change?.del ?? desk?.touch.del ?? 0)
    const state = node.kind === 'board'
      ? (occupants.some(member => scene.asking[member.id] !== undefined) ? 'AWAITING APPROVAL' : scene.questStatus === 'blocked' ? 'QUEST PAUSED' : scene.questStatus === 'cancelled' ? 'QUEST CANCELLED' : scene.questStatus === 'replaced' ? 'NEW PATCH' : scene.questStatus === 'completed' ? 'QUEST COMPLETE' : scene.steps.length ? scene.steps.filter(step => step.status === 'completed').length + '/' + scene.steps.length + ' STEPS' : 'READY FOR WORK')
        : agent ? labelFor(agent.activity, scene.asking[agent.id] !== undefined, agent.id !== '0' && running.has(agent.id), agent.id === '0' && scene.isTurn)
        : desk?.touch.isNew ? 'NEW · +' + (desk.change?.add ?? desk.touch.add ?? 0) : desk?.touch.kind === 'read' ? 'LAST READ' : change ? 'PATCH SAVED · +' + change : 'RECENT DISTRICT'
    bits.push('<g data-station="' + node.kind + '" aria-label="' + esc(node.title + ' work station') + '">')
    bits.push('<use href="#' + bg + '" x="' + x + '" y="' + y + '" width="' + cardWidth + '" height="' + cardHeight + '"/>')
    bits.push('<rect x="' + x + '" y="' + y + '" width="' + cardWidth + '" height="' + cardHeight + '" fill="#0b1415" opacity=".12"/>')
    bits.push('<rect x="' + (x + 4) + '" y="' + (y + 3) + '" width="' + Math.min(cardWidth * .62, 145) + '" height="12" fill="#111a19" opacity=".92" stroke="' + accent + '" stroke-width=".5"/>')
    bits.push('<text x="' + (x + 8) + '" y="' + (y + 12) + '" font-size="' + (7.3 * scale) + '" font-weight="700" letter-spacing=".35" fill="' + accent + '">' + esc(clip(node.title.toUpperCase(), Math.floor((cardWidth * .58) / (5 * scale)))) + '</text>')
    bits.push('<rect x="' + (x + 4) + '" y="' + (y + cardHeight - 26) + '" width="' + (cardWidth - 8 - (workers.length ? 31 : 0)) + '" height="22" fill="#101719" opacity=".91" stroke="#596c61" stroke-width=".5"/>')
    const textMax = Math.max(5, Math.floor((cardWidth - 20 - (workers.length ? 31 : 0)) / (6 * scale)))
    bits.push('<text x="' + (x + 8) + '" y="' + (y + cardHeight - 15) + '" font-size="' + (9.3 * scale) + '" fill="#f0efdc">' + esc(clip(fileName, textMax)) + '</text>')
    bits.push('<text x="' + (x + 8) + '" y="' + (y + cardHeight - 6) + '" font-size="' + (7 * scale) + '" fill="' + (active ? '#f0c86e' : '#b2bdad') + '">' + esc(clip(state, textMax)) + '</text>')
    ambient(node, x, y, cardWidth, cardHeight)
    workers.forEach((worker, workerIndex) => {
      const px = x + cardWidth - 19 - workerIndex * 21
      const size = Math.min(40 * scale, cardHeight * .62)
      drawActor(worker, px, y + cardHeight - 2, size)
      const workerDesk = node.room?.desks.find(file => samePath(file.path, worker.activity.file))
      const drop = workerDesk ? scene.drops[workerDesk.path] : undefined
      if (drop && scene.now - drop.at < 2500) bits.push('<text x="' + (px + 3) + '" y="' + (y + 9) + '" text-anchor="middle" font-size="' + (7 * scale) + '" font-weight="700" fill="#f2c768">+' + drop.xp + '</text>')
    })
    const recentDrop = desk ? scene.drops[desk.path] : undefined
    if (!workers.length && recentDrop && scene.now - recentDrop.at < 2500) bits.push('<text x="' + (x + cardWidth - 9) + '" y="' + (y + 12) + '" text-anchor="end" font-size="' + (8 * scale) + '" font-weight="700" fill="#f2c768">+' + recentDrop.xp + '</text>')
    if (occupants.length > workers.length) bits.push('<text x="' + (x + cardWidth - 5) + '" y="' + (y + cardHeight - 30) + '" text-anchor="end" font-size="7" fill="#ffe398">+' + (occupants.length - workers.length) + '</text>')
    const splatActor = occupants.find(agent => scene.splats[agent.id] && scene.now - scene.splats[agent.id]!.at < 3000)
    const splat = splatActor ? scene.splats[splatActor.id] : undefined
    if (splat) {
      const label = splat.kind === 'pass' ? '✓' : splat.kind === 'denied' ? '✋' : splat.kind === 'hit' ? String(splat.damage) : '×'
      bits.push('<rect x="' + (x + cardWidth - 14) + '" y="' + (y + 4) + '" width="10" height="10" fill="' + (splat.kind === 'pass' ? '#2f8f2f' : '#b43d3d') + '" stroke="#0b1315"/><text x="' + (x + cardWidth - 9) + '" y="' + (y + 12) + '" text-anchor="middle" font-size="7" font-weight="700" fill="#fff">' + label + '</text>')
    }
    bits.push('<rect x="' + x + '" y="' + y + '" width="' + cardWidth + '" height="' + cardHeight + '" fill="none" stroke="' + (active ? accent : '#607267') + '" stroke-width="' + (active ? 1.2 : .7) + '"/></g>')
  })

  const completed = scene.steps.filter(step => step.status === 'completed').length
  const activeStep = scene.steps.find(step => step.status === 'in_progress') ?? scene.steps.find(step => step.status === 'pending')
  const crewCount = scene.crewTotal ?? new Set(visible.filter(actor => actor.id !== '0').map(actor => actor.id)).size
  const footer = scene.steps.length
    ? 'PATCHBOARD ' + completed + '/' + scene.steps.length + ' · ' + (activeStep?.text ? clip(activeStep.text, Math.floor((width - 122) / (5 * scale))) : 'ALL PATCHES COMPLETE')
    : 'CREW ' + crewCount + ' · ' + (scene.haven?.landmarks.length ?? 0) + '/6 MARKS' + (hidden ? ' · +' + hidden + ' STATIONS' : '')
  bits.push('<path d="M7 ' + footerY + 'h' + (width - 14) + 'v15H7z" fill="#182522" stroke="#53685b"/>')
  bits.push('<text x="12" y="' + (footerY + 10.5) + '" font-size="' + (7 * scale) + '" font-weight="700" fill="#e6c679">' + esc(footer) + '</text>')
  if (scene.bank?.total) bits.push('<text x="' + (width - 13) + '" y="' + (footerY + 10.5) + '" text-anchor="end" font-size="' + (7 * scale) + '" fill="#e6c679">' + scene.bank.total + ' BANKED</text>')
  if (scene.failure) bits.push('<rect x="' + (width - 112) + '" y="25" width="101" height="13" fill="#3d2221" stroke="#d87865"/><text x="' + (width - 61.5) + '" y="34" text-anchor="middle" font-size="' + (7.2 * scale) + '" fill="#f0b2a3">' + (scene.failure.error === 'rate_limit' ? 'OUT OF RUN ENERGY' : 'TURN PAUSED') + '</text>')
  const spriteSymbols = [...sprites].map(([id, source]) => symbol(id, source, 56, 56)).join('')
  bits.push('<defs>' + backgrounds + spriteSymbols + '</defs>', '</svg>')
  return { svg: bits.join(''), width, height, spots }
}
