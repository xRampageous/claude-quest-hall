import type { Activity } from '../types'
import { CHARACTERS, ROOMS } from './art'
import { HEROES } from './haven'
import type { Room, Scene } from './rooms'

type AtlasNode = {
  key: string
  kind: 'folder' | 'forge' | 'test' | 'library' | 'terminal' | 'board' | 'inn'
  title: string
  slot: number
  room?: Room
}

const AGENT_COLORS = ['#d8a45e', '#67c7c0', '#d98cb2', '#9acb7b', '#d8c56e', '#8db9e0']
const esc = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const clip = (value: string, length: number) => value.length > length ? value.slice(0, Math.max(1, length - 1)) + '…' : value
const samePath = (a: string, b: string) => a.replace(/\\/g, '/').toLowerCase() === b.replace(/\\/g, '/').toLowerCase()
const readableScale = (width: number) => Math.max(1.05, Math.min(1.2, width / 360))

function paletteFor(value: string) {
  let hash = 0
  for (const char of value.toLowerCase()) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return ROOMS[hash % ROOMS.length]!
}

function actorLabel(act: Activity, waiting = false): string {
  if (waiting) return 'AWAITING YOU'
  if (act.mode === 'test' || /test|lint|check/i.test(act.tool)) return 'CHECKING'
  if (act.mode === 'web') return 'RESEARCHING'
  if (act.mode === 'apply' || act.isApply) return 'APPLYING'
  if (act.isEdit || act.mode === 'shell') return 'WORKING'
  if (act.file === '#terminal') return 'IN TERMINAL'
  if (act.file === '#hall') return 'PLANNING'
  if (act.file === '#inn') return 'AT CAMP'
  return 'READING'
}

function character(index: number, x: number, feet: number, height: number, walking = false): string {
  const art = CHARACTERS[index]!
  const width = Math.max(9, Math.round(height * art.w / art.h))
  const frames = walking && art.frames.length > 1
    ? art.frames.slice(0, 2).map((frame, i) => `<g opacity="${i ? 0 : 1}">${frame}<animate attributeName="opacity" values="${i ? '0;1;0' : '1;0;1'}" keyTimes="0;.5;1" dur=".44s" repeatCount="indefinite"/></g>`).join('')
    : art.frames[0]
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
      '<path d="M3 ' + (y + 5) + 'h' + (width - 6) + 'M3 ' + (y + 19) + 'h' + (width - 6) + 'M3 ' + (y + 32) + 'h' + (width - 6) + '" stroke="#405049" stroke-width="1" opacity=".65"/>',
      '<path d="M2 ' + floor + 'h' + (width - 4) + 'v17H2z" fill="#4a4235"/>',
      '<path d="M2 ' + (floor + 2) + 'h' + (width - 4) + 'M2 ' + (floor + 10) + 'h' + (width - 4) + '" stroke="#826747" stroke-width="1" opacity=".75"/>',
      '<path d="M' + (width * .25) + ' ' + floor + 'v17m' + (width * .5) + ' 0v-17m' + (width * .25) + ' 17v-17" stroke="#332f29" stroke-width="1" opacity=".75"/>',
      '<path d="M2 ' + (y + rowPitch - 2) + 'h' + (width - 4) + '" stroke="#816d4e" stroke-width="2"/>',
    )
    if (columns === 2) bits.push('<path d="M' + column + ' ' + y + 'v' + (rowPitch - 1) + '" stroke="#6c654d" stroke-width="2"/>')
  }
  return bits
}

