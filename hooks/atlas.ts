import type { Activity } from '../types'
import { CHARACTERS, ROOMS } from './art'
import { HEROES } from './haven'
import type { Room, Scene } from './rooms'

type AtlasNode = {
  key: string
  kind: 'folder' | 'terminal' | 'board'
  title: string
  room?: Room
}

const AGENT_COLORS = ['#d8a45e', '#67c7c0', '#d98cb2', '#9acb7b', '#d8c56e', '#8db9e0']
const esc = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const clip = (value: string, length: number) => value.length > length ? value.slice(0, Math.max(1, length - 1)) + '…' : value
const samePath = (a: string, b: string) => a.replace(/\\/g, '/').toLowerCase() === b.replace(/\\/g, '/').toLowerCase()

function paletteFor(value: string) {
  let hash = 0
  for (const char of value.toLowerCase()) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return ROOMS[hash % ROOMS.length]!
}

function actorLabel(act: Activity): string {
  if (act.mode === 'test' || /test|lint|check/i.test(act.tool)) return 'CHECKING'
  if (act.mode === 'web') return 'RESEARCHING'
  if (act.mode === 'apply' || act.isApply) return 'APPLYING'
  if (act.isEdit || act.mode === 'shell') return 'WORKING'
  if (act.file === '#terminal') return 'IN TERMINAL'
  if (act.file === '#hall') return 'PLANNING'
  if (act.file === '#inn') return 'AT CAMP'
  return 'READING'
}

function character(index: number, x: number, feet: number, height: number): string {
  const art = CHARACTERS[index]!
  const width = Math.max(9, Math.round(height * art.w / art.h))
  return '<svg x="' + (x - width / 2) + '" y="' + (feet - height) + '" width="' + width + '" height="' + height +
    '" viewBox="0 0 ' + art.w + ' ' + art.h + '" shape-rendering="crispEdges">' + art.frames[0] + '</svg>'
}

function actorIndex(id: string, hero: number): number {
  if (id === '0') return hero
  const others = [0, 1, 2, 3].filter(index => index !== hero)
  const parsed = Number.parseInt(id, 10)
  return others[(Number.isFinite(parsed) ? Math.max(1, parsed) - 1 : id.length) % others.length]!
}

function terrain(width: number, bottom: number): string[] {
  const horizon = Math.max(29, Math.min(80, bottom - 41))
  const far = horizon + 15
  const near = horizon + 25
  const grass = bottom - 10
  return [
    '<rect x="1" y="23" width="' + (width - 2) + '" height="' + (bottom - 23) + '" fill="#192b2b"/>',
    '<path d="M1 ' + far + 'l29-15 20 10 28-21 22 18 29-24 28 26 25-19 35 28 24-20 31 21v' + (bottom - far) + 'H1z" fill="#213938"/>',
    '<path d="M1 ' + near + 'l39-16 29 13 34-19 37 18 41-18 35 20 41-16 36 20v' + (bottom - near) + 'H1z" fill="#294338"/>',
    '<path d="M1 ' + grass + 'h' + (width - 2) + 'v' + Math.max(1, bottom - grass) + 'H1z" fill="url(#grass)"/>',
    '<path d="M1 ' + grass + 'h' + (width - 2) + 'M10 ' + (grass + 7) + 'h23m12 0h17m19 0h24m17 0h18m19 0h24m15 0h23m16 0h18m13 0h22" stroke="#68734b" stroke-width="2" opacity=".8"/>',
    '<path d="M13 ' + (near - 7) + 'h7m37 8h5m96-15h7m90 11h8" stroke="#9b9a69" stroke-width="2" opacity=".55"/>',
    '<path d="M23 ' + (grass - 1) + 'l8-9 9 9zM' + (width - 27) + ' ' + (grass - 1) + 'l7-8 8 8z" fill="#4b6342"/>',
  ]
}

