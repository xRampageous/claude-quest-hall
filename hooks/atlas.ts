import type { Activity } from '../types'
import { CHARACTERS, ROOMS } from './art'
import { HEROES } from './haven'
import type { Room, Scene } from './rooms'

type AtlasNode = {
  key: string
  kind: 'folder' | 'forge' | 'test' | 'library' | 'terminal' | 'board' | 'crew' | 'inn'
  title: string
  slot: number
  room?: Room
}

const AGENT_COLORS = ['#d8a45e', '#67c7c0', '#d98cb2', '#9acb7b', '#d8c56e', '#8db9e0']
const esc = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const clip = (value: string, length: number) => value.length > length ? value.slice(0, Math.max(1, length - 1)) + '…' : value
const samePath = (a: string, b: string) => a.replace(/\\/g, '/').toLowerCase() === b.replace(/\\/g, '/').toLowerCase()
const readableScale = (width: number) => Math.max(1.1, Math.min(1.38, width / 315))

function paletteFor(value: string) {
  let hash = 0
  for (const char of value.toLowerCase()) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return ROOMS[hash % ROOMS.length]!
}

function actorLabel(act: Activity, waiting = false): string {
  if (waiting) return 'AWAITING YOU'
  if (act.isActive) {
    if (act.mode === 'test' || /test|lint|check/i.test(act.tool)) return 'CHECKING PATCH'
    if (act.mode === 'web') return 'RESEARCHING'
    if (act.mode === 'apply' || act.isApply) return 'APPLYING PATCH'
    if (act.mode === 'shell') return 'RUNNING COMMAND'
    if (act.isEdit) return 'PATCHING FILE'
    return 'WORKING'
  }
  if (act.mode === 'test' || /test|lint|check/i.test(act.tool)) return 'CHECK COMPLETE'
  if (act.mode === 'web') return 'RESULT LOGGED'
  if (act.mode === 'apply' || act.isApply) return 'PATCH READY'
  if (act.mode === 'shell') return 'BETWEEN COMMANDS'
  if (act.isEdit) return 'PATCH SAVED'
  if (act.mode === 'background') return 'BETWEEN TASKS'
  if (act.file === '#terminal') return 'IN TERMINAL'
  if (act.file === '#crew') return 'BETWEEN TASKS'
  if (act.file === '#hall') return 'PLANNING'
  if (act.file === '#inn') return 'AT CAMP'
  return 'READING'
}

function character(index: number, x: number, feet: number, height: number, action: 'idle' | 'typing' | 'reading' = 'idle', phase = 0, motion = true): string {
  const art = CHARACTERS[index]!
  const width = Math.max(9, Math.round(height * art.w / art.h))
  const framePair = action === 'typing' ? [1, 2] : action === 'reading' ? [3, 4] : []
  const frames = motion && framePair.length && art.frames.length > framePair[1]!
    ? framePair.map((frame, i) => `<g opacity="${i ? 0 : 1}">${art.frames[frame]!}<animate attributeName="opacity" values="${i ? '0;1;0' : '1;0;1'}" keyTimes="0;.5;1" dur=".9s" begin="${((phase % 5) * .11).toFixed(2)}s" repeatCount="indefinite"/></g>`).join('')
    : art.frames[action === 'typing' ? 1 : action === 'reading' ? 3 : 0] ?? art.frames[0]
  return '<svg x="' + (x - width / 2) + '" y="' + (feet - height) + '" width="' + width + '" height="' + height +
    '" viewBox="0 0 ' + art.w + ' ' + art.h + '" shape-rendering="crispEdges">' + frames + '</svg>'
}

function actorIndex(id: string, hero: number): number {
  if (id === '0') return hero
  const others = [0, 1, 2, 3].filter(index => index !== hero)
  const parsed = Number.parseInt(id, 10)
  return others[(Number.isFinite(parsed) ? Math.max(1, parsed) - 1 : id.length) % others.length]!
}