function station(node: AtlasNode, x: number, y: number, w: number, h: number, accent: string, active: boolean): string[] {
  const floor = y + h - 3
  const artFloor = y + 55
  const left = x + 10
  const top = y + 12
  const line = (d: string, color = '#201e1b', weight = 1.5) => '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="' + weight + '" stroke-linecap="square"/>'
  const rect = (rx: number, ry: number, rw: number, rh: number, fill: string, extra = '') => '<rect x="' + rx + '" y="' + ry + '" width="' + rw + '" height="' + rh + '" fill="' + fill + '" ' + extra + '/>'
  const props: string[] = node.kind === 'board' ? [] : [
    '<ellipse cx="' + (left + 19) + '" cy="' + (artFloor - 1) + '" rx="18" ry="2" fill="#171d1a" opacity=".65"/>',
  ]
  if (node.kind === 'board') {
    props.push(
      rect(left + 1, top, 34, 24, '#604832', 'stroke="#201e1b" stroke-width="2"'),
      rect(left + 4, top + 3, 28, 17, '#c5ad78', 'stroke="#a07b4c"'),
      rect(left + 8, top + 6, 13, 5, '#d8c99d'),
      line('M' + (left + 8) + ' ' + (top + 14) + 'h18m-18 3h13', '#786547', 1),
      rect(left + 4, top + 3, 3, 3, '#df8068'), rect(left + 27, top + 3, 3, 3, '#79b8ad'),
      line('M' + (left + 6) + ' ' + (top + 24) + 'v4m24-4v4', '#5a4330', 2),
    )
  } else if (node.kind === 'terminal' || node.kind === 'folder') {
    const deskY = artFloor - 9
    const screenY = deskY - 18
    props.push(
      rect(left, deskY - 2, 42, 4, '#a87946', 'stroke="#34291f"'),
      line('M' + (left + 3) + ' ' + (deskY + 2) + 'v8m36-8v8', '#664b34', 2),
      rect(left + 13, screenY, 17, 12, '#1d292a', 'stroke="#171b1b"'),
      rect(left + 15, screenY + 2, 13, 8, '#1b4144', 'stroke="' + (active ? '#f0c86e' : accent) + '"'),
      line('M' + (left + 18) + ' ' + (screenY + 5) + 'l3 2-3 2m6 0h2', '#c2d9c2', 1),
      line('M' + (left + 21) + ' ' + (screenY + 12) + 'v3m-5 0h10', '#9d794d', 1.5),
      rect(left + 4, deskY - 8, 6, 5, '#d0bd8a'),
      node.kind === 'folder' ? rect(left + 34, deskY - 7, 5, 5, '#658d6c') : '',
    )
  } else if (node.kind === 'forge') {
    props.push(
      rect(left + 3, top + 1, 18, 26, '#59473b', 'stroke="#241f1b" stroke-width="2"'),
      rect(left + 7, top + 14, 10, 9, '#b65636', 'stroke="#32251e"'),
      '<path d="M' + (left + 8) + ' ' + (top + 21) + 'q4-9 7 0z" fill="#ffc76a"/>',
      rect(left + 25, artFloor - 10, 17, 6, '#687276', 'stroke="#202326"'),
      line('M' + (left + 27) + ' ' + (artFloor - 11) + 'h13l-2-3h-8z', '#aeb9b7', 1),
      line('M' + (left + 32) + ' ' + (artFloor - 4) + 'v4', '#684a34', 2),
      rect(left + 7, top - 2, 10, 3, '#423d36'),
    )
  } else if (node.kind === 'test') {
    props.push(
      line('M' + (left + 17) + ' ' + (top + 9) + 'v' + (artFloor - top - 10), '#6e5438', 3),
      '<circle cx="' + (left + 17) + '" cy="' + (top + 10) + '" r="8" fill="#7c4139" stroke="#2a2220" stroke-width="1.5"/>',
      '<circle cx="' + (left + 17) + '" cy="' + (top + 10) + '" r="4" fill="none" stroke="#e9c878" stroke-width="1.5"/>',
      rect(left + 27, artFloor - 14, 14, 11, '#70563b', 'stroke="#342b22"'),
      rect(left + 30, artFloor - 18, 9, 5, '#d4c697', 'stroke="#443c30"'),
      line('M' + (left + 32) + ' ' + (artFloor - 16) + 'l2 2 3-3', '#4a7958', 1.5),
    )
  } else if (node.kind === 'library') {
    props.push(
      rect(left + 2, top, 16, 28, '#684d38', 'stroke="#28211d" stroke-width="1.5"'),
      rect(left + 4, top + 4, 12, 2, '#b79761'), rect(left + 4, top + 14, 12, 2, '#b79761'), rect(left + 4, top + 24, 12, 2, '#b79761'),
      rect(left + 5, top + 6, 3, 7, '#b77255'), rect(left + 9, top + 6, 4, 7, '#6e8d78'),
      rect(left + 5, top + 17, 4, 6, '#78929c'), rect(left + 10, top + 17, 4, 6, '#d6bd79'),
      rect(left + 24, artFloor - 14, 16, 11, '#795c3d', 'stroke="#372d24"'),
      line('M' + (left + 28) + ' ' + (artFloor - 16) + 'h8l3 3h-8z', '#d9c793', 1),
      line('M' + (left + 29) + ' ' + (artFloor - 3) + 'v3m7-3v3', '#5a4430', 1.5),
    )
  } else if (node.kind === 'inn') {
    props.push(
      rect(left + 3, top + 3, 28, 24, '#665448', 'stroke="#262220" stroke-width="2"'),
      rect(left + 8, top + 9, 18, 16, '#252b29', 'stroke="#211e1c" stroke-width="2"'),
      '<path d="M' + (left + 11) + ' ' + (top + 24) + 'q-3-8 2-12 1 5 4 1 5 7 1 11z" fill="#e47b3e"/><path d="M' + (left + 16) + ' ' + (top + 24) + 'q-2-5 1-8 3 4 1 8z" fill="#ffd274"/>',
      rect(left + 27, artFloor - 11, 17, 7, '#8e6843', 'stroke="#382b20"'),
      line('M' + (left + 29) + ' ' + (artFloor - 4) + 'v4m12-4v4', '#5b402d', 2),
      line('M' + (left + 4) + ' ' + (artFloor - 12) + 'h8m-6-3h6', '#bd9660', 2),
    )
  } else {
    props.push(
      rect(left + 8, top + 3, 26, 22, '#584536', 'stroke="#25201c" stroke-width="2"'),
      rect(left + 12, top + 7, 18, 13, '#262d2c', 'stroke="#8b7450"'),
      '<path d="M' + (left + 15) + ' ' + (top + 18) + 'l4-5 3 3 4-6" fill="none" stroke="#9bd0a1" stroke-width="1.4"/>',
      line('M' + (left + 20) + ' ' + (top + 25) + 'v4m-6 0h12', '#775637', 2),
    )
  }
  const wallSign = '<rect x="' + (x + 5) + '" y="' + (y + 3) + '" width="' + (w - 10) + '" height="11" fill="#473e30" stroke="#252722"/><path d="M' + (x + 7) + ' ' + (y + 13) + 'h' + (w - 14) + '" stroke="' + (active ? '#e3c779' : accent) + '" stroke-width="1"/>'
  const artScale = Math.min(node.kind === 'board' ? 1.25 : 1.65, h / 58)
  const artTransform = node.kind === 'board'
    ? 'translate(' + (left * (1 - artScale)) + ' ' + ((y + 12) * (1 - artScale)) + ') scale(' + artScale + ')'
    : 'translate(' + (left * (1 - artScale)) + ' ' + (floor - artScale * artFloor) + ') scale(' + artScale + ')'
  return [wallSign, '<g transform="' + artTransform + '">' + props.join('') + '</g>']
}