function emptyCamp(width: number, hero: number, text: string, hint: string, motion: boolean): string[] {
  const middle = width / 2
  const hut = middle - 40
  return [
    '<path d="M' + (hut - 12) + ' 87l40-31 40 31v25h-80z" fill="#786047" stroke="#18211f" stroke-width="2"/>',
    '<path d="M' + (hut - 18) + ' 86L' + (hut + 28) + ' 47L' + (hut + 74) + ' 86h-10L' + (hut + 28) + ' 58l-36 28z" fill="#536a58" stroke="#18211f" stroke-width="2"/>',
    '<path d="M' + (hut - 5) + ' 91h66v21h-66z" fill="#9b7952"/>',
    '<rect x="' + (hut + 8) + '" y="91" width="13" height="14" fill="#243635" stroke="#d2b06e"/>',
    '<rect x="' + (hut + 38) + '" y="91" width="13" height="14" fill="#243635" stroke="#d2b06e"/>',
    '<path d="M' + (middle + 75) + ' 111q-7-12 0-18 2 8 5 0 8 11 0 18z" fill="#e59a55"/>',
    '<path d="M' + (middle + 68) + ' 112h20" stroke="#9a6842" stroke-width="3"/>',
    '<path d="M' + (middle - 83) + ' 112q20-9 42 0m4 0q16-8 34 0" fill="none" stroke="#a8b77c" stroke-width="2" opacity=".7"/>',
    '<ellipse cx="' + (middle - 93) + '" cy="111" rx="6" ry="1.6" fill="#111a18" opacity=".65"/>',
    motion
      ? '<g><animateTransform attributeName="transform" type="translate" values="0 0;0 -1;0 0" dur="1.2s" repeatCount="indefinite"/>' + character(hero, middle - 93, 112, 31) + '</g>'
      : character(hero, middle - 93, 112, 31),
    '<text x="18" y="42" font-size="7" fill="#b6c3aa" letter-spacing="1.2">PATCH CAMP</text>',
    '<text x="' + (middle + 8) + '" y="81" font-size="7" fill="#f0ce82">PATCHHAVEN</text>',
    '<text x="' + middle + '" y="129" text-anchor="middle" font-size="8" fill="#d8dfcf">' + esc(text) + '</text>',
    '<text x="' + middle + '" y="140" text-anchor="middle" font-size="6.5" fill="#9aada0">' + esc(hint) + '</text>',
  ]
}

function building(node: AtlasNode, x: number, y: number, w: number, h: number, accent: string, active: boolean): string[] {
  const bottom = y + h - 3
  const wallX = x + 8
  const wallY = y + 13
  const awning = active ? '#f0c86e' : accent
  const common = [
    '<path d="M' + (x + 3) + ' ' + bottom + 'h' + (w - 6) + '" stroke="#172421" stroke-width="3"/>',
    '<path d="M' + (x + 7) + ' ' + (bottom - 2) + 'h' + (w - 14) + '" stroke="#66734d" stroke-width="1"/>',
  ]
  if (node.kind === 'terminal') {
    common.push(
      '<rect x="' + wallX + '" y="' + wallY + '" width="25" height="17" fill="#655242" stroke="#17211f" stroke-width="1.5"/>',
      '<path d="M' + (wallX - 3) + ' ' + (wallY + 2) + 'l15-10 16 10z" fill="#526a58" stroke="#17211f"/>',
      '<rect x="' + (wallX + 4) + '" y="' + (wallY + 4) + '" width="16" height="8" fill="#183239" stroke="' + accent + '"/>',
      '<path d="M' + (wallX + 7) + ' ' + (wallY + 7) + 'l3 2-3 2m5 0h4" fill="none" stroke="#b7d8bd" stroke-width=".8"/>',
      '<path d="M' + (wallX + 11) + ' ' + (wallY + 17) + 'v3" stroke="#d5b678" stroke-width="2"/>',
    )
  } else if (node.kind === 'board') {
    common.push(
      '<path d="M' + (wallX + 4) + ' ' + (wallY + 22) + 'v-22h19v22" fill="#755b3e" stroke="#17211f" stroke-width="1.5"/>',
      '<path d="M' + (wallX - 1) + ' ' + (wallY + 2) + 'l14-11 15 11z" fill="#516d58" stroke="#17211f"/>',
      '<rect x="' + (wallX + 7) + '" y="' + (wallY + 4) + '" width="12" height="11" fill="#d4c28e" stroke="#433a2d"/>',
      '<path d="M' + (wallX + 9) + ' ' + (wallY + 7) + 'h8m-8 3h6" stroke="#59624e" stroke-width="1"/>',
      '<rect x="' + (wallX + 10) + '" y="' + (wallY + 15) + '" width="7" height="5" fill="#453b31"/>',
    )
  } else {
    common.push(
      '<rect x="' + wallX + '" y="' + wallY + '" width="29" height="18" fill="#756047" stroke="#17211f" stroke-width="1.5"/>',
      '<path d="M' + (wallX - 4) + ' ' + (wallY + 2) + 'l18-13 19 13z" fill="#526a58" stroke="#17211f"/>',
      '<path d="M' + (wallX + 3) + ' ' + (wallY + 3) + 'h8v7h-8z" fill="#355a58" stroke="#d4bd7a"/>',
      '<rect x="' + (wallX + 18) + '" y="' + (wallY + 9) + '" width="7" height="9" fill="#352c27" stroke="#a98755"/>',
      '<path d="M' + (wallX + 21) + ' ' + (wallY + 13) + 'h1" stroke="#efc972"/>',
    )
  }
  common.push('<path d="M' + (x + 4) + ' ' + (y + 11) + 'h' + (w - 8) + '" stroke="' + awning + '" stroke-width="1" opacity=".8"/>')
  return common
}