function hallBackdrop(width: number, columns: number, rows: number, fieldTop: number, rowPitch: number, cellHeight: number): string[] {
  const bottom = fieldTop + rows * rowPitch + 5
  const column = width / 2
  const bits = [
    '<rect x="1" y="23" width="' + (width - 2) + '" height="' + (bottom - 23) + '" fill="#20312f"/>',
    '<path d="M2 24h' + (width - 4) + 'v5H2z" fill="#4c493b"/>',
    '<path d="M2 29h' + (width - 4) + '" stroke="#b09a69" stroke-width="1" opacity=".65"/>',
  ]
  for (let row = 0; row < rows; row++) {
    const y = fieldTop + row * rowPitch
    const floor = y + cellHeight - 17
    bits.push(
      '<rect x="2" y="' + y + '" width="' + (width - 4) + '" height="' + (floor - y) + '" fill="' + (row % 2 ? '#273936' : '#2b3c38') + '"/>',
      '<path d="M3 ' + (y + 5) + 'h' + (width - 6) + 'M3 ' + (y + 19) + 'h' + (width - 6) + 'M3 ' + (y + 32) + 'h' + (width - 6) + 'M3 ' + (y + 46) + 'h' + (width - 6) + '" stroke="#405049" stroke-width="1" opacity=".65"/>',
      '<path d="M3 ' + (y + 2) + 'h' + (width - 6) + '" stroke="#927951" stroke-width="2" opacity=".75"/>',
      '<path d="M2 ' + floor + 'h' + (width - 4) + 'v17H2z" fill="#4a4235"/>',
      '<path d="M2 ' + (floor + 2) + 'h' + (width - 4) + 'M2 ' + (floor + 10) + 'h' + (width - 4) + '" stroke="#826747" stroke-width="1" opacity=".75"/>',
      '<path d="M' + (width * .25) + ' ' + floor + 'v17m' + (width * .5) + ' 0v-17m' + (width * .25) + ' 17v-17" stroke="#332f29" stroke-width="1" opacity=".75"/>',
      '<path d="M2 ' + (y + rowPitch - 2) + 'h' + (width - 4) + '" stroke="#816d4e" stroke-width="2"/>',
    )
    for (let col = 0; col < columns; col++) {
      const left = col * column
      const right = (col + 1) * column
      bits.push(
        '<path d="M' + (left + 4) + ' ' + (y + 4) + 'v' + (floor - y - 4) + 'M' + (right - 4) + ' ' + (y + 4) + 'v' + (floor - y - 4) + '" stroke="#172522" stroke-width="2" opacity=".5"/>',
        '<path d="M' + (left + 7) + ' ' + (y + 8) + 'h8v11h-8z" fill="#253a37" stroke="#617466" stroke-width="1" opacity=".8"/>',
        '<path d="M' + (left + 8) + ' ' + (y + 9) + 'h6v8h-6z" fill="#c9a15a" opacity=".28"/>',
        '<path d="M' + (right - 16) + ' ' + (y + 8) + 'h8v11h-8z" fill="#253a37" stroke="#617466" stroke-width="1" opacity=".8"/>',
        '<path d="M' + (right - 15) + ' ' + (y + 9) + 'h6v8h-6z" fill="#c9a15a" opacity=".28"/>',
      )
    }
    if (columns === 2) bits.push('<path d="M' + column + ' ' + y + 'v' + (rowPitch - 1) + '" stroke="#6c654d" stroke-width="2"/>')
  }
  return bits
}