export function drawAtlas(scene: Scene): { svg: string; width: number; height: number; spots: Record<string, { x: number; y: number }> } {
  const width = Math.max(240, Math.min(560, scene.paneWidth || scene.width * 1.5))
  const scale = readableScale(width)
  const hero = Math.max(0, HEROES.indexOf(scene.haven?.hero ?? 'wizard'))
  const background = new Set(scene.backgroundAgents ?? [])
  const actors: { id: string; activity: Activity }[] = Object.entries(scene.activity)
    .filter(([id]) => scene.isTurn || id === '0' || background.has(id) || (scene.departs[id] !== undefined && scene.now - scene.departs[id]! < 1200))
    .sort(([a], [b]) => a === '0' ? -1 : b === '0' ? 1 : Number(a) - Number(b))
    .map(([id, activity]) => ({ id, activity }))

  for (const member of scene.crew ?? []) {
    const id = String(member.index)
    if (member.status === 'running' && !actors.some(actor => actor.id === id)) {
      actors.push({ id, activity: { tool: '', file: '#hall', at: scene.now, isActive: false, isEdit: false, mode: 'background' } })
    }
  }

  if (!actors.some(actor => actor.id === '0')) {
    actors.unshift({ id: '0', activity: { tool: '', file: scene.isTurn ? '#hall' : '#inn', at: scene.now, isActive: false, isEdit: false } })
  }
  const visible = actors.slice(0, 12)
  const visibleIds = new Set(visible.map(actor => actor.id))
  const terminalActive = actors.some(actor => actor.activity.file === '#terminal')
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
  const inn: AtlasNode = { key: 'inn', kind: 'inn', title: 'Hearth', slot: 1 }
  const nodes = [board, ...(terminalActive ? [terminal] : []), ...(!scene.rooms.length && !terminalActive ? [inn] : []), ...ordered].slice(0, 8)
  const columns = width < 300 ? 1 : 2
  const gapX = columns === 1 ? 0 : 6
  const padX = 7
  const cardW = (width - padX * 2 - gapX) / columns
  const rows = Math.ceil(nodes.length / columns)
  const rowPitch = Math.max(60, Math.min(150, 232 / rows))
  const cardHeight = rowPitch - 2
  const fieldTop = 31
  const rowStart = fieldTop
  const footerY = fieldTop + rows * rowPitch + 3
  const positions = nodes.map((node, index) => {
    const cell = index
    const row = Math.floor(cell / columns)
    const col = cell % columns
    return { x: padX + col * (cardW + gapX), y: rowStart + row * rowPitch, w: cardW, h: cardHeight }
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
    const x = 104 + mark * 7
    bits.push('<path d="M' + x + ' 9h4v4h-4z" fill="' + color + '" stroke="#172426" stroke-width=".6"/>')
  }
  bits.push(...hallBackdrop(width, columns, rows, fieldTop, rowPitch, cardHeight))
  bits.push('<text x="' + (width / 2) + '" y="30" text-anchor="middle" font-size="' + (6 * scale) + '" font-weight="700" letter-spacing="1" fill="#d7c491">PATCHHAVEN GUILD HALL</text>')

  if (scene.levelUp && scene.now - scene.levelUp.at < 6000) {
    bits.push('<text x="' + (width / 2) + '" y="25" text-anchor="middle" font-size="' + (9.5 * scale) + '" font-weight="700" fill="#f1cc72">LEVEL UP · ' + scene.levelUp.level + '</text>')
  }

  {
    const points = positions.map(position => [position.x + position.w / 2, position.y + position.h - 2] as const)
    if (points.length > 1) {
      bits.push('<path d="' + points.map((point, index) => (index ? 'L' : 'M') + point[0] + ' ' + point[1]).join(' ') +
        '" fill="none" stroke="#d6b364" stroke-width="3" stroke-dasharray="1 4" stroke-linecap="square" opacity=".75">' +
        (scene.haven?.motion === false ? '' : '<animate attributeName="stroke-dashoffset" values="0;-10" dur="2.4s" repeatCount="indefinite"/>') + '</path>')
    }
    nodes.forEach((node, index) => {
      const { x, y, w, h } = positions[index]!
      const room = node.room
      const agents = actors.filter(actor => {
        if (node.key === 'terminal') return actor.activity.file === '#terminal'
        if (node.key === 'board') return actor.activity.file === '#hall'
        if (node.key === 'inn') return actor.activity.file === '#inn'
        return Boolean(room?.desks.some(desk => samePath(desk.path, actor.activity.file)))
      })
      const drawnAgents = agents.filter(actor => visibleIds.has(actor.id)).slice(0, 3)
      const active = agents.length > 0
      const accent = node.kind === 'folder' ? paletteFor(node.title).accent : node.kind === 'forge' ? '#df9160' : node.kind === 'test' ? '#91bd86' : node.kind === 'library' ? '#c5a2d2' : node.kind === 'board' ? '#e0c782' : '#81c4bd'
      const structure = station(node, x, y, w, h, accent, active)
      bits.push('<g data-station="' + node.kind + '" aria-label="' + esc(node.title + ' work station') + '">' + structure.join('') + '</g>')
      if (active) {
        bits.push('<path d="M' + (x + 2) + ' ' + (y + 17) + 'v7" stroke="#f0c86e" stroke-width="2"/>')
      }

      const desk = room?.desks.find(file => agents.some(actor => samePath(actor.activity.file, file.path))) ??
        room?.desks.find(file => file.touch.isActive) ?? room?.desks[room.desks.length - 1]
      const fileName = node.kind === 'terminal'
        ? visible.find(actor => actor.activity.file === '#terminal')?.activity.tool || 'Running a command'
        : node.kind === 'board'
          ? scene.steps.find(step => step.status === 'in_progress')?.text ?? scene.steps[0]?.text ?? 'Plan the next patch'
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
          : node.kind === 'inn' ? (scene.isTurn ? 'CHOOSING A ROUTE' : 'AT CAMP')
          : agents.some(actor => scene.asking[actor.id] !== undefined) ? 'NEEDS APPROVAL'
            : [desk?.touch.isNew ? 'NEW' : code ?? (desk?.touch.kind === 'read' ? 'READ' : ''), add ? '+' + add : '', del ? '−' + del : ''].filter(Boolean).join(' · ') || (active ? actorLabel(agents[0]!.activity, agents.some(actor => scene.asking[actor.id] !== undefined)) : 'FILE DISTRICT')
      const signX = x + 54
      const available = Math.max(48, w - 83)
      const titleFontSize = 8.2 * scale
      const fileFontSize = Math.max(10, Math.min(11.5 * scale, available / (Math.max(1, fileName.length) * .58)))
      const statusFontSize = Math.max(7.5, Math.min(8.5 * scale, available / (Math.max(1, statusText.length) * .58)))
      const titleChars = Math.max(5, Math.floor(available / (titleFontSize * .58 + .45)))
      const fileChars = Math.max(5, Math.floor(available / (fileFontSize * .58)))
      const statusChars = Math.max(5, Math.floor(available / (statusFontSize * .58)))
      bits.push(
        '<text x="' + (signX + 1) + '" y="' + (y + 11) + '" font-size="' + titleFontSize + '" font-weight="700" letter-spacing=".4" fill="' + accent + '">' + esc(clip(node.title.toUpperCase(), titleChars)) + '</text>',
        '<text x="' + (signX + 1) + '" y="' + (y + 28) + '" font-size="' + fileFontSize + '" fill="#f0efdc">' + esc(clip(fileName, fileChars)) + '</text>',
        '<text x="' + (signX + 1) + '" y="' + (y + 41) + '" font-size="' + statusFontSize + '" fill="' + (active ? '#f0c86e' : '#b2bdad') + '">' + esc(clip(statusText, statusChars)) + '</text>',
      )
      drawnAgents.forEach((actor, actorNumber) => {
        const px = x + w - 9 - actorNumber * 13
        const feet = y + h - 3
        const previous = scene.from[actor.id]
        spots[actor.id] = { x: px, y: feet }
        bits.push('<g transform="translate(' + px + ' ' + feet + ')">')
        if (scene.departs[actor.id] !== undefined && scene.now - scene.departs[actor.id]! < 1200) {
          bits.push('<animate attributeName="opacity" from="1" to="0" dur="1.1s" fill="freeze"/>')
        }
        if (previous && scene.haven?.motion !== false && (Math.abs(previous.x - px) > 2 || Math.abs(previous.y - feet) > 2)) {
          bits.push('<animateTransform attributeName="transform" type="translate" from="' + (previous.x - px) + ' ' + (previous.y - feet) + '" to="0 0" dur=".45s" fill="freeze"/>')
        }
        const spawned = scene.spawns[actor.id]
        if (spawned !== undefined && scene.now - spawned < 1100) {
          bits.push('<circle cx="0" cy="-10" r="8" fill="none" stroke="#f0c86e" stroke-width="1"><animate attributeName="r" from="3" to="9" dur=".55s" fill="freeze"/><animate attributeName="opacity" from=".8" to="0" dur=".55s" fill="freeze"/></circle>')
        }
        const actorHero = actor.id === '0' && actor.activity.file === '#inn'
        const spriteHeight = actorHero ? 40 * scale : 28 * scale
        if (actorHero) {
          const spriteWidth = Math.round(spriteHeight * CHARACTERS[hero]!.w / CHARACTERS[hero]!.h)
          bits.push('<g>' + (scene.haven?.motion === false ? '' : '<animateTransform attributeName="transform" type="translate" values="0 0;0 -1;0 0" dur="1.2s" repeatCount="indefinite"/>') + '<use href="#c' + hero + 'f0" x="' + (-spriteWidth / 2) + '" y="' + (-spriteHeight) + '" width="' + spriteWidth + '" height="' + spriteHeight + '"/></g></g>')
        } else {
          bits.push('<g>' + (scene.haven?.motion === false ? '' : '<animateTransform attributeName="transform" type="translate" values="0 0;0 -1;0 0" dur="1.2s" repeatCount="indefinite"/>') + character(actorIndex(actor.id, hero), 0, 0, spriteHeight, actor.activity.isActive && scene.haven?.motion !== false) + '</g></g>')
        }
        bits.push('<rect x="' + (px - 3) + '" y="' + (y + 16) + '" width="5" height="2" fill="' + AGENT_COLORS[Number(actor.id) % AGENT_COLORS.length] + '"/>')
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