export function drawAtlas(scene: Scene): { svg: string; width: number; height: number; spots: Record<string, { x: number; y: number }> } {
  const width = Math.max(300, Math.min(560, scene.paneWidth || scene.width * 1.5))
  const hero = Math.max(0, HEROES.indexOf(scene.haven?.hero ?? 'wizard'))
  const background = new Set(scene.backgroundAgents ?? [])
  const actors: { id: string; activity: Activity }[] = Object.entries(scene.activity)
    .filter(([id]) => scene.isTurn || id === '0' || background.has(id) || (scene.departs[id] !== undefined && scene.now - scene.departs[id]! < 1200))
    .sort(([a, aa], [b, bb]) => a === '0' ? -1 : b === '0' ? 1 : Number(bb.isActive) - Number(aa.isActive) || bb.at - aa.at)
    .map(([id, activity]) => ({ id, activity }))

  if (!actors.some(actor => actor.id === '0')) {
    actors.unshift({ id: '0', activity: { tool: '', file: scene.isTurn ? '#hall' : '#inn', at: scene.now, isActive: false, isEdit: false } })
  }
  const visible = actors.slice(0, 4)
  const special: AtlasNode[] = []
  if (visible.some(actor => actor.activity.file === '#terminal')) special.push({ key: 'terminal', kind: 'terminal', title: 'Terminal' })
  if (scene.steps.length || visible.some(actor => actor.activity.file === '#hall')) special.push({ key: 'board', kind: 'board', title: 'Patchboard' })
  const folders: AtlasNode[] = scene.rooms.map((room, index) => ({ key: 'room-' + index, kind: 'folder', title: room.name, room }))
  const ordered = folders.sort((a, b) => {
    const active = (node: AtlasNode) => visible.some(actor => node.room?.desks.some(desk => samePath(desk.path, actor.activity.file)))
    return Number(active(b)) - Number(active(a))
  })
  const nodes = [...special, ...ordered].slice(0, 6)
  const columns = 2
  const gapX = 8
  const padX = 9
  const cardW = (width - padX * 2 - gapX) / columns
  const positions = nodes.map((node, index) => {
    const row = Math.floor(index / columns)
    const col = row % 2 === 0 ? index % columns : columns - 1 - (index % columns)
    return { x: padX + col * (cardW + gapX), y: 29 + row * 40, w: cardW, h: 37 }
  })
  const spots: Record<string, { x: number; y: number }> = {}
  const rows = Math.ceil(nodes.length / columns)
  const footerY = nodes.length ? 30 + rows * 40 - 1 : 145
  const height = footerY + 19
  const bits: string[] = [
    '<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Patchhaven patch trail" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '" font-family="ui-monospace,Menlo,Consolas,monospace" shape-rendering="crispEdges">',
    '<defs><pattern id="grass" width="12" height="10" patternUnits="userSpaceOnUse"><rect width="12" height="10" fill="#334b37"/><path d="M2 2h1m6 5h1M5 8h1" stroke="#75804d" stroke-width="1" opacity=".7"/></pattern></defs>',
    '<rect width="' + width + '" height="' + height + '" fill="#111d1f"/>',
    '<rect id="floor" x="1" y="1" width="' + (width - 2) + '" height="' + (height - 2) + '" fill="#172426" stroke="#43594e"/>',
    '<path d="M2 23h' + (width - 4) + '" stroke="#43594e"/>',
    '<text x="10" y="16" font-size="8" font-weight="700" letter-spacing="1" fill="#e0c782">PATCH TRAIL</text>',
  ]
  const status = scene.failure
    ? scene.failure.error === 'rate_limit' ? 'NO RUN ENERGY' : 'TURN PAUSED'
    : scene.stoppedAt !== undefined && scene.now - scene.stoppedAt < 60_000 ? 'STOPPED'
      : scene.compactAt !== undefined && scene.now - scene.compactAt < 5000 ? 'PACKING TRAIL'
        : scene.isTurn ? 'IN THE FIELD' : background.size ? 'CREW ACTIVE' : 'AT CAMP'
  bits.push('<text x="' + (width - 10) + '" y="16" font-size="6.5" text-anchor="end" letter-spacing=".5" fill="' + (scene.failure ? '#e89a87' : '#9bc9a3') + '">' + status + '</text>')
  for (let mark = 0; mark < 6; mark++) {
    const color = mark < (scene.haven?.landmarks.length ?? 0) ? '#e6c679' : '#46564c'
    const x = 104 + mark * 7
    bits.push('<path d="M' + x + ' 9h4v4h-4z" fill="' + color + '" stroke="#172426" stroke-width=".6"/>')
  }
  bits.push(...terrain(width, footerY - 2))

  if (scene.levelUp && scene.now - scene.levelUp.at < 6000) {
    bits.push('<text x="' + (width / 2) + '" y="25" text-anchor="middle" font-size="7" font-weight="700" fill="#f1cc72">LEVEL UP · ' + scene.levelUp.level + '</text>')
  }

  if (!nodes.length) {
    bits.push(...emptyCamp(width, hero, scene.isTurn ? 'Ready for the next patch' : 'Waiting at camp', scene.isTurn ? 'Claude is choosing a route.' : 'Open a file and the trail will form.', scene.haven?.motion !== false))
  } else {
    const points = positions.map(position => [position.x + position.w / 2, position.y + position.h - 2] as const)
    if (points.length > 1) {
      bits.push('<path d="' + points.map((point, index) => (index ? 'L' : 'M') + point[0] + ' ' + point[1]).join(' ') +
        '" fill="none" stroke="#d6b364" stroke-width="3" stroke-dasharray="1 4" stroke-linecap="square" opacity=".75">' +
        (scene.haven?.motion === false ? '' : '<animate attributeName="stroke-dashoffset" values="0;-10" dur="2.4s" repeatCount="indefinite"/>') + '</path>')
    }
    nodes.forEach((node, index) => {
      const { x, y, w, h } = positions[index]!
      const room = node.room
      const agents = visible.filter(actor => {
        if (node.key === 'terminal') return actor.activity.file === '#terminal'
        if (node.key === 'board') return actor.activity.file === '#hall'
        return Boolean(room?.desks.some(desk => samePath(desk.path, actor.activity.file)))
      })
      const active = agents.length > 0
      const accent = node.kind === 'folder' ? paletteFor(node.title).accent : node.kind === 'board' ? '#e0c782' : '#81c4bd'
      const structure = building(node, x, y, w, h, accent, active)
      bits.push('<g>' + structure.join('') + '</g>')
      if (active) {
        bits.push('<path d="M' + (x + 4) + ' ' + (y + 10) + 'h4m-4 2v5m' + (w - 8) + ' -7h4v7" fill="none" stroke="#f0c86e" stroke-width="1"/>')
      }

      const desk = room?.desks.find(file => agents.some(actor => samePath(actor.activity.file, file.path))) ??
        room?.desks.find(file => file.touch.isActive) ?? room?.desks[room.desks.length - 1]
      const fileName = node.kind === 'terminal'
        ? visible.find(actor => actor.activity.file === '#terminal')?.activity.tool || 'Running a command'
        : node.kind === 'board'
          ? scene.steps.find(step => step.status === 'in_progress')?.text ?? scene.steps[0]?.text ?? 'Plan the next patch'
          : desk?.name ?? 'New patch'
      const add = desk?.change?.add ?? desk?.touch.add ?? 0
      const del = desk?.change?.del ?? desk?.touch.del ?? 0
      const code = desk?.change?.code
      const statusText = node.kind === 'terminal'
        ? actorLabel(agents[0]?.activity ?? { file: '#terminal', tool: '', at: 0, isActive: false, isEdit: false })
        : node.kind === 'board'
          ? (scene.steps.length ? scene.steps.filter(step => step.status === 'completed').length + '/' + scene.steps.length + ' WORK ORDERS' : 'PLANNING')
          : agents.some(actor => scene.asking[actor.id] !== undefined) ? 'NEEDS APPROVAL'
            : [desk?.touch.isNew ? 'NEW' : code ?? (desk?.touch.kind === 'read' ? 'READ' : ''), add ? '+' + add : '', del ? '−' + del : ''].filter(Boolean).join(' · ') || (active ? actorLabel(agents[0]!.activity) : 'FILE DISTRICT')
      const signX = x + 47
      const available = w - 75
      const titleChars = Math.max(7, Math.floor(available / 4.2))
      const fileChars = Math.max(8, Math.floor(available / 5.3))
      bits.push(
        '<path d="M' + (signX - 3) + ' ' + (y + 5) + 'h' + (available + 4) + 'v27h-' + (available + 4) + 'z" fill="#1e302d" stroke="#111b1d" stroke-width="1"/>',
        '<path d="M' + (signX - 1) + ' ' + (y + 7) + 'h' + (available) + 'v23h-' + available + 'z" fill="#273b35" stroke="' + (active ? '#dfc17a' : '#60745e') + '" stroke-width=".8"/>',
        '<path d="M' + (signX + 2) + ' ' + (y + 9) + 'h' + Math.max(8, available - 6) + '" stroke="' + accent + '" stroke-width="1" opacity=".8"/>',
        '<text x="' + (signX + 3) + '" y="' + (y + 15) + '" font-size="6.1" letter-spacing=".45" fill="' + accent + '">' + esc(clip(node.title.toUpperCase(), titleChars)) + '</text>',
        '<text x="' + (signX + 3) + '" y="' + (y + 24) + '" font-size="7.5" fill="#f0efdc">' + esc(clip(fileName, fileChars)) + '</text>',
        '<text x="' + (signX + 3) + '" y="' + (y + 30) + '" font-size="5.6" fill="' + (active ? '#f0c86e' : '#a9b7a5') + '">' + esc(clip(statusText, titleChars + 1)) + '</text>',
      )
      agents.slice(0, 3).forEach((actor, actorNumber) => {
        const px = x + w - 9 - actorNumber * 13
        const feet = y + h - 1
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
        bits.push('<g>' + (scene.haven?.motion === false ? '' : '<animateTransform attributeName="transform" type="translate" values="0 0;0 -1;0 0" dur="1.2s" repeatCount="indefinite"/>') + character(actorIndex(actor.id, hero), 0, 0, 22) + '</g></g>')
        bits.push('<rect x="' + (px - 3) + '" y="' + (y + 2) + '" width="5" height="2" fill="' + AGENT_COLORS[Number(actor.id) % AGENT_COLORS.length] + '"/>')
      })
      if (!agents.length) bits.push('<circle cx="' + (x + w - 10) + '" cy="' + (y + 6) + '" r="1.6" fill="#65766a"/>')
      const splatActor = agents.find(actor => scene.splats[actor.id] && scene.now - scene.splats[actor.id]!.at < 3000)
      const splat = splatActor ? scene.splats[splatActor.id] : undefined
      if (splat && scene.now - splat.at < 3000) {
        const label = splat.kind === 'pass' ? '✓' : splat.kind === 'denied' ? '✋' : splat.kind === 'hit' ? String(splat.damage) : '×'
        bits.push('<rect x="' + (x + w - 27) + '" y="' + (y + 3) + '" width="9" height="9" fill="' + (splat.kind === 'pass' ? '#2f8f2f' : '#b43d3d') + '" stroke="#0b1315"/>')
        bits.push('<text x="' + (x + w - 22.5) + '" y="' + (y + 10) + '" text-anchor="middle" font-size="6" font-weight="700" fill="#fff">' + label + '</text>')
      }
      const drop = desk ? scene.drops[desk.path] : undefined
      if (drop && scene.now - drop.at < 2500) bits.push('<text x="' + (x + w - 8) + '" y="' + (y - 1) + '" text-anchor="middle" font-size="5.5" font-weight="700" fill="#f2c768">+' + drop.xp + '</text>')
    })
  }

  const completed = scene.steps.filter(step => step.status === 'completed').length
  const activeStep = scene.steps.find(step => step.status === 'in_progress') ?? scene.steps.find(step => step.status === 'pending')
  const crewCount = new Set(visible.filter(actor => actor.id !== '0').map(actor => actor.id)).size
  bits.push('<path d="M7 ' + footerY + 'h' + (width - 14) + 'v14H7z" fill="#202e2c" stroke="#526457"/>')
  if (scene.steps.length) {
    const note = activeStep?.text ? ' · ' + activeStep.text : ' · all patches complete'
    bits.push('<text x="13" y="' + (footerY + 9.5) + '" font-size="6" letter-spacing=".2" fill="#e6c679">BOARD ' + completed + '/' + scene.steps.length + '</text>')
    bits.push('<text x="84" y="' + (footerY + 9.5) + '" font-size="5.8" fill="' + (activeStep ? '#c5d2c3' : '#83c997') + '">' + esc(clip(note, Math.floor((width - 98) / 3.7))) + '</text>')
  } else {
    bits.push('<text x="13" y="' + (footerY + 9.5) + '" font-size="6.2" fill="#c0cbb8">' + nodes.length + ' ' + (nodes.length === 1 ? 'DISTRICT' : 'DISTRICTS') + '  ·  ' + crewCount + ' CREW  ·  ' + (scene.haven?.landmarks.length ?? 0) + '/6 MARKS</text>')
    if (scene.bank?.total) bits.push('<text x="' + (width - 13) + '" y="' + (footerY + 9.5) + '" text-anchor="end" font-size="5.8" fill="#e6c679">' + scene.bank.total + ' BANKED</text>')
  }
  if (scene.failure) {
    bits.push('<rect x="' + (width - 113) + '" y="26" width="101" height="12" fill="#3d2221" stroke="#d87865"/>')
    bits.push('<text x="' + (width - 62.5) + '" y="34.5" text-anchor="middle" font-size="5.8" fill="#f0b2a3">' +
      (scene.failure.error === 'rate_limit' ? 'OUT OF RUN ENERGY' : 'TURN PAUSED') + '</text>')
  }
  bits.push('</svg>')

  return { svg: bits.join(''), width, height, spots }
}