function station(node: AtlasNode, x: number, y: number, w: number, h: number, accent: string, active: boolean, working: boolean, motion: boolean): string[] {
  const floor = y + h - 3
  const artFloor = y + 55
  const left = x + 8
  const top = y + 20
  const line = (d: string, color = '#201e1b', weight = 1.5) => '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="' + weight + '" stroke-linecap="square"/>'
  const rect = (rx: number, ry: number, rw: number, rh: number, fill: string, extra = '') => '<rect x="' + rx + '" y="' + ry + '" width="' + rw + '" height="' + rh + '" fill="' + fill + '" ' + extra + '/>'
  const props: string[] = node.kind === 'board' ? [] : [
    '<ellipse cx="' + (left + 23) + '" cy="' + (artFloor - 1) + '" rx="22" ry="3" fill="#171d1a" opacity=".68"/>',
  ]
  if (node.kind === 'board') {
    props.push(
      rect(left + 1, top + 1, 38, 28, '#604832', 'stroke="#201e1b" stroke-width="2"'),
      rect(left + 4, top + 4, 32, 20, '#c5ad78', 'stroke="#a07b4c"'),
      rect(left + 8, top + 7, 14, 6, '#d8c99d'),
      line('M' + (left + 8) + ' ' + (top + 16) + 'h22m-22 4h16', '#786547', 1),
      rect(left + 4, top + 4, 3, 3, '#df8068'), rect(left + 32, top + 4, 3, 3, '#79b8ad'),
      line('M' + (left + 7) + ' ' + (top + 29) + 'v5m26-5v5', '#5a4330', 2),
    )
  } else if (node.kind === 'terminal' || node.kind === 'folder') {
    const deskY = artFloor - 9
    const screenY = deskY - 21
    props.push(
      rect(left - 2, deskY - 3, 50, 5, '#a87946', 'stroke="#34291f"'),
      line('M' + (left + 2) + ' ' + (deskY + 2) + 'v9m40-9v9', '#664b34', 2),
      rect(left + 12, screenY, 22, 16, '#1d292a', 'stroke="#171b1b"'),
      rect(left + 14, screenY + 2, 18, 12, '#1b4144', 'stroke="' + (active ? '#f0c86e' : accent) + '"'),
      line('M' + (left + 17) + ' ' + (screenY + 6) + 'l3 2-3 2m6 0h5', '#c2d9c2', 1),
      working && motion ? '<rect x="' + (left + 27) + '" y="' + (screenY + 6) + '" width="2" height="4" fill="#f0c86e"><animate attributeName="opacity" values="1;0;1" dur=".8s" repeatCount="indefinite"/></rect>' : '',
      line('M' + (left + 23) + ' ' + (screenY + 16) + 'v4m-7 0h14', '#9d794d', 1.5),
      rect(left + 2, deskY - 9, 7, 5, '#d0bd8a'),
      node.kind === 'folder' ? rect(left + 39, deskY - 8, 6, 5, '#658d6c') : '',
    )
  } else if (node.kind === 'crew') {
    props.push(
      rect(left + 4, artFloor - 22, 42, 16, '#72583c', 'stroke="#332b22" stroke-width="1.5"'),
      rect(left + 8, artFloor - 20, 34, 11, '#c8b47e', 'stroke="#433729"'),
      '<path d="M' + (left + 12) + ' ' + (artFloor - 17) + 'h16m-16 3h21m-8 3h9" stroke="#70866a" stroke-width="1.5"/>',
      '<circle cx="' + (left + 18) + '" cy="' + (artFloor - 15) + '" r="1.5" fill="#df8068"/><circle cx="' + (left + 35) + '" cy="' + (artFloor - 17) + '" r="1.5" fill="#79b8ad"/>',
      line('M' + (left + 8) + ' ' + (artFloor - 5) + 'v5m34-5v5', '#61472f', 2),
      rect(left, artFloor - 3, 5, 5, '#604832'), rect(left + 45, artFloor - 3, 5, 5, '#604832'),
      '<path d="M' + (left + 50) + ' ' + (artFloor - 20) + 'q5-4 8 0v9h-8z" fill="#70563b" stroke="#332b22"/>',
    )
  } else if (node.kind === 'forge') {
    props.push(
      rect(left + 3, top + 1, 20, 28, '#59473b', 'stroke="#241f1b" stroke-width="2"'),
      rect(left + 7, top + 15, 12, 10, '#b65636', 'stroke="#32251e"'),
      '<g><path d="M' + (left + 8) + ' ' + (top + 23) + 'q4-10 7 0z" fill="#ffc76a"/>' + (motion ? '<animateTransform attributeName="transform" type="translate" values="0 0;0 -1;0 0" dur=".7s" repeatCount="indefinite"/>' : '') + '</g>',
      rect(left + 27, artFloor - 11, 19, 7, '#687276', 'stroke="#202326"'),
      line('M' + (left + 29) + ' ' + (artFloor - 12) + 'h15l-2-3h-9z', '#aeb9b7', 1),
      line('M' + (left + 35) + ' ' + (artFloor - 4) + 'v4', '#684a34', 2),
      rect(left + 7, top - 2, 11, 3, '#423d36'),
    )
  } else if (node.kind === 'test') {
    props.push(
      line('M' + (left + 17) + ' ' + (top + 9) + 'v' + (artFloor - top - 10), '#6e5438', 3),
      '<circle cx="' + (left + 17) + '" cy="' + (top + 10) + '" r="9" fill="#7c4139" stroke="#2a2220" stroke-width="1.5"/>',
      '<circle cx="' + (left + 17) + '" cy="' + (top + 10) + '" r="4.5" fill="none" stroke="#e9c878" stroke-width="1.5"/>',
      rect(left + 29, artFloor - 15, 16, 12, '#70563b', 'stroke="#342b22"'),
      rect(left + 32, artFloor - 20, 10, 6, '#d4c697', 'stroke="#443c30"'),
      line('M' + (left + 34) + ' ' + (artFloor - 17) + 'l2 2 4-4', '#4a7958', 1.5),
    )
  } else if (node.kind === 'library') {
    props.push(
      rect(left + 2, top, 18, 32, '#684d38', 'stroke="#28211d" stroke-width="1.5"'),
      rect(left + 4, top + 4, 14, 2, '#b79761'), rect(left + 4, top + 15, 14, 2, '#b79761'), rect(left + 4, top + 27, 14, 2, '#b79761'),
      rect(left + 5, top + 7, 4, 7, '#b77255'), rect(left + 11, top + 7, 5, 7, '#6e8d78'),
      rect(left + 5, top + 19, 5, 7, '#78929c'), rect(left + 11, top + 19, 5, 7, '#d6bd79'),
      rect(left + 27, artFloor - 16, 19, 13, '#795c3d', 'stroke="#372d24"'),
      line('M' + (left + 31) + ' ' + (artFloor - 18) + 'h9l3 3h-9z', '#d9c793', 1),
      line('M' + (left + 32) + ' ' + (artFloor - 3) + 'v3m8-3v3', '#5a4430', 1.5),
    )
  } else if (node.kind === 'inn') {
    props.push(
      rect(left + 3, top + 3, 31, 27, '#665448', 'stroke="#262220" stroke-width="2"'),
      rect(left + 7, top + 9, 23, 18, '#252b29', 'stroke="#211e1c" stroke-width="2"'),
      '<g><path d="M' + (left + 11) + ' ' + (top + 25) + 'q-3-9 2-13 1 5 4 1 5 7 1 12z" fill="#e47b3e"/><path d="M' + (left + 18) + ' ' + (top + 26) + 'q-2-6 1-9 3 4 1 9z" fill="#ffd274"/>' + (motion ? '<animateTransform attributeName="transform" type="translate" values="0 0;0 -1;0 0" dur="1s" repeatCount="indefinite"/>' : '') + '</g>',
      rect(left + 29, artFloor - 12, 20, 8, '#8e6843', 'stroke="#382b20"'),
      line('M' + (left + 32) + ' ' + (artFloor - 4) + 'v4m14-4v4', '#5b402d', 2),
      line('M' + (left + 4) + ' ' + (artFloor - 14) + 'h9m-7-4h7', '#bd9660', 2),
    )
  } else {
    props.push(
      rect(left + 8, top + 3, 29, 25, '#584536', 'stroke="#25201c" stroke-width="2"'),
      rect(left + 12, top + 7, 21, 16, '#262d2c', 'stroke="#8b7450"'),
      '<path d="M' + (left + 15) + ' ' + (top + 21) + 'l5-6 4 4 5-8" fill="none" stroke="#9bd0a1" stroke-width="1.6"/>',
      line('M' + (left + 22) + ' ' + (top + 29) + 'v4m-7 0h14', '#775637', 2),
    )
  }
  const wallSign = '<rect x="' + (x + 5) + '" y="' + (y + 3) + '" width="' + (w - 10) + '" height="13" fill="#473e30" stroke="#252722"/><path d="M' + (x + 7) + ' ' + (y + 15) + 'h' + (w - 14) + '" stroke="' + (active ? '#e3c779' : accent) + '" stroke-width="1.5"/>'
  const artScale = Math.min(node.kind === 'board' ? 1.38 : 1.64, h / 58)
  const artTransform = node.kind === 'board'
    ? 'translate(' + (left * (1 - artScale)) + ' ' + ((y + 19) * (1 - artScale)) + ') scale(' + artScale + ')'
    : 'translate(' + (left * (1 - artScale)) + ' ' + (floor - artScale * artFloor) + ') scale(' + artScale + ')'
  const activityGlow = active
    ? '<path d="M' + (x + 2) + ' ' + (y + 18) + 'v10" stroke="#f0c86e" stroke-width="2">' + (working && motion ? '<animate attributeName="opacity" values=".4;1;.4" dur="1.1s" repeatCount="indefinite"/>' : '') + '</path>'
    : ''
  return [
    '<rect x="' + (x + 2) + '" y="' + (y + 16) + '" width="' + (w - 4) + '" height="' + (h - 20) + '" fill="#172522" opacity=".17"/>',
    '<path d="M' + (x + 6) + ' ' + (floor - 3) + 'h' + (w - 12) + '" stroke="#b18a55" stroke-width="2" opacity=".7"/>',
    wallSign,
    '<g transform="' + artTransform + '">' + props.join('') + '</g>',
    activityGlow,
  ]
}

export function drawAtlas(scene: Scene): { svg: string; width: number; height: number; spots: Record<string, { x: number; y: number }> } {
  const width = Math.max(240, Math.min(560, scene.paneWidth || scene.width * 1.5))
  const zoom = scene.haven?.size === 'large' ? 1.22 : scene.haven?.size === 'comfortable' ? 1.12 : 1
  const scale = readableScale(width * zoom)
  const hero = Math.max(0, HEROES.indexOf(scene.haven?.hero ?? 'wizard'))
  const background = new Set(scene.backgroundAgents ?? [])
  const running = new Set((scene.crew ?? []).filter(member => member.status === 'running').map(member => String(member.index)))
  const actors: { id: string; activity: Activity }[] = Object.entries(scene.activity)
    .filter(([id]) => scene.focusAgent ? id === scene.focusAgent : scene.isTurn || id === '0' || background.has(id) || (scene.departs[id] !== undefined && scene.now - scene.departs[id]! < 1200))
    .sort(([a], [b]) => a === '0' ? -1 : b === '0' ? 1 : Number(a) - Number(b))
    .map(([id, activity]) => ({
      id,
      activity: id !== '0' && activity.file === '#hall' && (background.has(id) || running.has(id))
        ? { ...activity, file: '#crew' }
        : activity,
    }))

  for (const member of scene.crew ?? []) {
    const id = String(member.index)
    if ((scene.focusAgent ? scene.focusAgent === id : member.status === 'running') && !actors.some(actor => actor.id === id)) {
      actors.push({ id, activity: { tool: '', file: '#crew', at: scene.now, isActive: false, isEdit: false, mode: 'background' } })
    }
  }

  if (!actors.some(actor => actor.id === '0') && (!scene.focusAgent || scene.focusAgent === '0')) {
    actors.unshift({ id: '0', activity: { tool: '', file: scene.isTurn ? '#hall' : '#inn', at: scene.now, isActive: false, isEdit: false } })
  }
  const visible = actors.slice(0, 24)
  const visibleIds = new Set(visible.map(actor => actor.id))
  const terminalActive = actors.some(actor => actor.activity.file === '#terminal')
  const crewActive = actors.some(actor => actor.id !== '0' && actor.activity.file === '#crew')
  const occupied = new Set([0, 1])
  const ordered: AtlasNode[] = scene.rooms.map((room, index) => {
    const path = room.desks[0]?.path ?? ''
    const cut = path.lastIndexOf('/')
    const key = room.key ?? (cut < 0 ? 'root' : path.slice(0, cut).toLowerCase())
    let slot = 2 + (scene.siteSlots?.[key.toLowerCase()] ?? room.slot ?? index)
    while (occupied.has(slot) && slot < 8) slot++
    if (slot >= 8) slot = 2 + index % 6
    occupied.add(slot)
    const kind: AtlasNode['kind'] = room.name === 'Forge' ? 'forge' : /test|spec|quality|qa/i.test(room.name) ? 'test' : /doc|wiki|guide/i.test(room.name) ? 'library' : 'folder'
    return { key: 'room:' + key, kind, title: room.name, room, slot }
  }).sort((a, b) => a.slot - b.slot || a.key.localeCompare(b.key))
  const board: AtlasNode = { key: 'board', kind: 'board', title: 'Patchboard', slot: 0 }
  const terminal: AtlasNode = { key: 'terminal', kind: 'terminal', title: 'Terminal', slot: 1 }
  const crewHall: AtlasNode = { key: 'crew', kind: 'crew', title: 'Crew Lodge', slot: 1 }
  const inn: AtlasNode = { key: 'inn', kind: 'inn', title: 'Hearth', slot: 1 }
  const nodes = [board, ...(terminalActive ? [terminal] : []), ...(crewActive ? [crewHall] : []), ...(!scene.rooms.length && !terminalActive && !crewActive ? [inn] : []), ...ordered]
  const columns = width * zoom < 370 ? 1 : 2
  const gapX = columns === 1 ? 0 : 6
  const padX = 7
  const cardW = (width - padX * 2 - gapX) / columns
  const rows = Math.ceil(nodes.length / columns)
  const rowPitch = columns === 1
    ? Math.max(92, Math.min(126, 560 / rows))
    : Math.max(100, Math.min(136, 410 / rows))
  const cardHeight = rowPitch - 2
  const fieldTop = 31
  const rowStart = fieldTop
  const footerY = fieldTop + rows * rowPitch + 3
  const positions = nodes.map((node, index) => {
    const cell = index
    const row = Math.floor(cell / columns)
    const col = cell % columns
    const countInRow = Math.min(columns, nodes.length - row * columns)
    const x = columns === 2 && countInRow === 1 ? (width - cardW) / 2 : padX + col * (cardW + gapX)
    return { x, y: rowStart + row * rowPitch, w: cardW, h: cardHeight }
  })
  const spots: Record<string, { x: number; y: number }> = {}
  const height = footerY + 19
  const characterSymbols = CHARACTERS.map((art, index) => `<symbol id="c${index}f0" viewBox="0 0 ${art.w} ${art.h}">${art.frames[0]}</symbol>`).join('')
  const bits: string[] = [
    '<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Patchhaven patch trail" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '" font-family="ui-monospace,Menlo,Consolas,monospace" shape-rendering="crispEdges">',
    '<defs>' + characterSymbols + '</defs>',
    '<rect width="' + width + '" height="' + height + '" fill="#111d1f"/>',
    '<rect id="floor" x="1" y="1" width="' + (width - 2) + '" height="' + (height - 2) + '" fill="#172426" stroke="#43594e"/>',
    '<path d="M2 23h' + (width - 4) + '" stroke="#43594e"/>',
    '<text x="10" y="16" font-size="' + (10.5 * scale) + '" font-weight="700" letter-spacing="1" fill="#e0c782">PATCH TRAIL</text>',
  ]
  const status = scene.demo ? 'DEMO · ' + scene.demo.toUpperCase() : scene.failure
    ? scene.failure.error === 'rate_limit' ? 'NO RUN ENERGY' : 'TURN PAUSED'
    : scene.stoppedAt !== undefined && scene.now - scene.stoppedAt < 60_000 ? 'STOPPED'
      : scene.compactAt !== undefined && scene.now - scene.compactAt < 5000 ? 'PACKING TRAIL'
        : scene.isTurn ? 'IN THE FIELD' : background.size ? 'CREW ACTIVE' : 'AT CAMP'
  bits.push('<text x="' + (width - 10) + '" y="16" font-size="' + (8.5 * scale) + '" text-anchor="end" letter-spacing=".5" fill="' + (scene.failure ? '#e89a87' : '#9bc9a3') + '">' + status + '</text>')
  for (let mark = 0; mark < 6; mark++) {
    const color = mark < (scene.haven?.landmarks.length ?? 0) ? '#e6c679' : '#46564c'
    const x = 136 + mark * 8
    bits.push('<path d="M' + x + ' 9h4v4h-4z" fill="' + color + '" stroke="#172426" stroke-width=".6"/>')
  }
  bits.push(...hallBackdrop(width, columns, rows, fieldTop, rowPitch, cardHeight))
  bits.push('<text x="' + (width / 2) + '" y="30" text-anchor="middle" font-size="' + (6 * scale) + '" font-weight="700" letter-spacing="1" fill="#d7c491">PATCHHAVEN GUILD HALL</text>')

  if (scene.levelUp && scene.now - scene.levelUp.at < 6000) {
    bits.push('<text x="' + (width / 2) + '" y="25" text-anchor="middle" font-size="' + (9.5 * scale) + '" font-weight="700" fill="#f1cc72">LEVEL UP · ' + scene.levelUp.level + '</text>')
  }

  {
    if (rows > 0) {
      const routeY = (row: number) => fieldTop + row * rowPitch + rowPitch - 3
      let route = 'M7 ' + routeY(0) + 'H' + (width - 7)
      for (let row = 1; row < rows; row++) route += 'V' + routeY(row) + (row % 2 ? 'H7' : 'H' + (width - 7))
      bits.push('<path d="' + route + '" fill="none" stroke="#d6b364" stroke-width="1.5" stroke-dasharray="1 5" stroke-linecap="square" opacity=".58">' +
        (scene.haven?.motion === false ? '' : '<animate attributeName="stroke-dashoffset" values="0;-12" dur="2.4s" repeatCount="indefinite"/>') + '</path>')
    }
    nodes.forEach((node, index) => {
      const { x, y, w, h } = positions[index]!
      const room = node.room
      const agents = actors.filter(actor => {
        if (node.key === 'terminal') return actor.activity.file === '#terminal'
        if (node.key === 'board') return actor.activity.file === '#hall'
        if (node.key === 'crew') return actor.activity.file === '#crew'
        if (node.key === 'inn') return actor.activity.file === '#inn'
        return Boolean(room?.desks.some(desk => samePath(desk.path, actor.activity.file)))
      })
      const drawnAgents = agents.filter(actor => visibleIds.has(actor.id)).slice(0, 2)
      const active = agents.length > 0
      const usingTool = agents.some(actor => actor.activity.isActive)
      const assignedCrew = agents.some(actor => actor.id !== '0' && running.has(actor.id))
      const working = usingTool || assignedCrew
      const accent = node.kind === 'folder' ? paletteFor(node.title).accent : node.kind === 'forge' ? '#df9160' : node.kind === 'test' ? '#91bd86' : node.kind === 'library' ? '#c5a2d2' : node.kind === 'board' ? '#e0c782' : '#81c4bd'
      const structure = station(node, x, y, w, h, accent, active, working, scene.haven?.motion !== false)
      bits.push('<g data-station="' + node.kind + '" aria-label="' + esc(node.title + ' work station') + '">' + structure.join('') + '</g>')

      const desk = room?.desks.find(file => agents.some(actor => samePath(actor.activity.file, file.path))) ??
        room?.desks.find(file => file.touch.isActive) ?? room?.desks[room.desks.length - 1]
      const fileName = node.kind === 'terminal'
        ? visible.find(actor => actor.activity.file === '#terminal')?.activity.tool || 'Running a command'
        : node.kind === 'board'
          ? scene.steps.find(step => step.status === 'in_progress')?.text ?? scene.steps[0]?.text ?? 'Plan the next patch'
          : node.kind === 'crew'
            ? (scene.crew ?? []).find(member => String(member.index) === agents[0]?.id)?.description || (agents.length > 1 ? agents.length + ' agents between tasks' : 'Waiting for a file assignment')
          : node.kind === 'inn'
            ? scene.isTurn ? 'Waiting for the next patch' : 'Resting by the hearth'
          : desk?.name ?? 'New patch'
      const add = desk?.change?.add ?? desk?.touch.add ?? 0
      const del = desk?.change?.del ?? desk?.touch.del ?? 0
      const code = desk?.change?.code
      const statusText = node.kind === 'terminal'
        ? actorLabel(agents[0]?.activity ?? { file: '#terminal', tool: '', at: 0, isActive: false, isEdit: false }, agents.some(actor => scene.asking[actor.id] !== undefined))
        : node.kind === 'board'
          ? (agents.some(actor => scene.asking[actor.id] !== undefined) ? 'AWAITING APPROVAL' : scene.questStatus === 'blocked' ? 'QUEST PAUSED' : scene.questStatus === 'cancelled' ? 'QUEST CANCELLED' : scene.questStatus === 'replaced' ? 'NEW QUEST' : scene.questStatus === 'completed' ? 'QUEST COMPLETE' : scene.steps.length ? scene.steps.filter(step => step.status === 'completed').length + '/' + scene.steps.length + ' STEPS' : 'READY FOR WORK')
          : node.kind === 'crew' ? agents.length + ' ON THE ROSTER · ' + (agents.some(actor => scene.asking[actor.id] !== undefined) ? 'AWAITING YOU' : usingTool ? 'WORKING' : assignedCrew ? 'ON ASSIGNMENT' : 'BETWEEN TASKS')
          : node.kind === 'inn' ? (scene.isTurn ? 'CHOOSING A ROUTE' : 'AT CAMP')
          : agents.some(actor => scene.asking[actor.id] !== undefined) ? 'NEEDS APPROVAL'
            : [desk?.touch.isNew ? 'NEW' : code ?? (desk?.touch.kind === 'read' ? 'READ' : ''), add ? '+' + add : '', del ? '−' + del : ''].filter(Boolean).join(' · ') || (active ? actorLabel(agents[0]!.activity, agents.some(actor => scene.asking[actor.id] !== undefined)) : 'FILE DISTRICT')
      const signOffset = node.kind === 'board' ? 68 : 57
      const signX = x + signOffset
      const workerGutter = drawnAgents.length > 1 ? 76 : drawnAgents.length === 1 ? 48 : 12
      const available = Math.max(46, w - signOffset - 8 - workerGutter)
      const titleFontSize = 9.2 * scale
      const fileFontSize = Math.max(10.5, Math.min(13.2 * scale, available / (Math.max(1, fileName.length) * .58)))
      const statusFontSize = Math.max(8.4, Math.min(9.8 * scale, available / (Math.max(1, statusText.length) * .58)))
      const titleChars = Math.max(5, Math.floor(available / (titleFontSize * .58 + .45)))
      const fileChars = Math.max(5, Math.floor(available / (fileFontSize * .58)))
      const statusChars = Math.max(5, Math.floor(available / (statusFontSize * .58)))
      bits.push(
        '<text x="' + (signX + 1) + '" y="' + (y + 11) + '" font-size="' + titleFontSize + '" font-weight="700" letter-spacing=".4" fill="' + accent + '">' + esc(clip(node.title.toUpperCase(), titleChars)) + '</text>',
        '<text x="' + (signX + 1) + '" y="' + (y + 28) + '" font-size="' + fileFontSize + '" fill="#f0efdc">' + esc(clip(fileName, fileChars)) + '</text>',
        '<text x="' + (signX + 1) + '" y="' + (y + 41) + '" font-size="' + statusFontSize + '" fill="' + (active ? '#f0c86e' : '#b2bdad') + '">' + esc(clip(statusText, statusChars)) + '</text>',
      )
      drawnAgents.forEach((actor, actorNumber) => {
        const px = x + w - 18 - actorNumber * 25
        const feet = y + h - 3
        const previous = scene.from[actor.id]
        spots[actor.id] = { x: px, y: feet }
        bits.push('<g transform="translate(' + px + ' ' + feet + ')">')
        if (scene.haven?.motion !== false && scene.departs[actor.id] !== undefined && scene.now - scene.departs[actor.id]! < 1200) {
          bits.push('<animate attributeName="opacity" from="1" to="0" dur="1.1s" fill="freeze"/>')
        }
        if (previous && scene.haven?.motion !== false && (Math.abs(previous.x - px) > 2 || Math.abs(previous.y - feet) > 2)) {
          bits.push('<animateTransform attributeName="transform" type="translate" from="' + (previous.x - px) + ' ' + (previous.y - feet) + '" to="0 0" dur=".45s" fill="freeze"/>')
        }
        const spawned = scene.spawns[actor.id]
        if (scene.haven?.motion !== false && spawned !== undefined && scene.now - spawned < 1100) {
          bits.push('<circle cx="0" cy="-10" r="8" fill="none" stroke="#f0c86e" stroke-width="1"><animate attributeName="r" from="3" to="9" dur=".55s" fill="freeze"/><animate attributeName="opacity" from=".8" to="0" dur=".55s" fill="freeze"/></circle>')
        }
        const assigned = actor.id !== '0' && running.has(actor.id)
        const actorHero = actor.id === '0'
        const motion = scene.haven?.motion !== false
        const action = actor.activity.isActive
          ? actor.activity.isEdit || actor.activity.mode === 'shell' || actor.activity.mode === 'apply' ? 'typing' : 'reading'
          : assigned ? 'reading' : 'idle'
        const spriteHeight = Math.min((actorHero ? 50 : 42) * scale, h * (actorHero ? .56 : .5))
        const spriteArt = CHARACTERS[actorHero ? hero : actorIndex(actor.id, hero)]!
        const spriteWidth = Math.round(spriteHeight * spriteArt.w / spriteArt.h)
        if (actorHero && !actor.activity.isActive) {
          bits.push('<g>' + (scene.haven?.motion === false ? '' : '<animateTransform attributeName="transform" type="translate" values="0 0;0 -1;0 0" dur="1.2s" repeatCount="indefinite"/>') + '<use href="#c' + hero + 'f0" x="' + (-spriteWidth / 2) + '" y="' + (-spriteHeight) + '" width="' + spriteWidth + '" height="' + spriteHeight + '"/></g></g>')
        } else {
          bits.push('<g>' + (motion ? '<animateTransform attributeName="transform" type="translate" values="0 0;0 -1;0 0" dur="1.2s" repeatCount="indefinite"/>' : '') + character(actorHero ? hero : actorIndex(actor.id, hero), 0, 0, spriteHeight, action, Number(actor.id) || 0, motion) + '</g></g>')
        }
        bits.push('<rect x="' + (px - 3) + '" y="' + (y + 16) + '" width="5" height="2" fill="' + AGENT_COLORS[Number(actor.id) % AGENT_COLORS.length] + '"' + (motion && (assigned || actor.activity.isActive) ? '><animate attributeName="opacity" values=".45;1;.45" dur=".9s" begin="' + ((Number(actor.id) % 5) * .1).toFixed(1) + 's" repeatCount="indefinite"/></rect>' : '/>'))
        if (scene.asking[actor.id] !== undefined) {
          const bubbleY = feet - spriteHeight - 14
          bits.push('<g transform="translate(' + (px - 5) + ' ' + bubbleY + ')"' + (scene.haven?.motion === false ? '' : '><animateTransform attributeName="transform" type="translate" values="0 0;0 -1;0 0" dur=".8s" repeatCount="indefinite"/>') + (scene.haven?.motion === false ? '>' : '') + '<rect width="11" height="11" rx="3" fill="#f0d17d" stroke="#533b2b"/><text x="5.5" y="8.2" text-anchor="middle" font-size="8" font-weight="700" fill="#33271e">?</text></g>')
        }
      })
      if (agents.length > drawnAgents.length) {
        const crowd = '+' + (agents.length - drawnAgents.length)
        bits.push('<rect x="' + (x + w - 15) + '" y="' + (y + h - 13) + '" width="13" height="8" fill="#283e39" stroke="#dfc17a"/>')
        bits.push('<text x="' + (x + w - 8.5) + '" y="' + (y + h - 7) + '" text-anchor="middle" font-size="6.5" fill="#f1d28a">' + crowd + '</text>')
      }
      if (!agents.length) bits.push('<circle cx="' + (x + w - 10) + '" cy="' + (y + 6) + '" r="1.6" fill="#65766a"/>')
      const splatActor = agents.find(actor => scene.splats[actor.id] && scene.now - scene.splats[actor.id]!.at < 3000)
      const splat = splatActor ? scene.splats[splatActor.id] : undefined
      if (splat && scene.now - splat.at < 3000) {
        const label = splat.kind === 'pass' ? '✓' : splat.kind === 'denied' ? '✋' : splat.kind === 'hit' ? String(splat.damage) : '×'
        bits.push('<rect x="' + (x + w - 27) + '" y="' + (y + 3) + '" width="9" height="9" fill="' + (splat.kind === 'pass' ? '#2f8f2f' : '#b43d3d') + '" stroke="#0b1315"/>')
        bits.push('<text x="' + (x + w - 22.5) + '" y="' + (y + 11) + '" text-anchor="middle" font-size="' + (8 * scale) + '" font-weight="700" fill="#fff">' + label + '</text>')
      }
      const drop = desk ? scene.drops[desk.path] : undefined
      if (drop && scene.now - drop.at < 2500) bits.push('<text x="' + (x + w - 8) + '" y="' + (y - 1) + '" text-anchor="middle" font-size="' + (7.5 * scale) + '" font-weight="700" fill="#f2c768">+' + drop.xp + '</text>')
    })
  }

  const completed = scene.steps.filter(step => step.status === 'completed').length
  const activeStep = scene.steps.find(step => step.status === 'in_progress') ?? scene.steps.find(step => step.status === 'pending')
  const crewCount = scene.crewTotal ?? new Set(visible.filter(actor => actor.id !== '0').map(actor => actor.id)).size
  bits.push('<path d="M7 ' + footerY + 'h' + (width - 14) + 'v14H7z" fill="#202e2c" stroke="#526457"/>')
  if (scene.steps.length) {
    const note = activeStep?.text ? ' · ' + activeStep.text : ' · all patches complete'
    bits.push('<text x="13" y="' + (footerY + 11) + '" font-size="' + (8 * scale) + '" letter-spacing=".2" fill="#e6c679">BOARD ' + completed + '/' + scene.steps.length + '</text>')
    const quest = scene.questStatus && scene.questStatus !== 'active' ? ' · ' + scene.questStatus.toUpperCase() : ''
    bits.push('<text x="84" y="' + (footerY + 11) + '" font-size="' + (7.5 * scale) + '" fill="' + (activeStep ? '#c5d2c3' : '#83c997') + '">' + esc(clip(note + quest, Math.floor((width - 98) / (4.5 * scale)))) + '</text>')
  } else {
    bits.push('<text x="13" y="' + (footerY + 11) + '" font-size="' + (7.5 * scale) + '" fill="#c0cbb8">' + nodes.length + ' ' + (nodes.length === 1 ? 'STATION' : 'STATIONS') + '  ·  ' + crewCount + ' CREW  ·  ' + (scene.haven?.landmarks.length ?? 0) + '/6 MARKS</text>')
    if (scene.bank?.total) bits.push('<text x="' + (width - 13) + '" y="' + (footerY + 11) + '" text-anchor="end" font-size="' + (7.5 * scale) + '" fill="#e6c679">' + scene.bank.total + ' BANKED</text>')
  }
  if (scene.failure) {
    bits.push('<rect x="' + (width - 113) + '" y="26" width="101" height="12" fill="#3d2221" stroke="#d87865"/>')
    bits.push('<text x="' + (width - 62.5) + '" y="35" text-anchor="middle" font-size="' + (8 * scale) + '" fill="#f0b2a3">' +
      (scene.failure.error === 'rate_limit' ? 'OUT OF RUN ENERGY' : 'TURN PAUSED') + '</text>')
  }
  bits.push('</svg>')

  return { svg: bits.join(''), width, height, spots }
}
