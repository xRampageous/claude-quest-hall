// The Patchhaven HUD: a hero plate, the Coding bar with its XP drops, four
// skill orbs and the visit's haul, drawn as one pixel panel over the map.
import { actionIcon } from './living-trail'
import type { ActorAction } from './living-trail'

export type HudSkill = { id: string; name: string; level: number; progress: number; lit: boolean }
// An XP drop that rises off the bar: an amount, the skill that earned it, and when.
export type HudDrop = { xp: number; skill: string; at: number }
export type HudHaul = { edits: number; files: number; passed: number; failed: number; quests: number; banked: number; crew: number; bugs: number; add?: number; del?: number }
export type Hud = {
  width: number
  scale: number
  motion: boolean
  now: number
  portrait: string
  name: string
  subtitle: string
  status: string
  statusTone: 'live' | 'calm' | 'alert' | 'demo'
  coding: { level: number; xp: number; from: number; to: number }
  levelUpAt?: number
  skills: readonly HudSkill[]
  drops: readonly HudDrop[]
  haul: HudHaul
}

const esc = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const clip = (value: string, length: number) => value.length > length ? value.slice(0, Math.max(1, length - 1)) + '…' : value
const n = (value: number) => Math.round(value * 10) / 10
// Each skill keeps one icon and colour everywhere it appears.
export const SKILL_ART: Record<string, { action: ActorAction; color: string; label: string }> = {
  coding: { action: 'working', color: '#f2c768', label: 'Coding' },
  crafting: { action: 'editing', color: '#e39a5d', label: 'Crafting' },
  research: { action: 'reading', color: '#8fc6e8', label: 'Research' },
  verification: { action: 'testing', color: '#9be08a', label: 'Verification' },
  teamwork: { action: 'delegating', color: '#d9a2df', label: 'Teamwork' },
}
const TONES = { live: ['#20402f', '#9be08a'], calm: ['#24302c', '#b9c3ac'], alert: ['#45231f', '#f0a28f'], demo: ['#2f2a45', '#c9b8f2'] } as const

// A bevelled stone frame, OSRS-style: a dark rim, a lit top-left and a shaded bottom-right.
function frame(x: number, y: number, w: number, h: number, fill = '#2b2620'): string {
  return '<rect x="' + n(x) + '" y="' + n(y) + '" width="' + n(w) + '" height="' + n(h) + '" fill="' + fill + '" stroke="#0e0c0a"/>' +
    '<path d="M' + n(x + 1) + ' ' + n(y + h - 1) + 'V' + n(y + 1) + 'H' + n(x + w - 1) + '" fill="none" stroke="#5d5040" stroke-width=".8"/>' +
    '<path d="M' + n(x + w - 1) + ' ' + n(y + 1) + 'V' + n(y + h - 1) + 'H' + n(x + 1) + '" fill="none" stroke="#17130f" stroke-width=".8"/>'
}

export function drawHud(hud: Hud): { svg: string; width: number; height: number; alt: string } {
  const { width, scale, motion, now } = hud
  const narrow = width < 330
  const pad = 6
  const out: string[] = []
  const lineHeight = 9 * scale
  // ── Hero plate: a framed portrait, the name, and where the hero stands.
  const plate = Math.round(30 * scale)
  out.push(frame(pad, pad, plate, plate, '#1d2a26'))
  out.push('<svg x="' + n(pad + 1) + '" y="' + n(pad + 1) + '" width="' + n(plate - 2) + '" height="' + n(plate - 2) + '" viewBox="14 8 28 28"><image href="' + hud.portrait + '" width="56" height="56" image-rendering="pixelated"/></svg>')
  const textX = pad + plate + 6
  const pill = Math.min(width * .5, hud.status.length * 4.6 * scale + 14)
  // XP drops rise at the right end of the subtitle row, the newest nearest the bar.
  const recent = hud.drops.filter(drop => now - drop.at < 3600).slice(-2)
  const dropSize = 7 * scale
  const dropWidths = recent.map(drop => ('+' + drop.xp.toLocaleString('en-US')).length * 4.3 * scale + dropSize + 4)
  const dropZone = dropWidths.reduce((sum, w) => sum + w, 0)
  out.push('<text x="' + n(textX) + '" y="' + n(pad + lineHeight) + '" font-size="' + n(9.4 * scale) + '" font-weight="700" fill="#f0d58c">' + esc(clip(hud.name, Math.floor((width - textX - pill - 12) / (5.8 * scale)))) + '</text>')
  out.push('<text x="' + n(textX) + '" y="' + n(pad + lineHeight * 2 + 1) + '" font-size="' + n(7 * scale) + '" fill="#b9b19a">' + esc(clip(hud.subtitle, Math.floor((width - textX - pad - dropZone - 4) / (4.4 * scale)))) + '</text>')
  const [pillFill, pillInk] = TONES[hud.statusTone]
  out.push('<rect x="' + n(width - pad - pill) + '" y="' + pad + '" width="' + n(pill) + '" height="' + n(10 * scale) + '" rx="2" fill="' + pillFill + '" stroke="' + pillInk + '" stroke-width=".6"/>')
  if (hud.statusTone === 'live' && motion) out.push('<rect x="' + n(width - pad - pill + 4) + '" y="' + n(pad + 5 * scale - 1.5) + '" width="3" height="3" fill="' + pillInk + '"><animate attributeName="opacity" values="1;.2;1" dur="1.6s" repeatCount="indefinite"/></rect>')
  out.push('<text x="' + n(width - pad - pill / 2 + (hud.statusTone === 'live' ? 2 : 0)) + '" y="' + n(pad + 7.3 * scale) + '" text-anchor="middle" font-size="' + n(6.6 * scale) + '" font-weight="700" letter-spacing=".2" fill="' + pillInk + '">' + esc(clip(hud.status, Math.floor((pill - 10) / (4.3 * scale)))) + '</text>')

  // ── The Coding bar: level badge, a segmented fill, and the XP still to earn.
  const barY = pad + plate - 9 * scale + 1
  const badge = 'LV ' + hud.coding.level
  const badgeWidth = badge.length * 5.4 * scale + 8
  const barX = textX + badgeWidth + 4
  const barWidth = width - pad - barX
  const barHeight = 9 * scale
  const fraction = hud.coding.to > hud.coding.from ? Math.max(0, Math.min(1, (hud.coding.xp - hud.coding.from) / (hud.coding.to - hud.coding.from))) : 1
  const leveled = hud.levelUpAt !== undefined && now - hud.levelUpAt < 6000
  out.push('<rect x="' + n(textX) + '" y="' + n(barY) + '" width="' + n(badgeWidth) + '" height="' + n(barHeight) + '" fill="#3a2c12" stroke="#f2c768" stroke-width=".7"/>')
  out.push('<text x="' + n(textX + badgeWidth / 2) + '" y="' + n(barY + barHeight * .78) + '" text-anchor="middle" font-size="' + n(7.4 * scale) + '" font-weight="700" fill="#f2c768">' + badge + '</text>')
  out.push(frame(barX, barY, barWidth, barHeight, '#14110d'))
  out.push('<rect data-xp-fill="' + fraction.toFixed(3) + '" x="' + n(barX + 1.5) + '" y="' + n(barY + 1.5) + '" width="' + n(Math.max(0, (barWidth - 3) * fraction)) + '" height="' + n(barHeight - 3) + '" fill="' + (leveled ? '#ffe08a' : '#c99a2e') + '"' + (leveled && motion ? '><animate attributeName="fill" values="#ffe08a;#c99a2e;#ffe08a" dur=".8s" repeatCount="4"/></rect>' : '/>'))
  out.push('<rect x="' + n(barX + 1.5) + '" y="' + n(barY + 1.5) + '" width="' + n(Math.max(0, (barWidth - 3) * fraction)) + '" height="' + n(Math.max(1, barHeight * .22)) + '" fill="#ffe7a3" opacity=".55"/>')
  // Ten notches, as on a game's experience bar.
  for (let notch = 1; notch < 10; notch++) out.push('<rect x="' + n(barX + barWidth * notch / 10) + '" y="' + n(barY + 2) + '" width=".7" height="' + n(barHeight - 4) + '" fill="#0e0c0a" opacity=".55"/>')
  const remaining = Math.max(0, hud.coding.to - hud.coding.xp)
  const barText = leveled ? 'LEVEL UP!' : hud.coding.to > hud.coding.xp ? hud.coding.xp.toLocaleString('en-US') + ' XP · ' + remaining.toLocaleString('en-US') + ' TO ' + (hud.coding.level + 1) : hud.coding.xp.toLocaleString('en-US') + ' XP'
  out.push('<text x="' + n(barX + barWidth / 2) + '" y="' + n(barY + barHeight * .76) + '" text-anchor="middle" font-size="' + n(6.6 * scale) + '" font-weight="700" fill="#fff4d0" stroke="#1a1308" stroke-width="1.6" paint-order="stroke">' + esc(clip(barText, Math.floor(barWidth / (4.2 * scale)))) + '</text>')

  // ── XP drops: each recent gain floats up into place with its skill's icon, then fades.
  let dropX = width - pad - dropZone
  recent.forEach((drop, index) => {
    const art = SKILL_ART[drop.skill] ?? SKILL_ART.coding!
    const label = '+' + drop.xp.toLocaleString('en-US')
    const baseY = pad + lineHeight * 2 + 1
    out.push('<g data-xp-drop="' + esc(drop.skill) + '">' + (motion ? '<animateTransform attributeName="transform" type="translate" values="0 ' + n(dropSize * .45) + ';0 0" dur=".5s" fill="freeze"/><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.12;.8;1" dur="' + n(Math.max(.6, (3600 - (now - drop.at)) / 1000)) + 's" fill="freeze"/>' : ''))
    out.push(actionIcon(art.action, dropX, baseY - dropSize + 1, dropSize - 1, art.color))
    out.push('<text x="' + n(dropX + dropSize + 1) + '" y="' + n(baseY) + '" font-size="' + n(dropSize) + '" font-weight="700" fill="' + art.color + '" stroke="#0d0b08" stroke-width="1.6" paint-order="stroke">' + label + '</text></g>')
    dropX += dropWidths[index]!
  })

  // ── Skill orbs and the haul: one row on a wide pane, two on a narrow one.
  const rowY = pad + plate + 6
  const orb = 8.2 * scale
  const orbGap = orb * 2 + 6
  const orbsWidth = hud.skills.length * orbGap
  hud.skills.forEach((skill, index) => {
    const art = SKILL_ART[skill.id]!
    const cx = pad + orb + index * orbGap
    const cy = rowY + orb + 1
    const ring = 2 * Math.PI * (orb - 1.2)
    out.push('<g data-skill="' + skill.id + '" aria-label="' + esc(art.label + ' level ' + skill.level) + '">')
    if (skill.lit && motion) out.push('<circle cx="' + n(cx) + '" cy="' + n(cy) + '" r="' + n(orb + 1) + '" fill="none" stroke="' + art.color + '" stroke-width="1"><animate attributeName="r" values="' + n(orb) + ';' + n(orb + 4) + '" dur="1.2s" repeatCount="3" fill="freeze"/><animate attributeName="opacity" values=".9;0" dur="1.2s" repeatCount="3" fill="freeze"/></circle>')
    out.push('<circle cx="' + n(cx) + '" cy="' + n(cy) + '" r="' + n(orb) + '" fill="#15120e" stroke="#0e0c0a"/>')
    out.push('<circle cx="' + n(cx) + '" cy="' + n(cy) + '" r="' + n(orb - 1.2) + '" fill="none" stroke="#3b342a" stroke-width="1.8"/>')
    // The ring fills toward the next level, starting at twelve o'clock.
    out.push('<circle cx="' + n(cx) + '" cy="' + n(cy) + '" r="' + n(orb - 1.2) + '" fill="none" stroke="' + art.color + '" stroke-width="1.8" stroke-dasharray="' + n(ring * skill.progress) + ' ' + n(ring) + '" transform="rotate(-90 ' + n(cx) + ' ' + n(cy) + ')" shape-rendering="geometricPrecision"/>')
    out.push(actionIcon(art.action, cx - orb * .42, cy - orb * .62, orb * .64, skill.lit ? '#fff4d0' : art.color))
    out.push('<text x="' + n(cx) + '" y="' + n(cy + orb * .78) + '" text-anchor="middle" font-size="' + n(5.8 * scale) + '" font-weight="700" fill="#fff4d0" stroke="#0d0b08" stroke-width="1.4" paint-order="stroke">' + skill.level + '</text></g>')
  })

  // The haul: this visit's loot as inventory slots, each a real count.
  const haul: { key: string; action: ActorAction | 'coin' | 'bug'; count: number; color: string; title: string }[] = [
    { key: 'edits', action: 'editing', count: hud.haul.edits, color: '#e39a5d', title: 'edits' },
    { key: 'files', action: 'reading', count: hud.haul.files, color: '#8fc6e8', title: 'files' },
    { key: 'passed', action: 'testing', count: hud.haul.passed, color: '#9be08a', title: 'checks passed' },
    { key: 'quests', action: 'planning', count: hud.haul.quests, color: '#f2c768', title: 'quests' },
    { key: 'banked', action: 'coin', count: hud.haul.banked, color: '#f2c768', title: 'files banked' },
    { key: 'crew', action: 'delegating', count: hud.haul.crew, color: '#d9a2df', title: 'crew' },
    ...(hud.haul.failed || hud.haul.bugs ? [{ key: 'bugs', action: 'bug' as const, count: hud.haul.bugs || hud.haul.failed, color: '#f0a28f', title: hud.haul.bugs ? 'bugs loose' : 'checks failed' }] : []),
  ]
  const slot = 17 * scale
  const haulY = narrow ? rowY + orb * 2 + 6 : rowY
  const haulX = narrow ? pad : pad + orbsWidth + 4
  const slots = Math.max(1, Math.min(haul.length, Math.floor((width - pad - haulX + 3) / (slot + 3))))
  haul.slice(0, slots).forEach((item, index) => {
    const x = haulX + index * (slot + 3)
    const empty = item.count === 0
    out.push('<g data-haul="' + item.key + '" aria-label="' + item.count + ' ' + item.title + '"' + (empty ? ' opacity=".42"' : '') + '>')
    out.push(frame(x, haulY, slot, slot, '#3b3226'))
    if (item.action === 'coin') {
      out.push('<circle cx="' + n(x + slot * .42) + '" cy="' + n(haulY + slot * .5) + '" r="' + n(slot * .2) + '" fill="#c99a2e" stroke="#5a4210" stroke-width=".7"/><circle cx="' + n(x + slot * .56) + '" cy="' + n(haulY + slot * .4) + '" r="' + n(slot * .2) + '" fill="#f2c768" stroke="#5a4210" stroke-width=".7"/>')
    } else if (item.action === 'bug') {
      out.push('<path d="M' + n(x + slot * .3) + ' ' + n(haulY + slot * .3) + 'h' + n(slot * .4) + 'v' + n(slot * .4) + 'h' + n(-slot * .4) + 'z" fill="#b43d3d"/><path d="M' + n(x + slot * .2) + ' ' + n(haulY + slot * .38) + 'h' + n(slot * .6) + 'M' + n(x + slot * .2) + ' ' + n(haulY + slot * .58) + 'h' + n(slot * .6) + '" stroke="#f0a28f" stroke-width=".9"/>')
    } else {
      out.push(actionIcon(item.action, x + slot * .2, haulY + slot * .16, slot * .5, item.color))
    }
    // Stack counts sit top-left in yellow, as a game inventory shows them.
    out.push('<text x="' + n(x + 2) + '" y="' + n(haulY + 6.4 * scale) + '" font-size="' + n(6.2 * scale) + '" font-weight="700" fill="' + (item.key === 'bugs' ? '#ff8f80' : '#ffef6e') + '" stroke="#0d0b08" stroke-width="1.3" paint-order="stroke">' + (item.count > 999 ? Math.floor(item.count / 1000) + 'K' : item.count) + '</text></g>')
  })

  const height = Math.ceil(haulY + (narrow ? slot : Math.max(slot, orb * 2 + 2)) + pad)
  const body = '<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Patchhaven hero status" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '" font-family="ui-monospace,Menlo,Consolas,monospace" shape-rendering="crispEdges">' +
    frame(.5, .5, width - 1, height - 1, '#1f1b16') + out.join('') + '</svg>'
  const skills = hud.skills.map(skill => SKILL_ART[skill.id]!.label + ' ' + skill.level).join(', ')
  const alt = hud.name + ', ' + hud.subtitle + '. ' + hud.status + '. Coding ' + hud.coding.level + ' · ' + hud.coding.xp.toLocaleString('en-US') + ' xp. ' + skills + '. ' +
    hud.haul.edits + (hud.haul.edits === 1 ? ' edit' : ' edits') + ' · ' + hud.haul.files + (hud.haul.files === 1 ? ' file' : ' files') + ' · ' + hud.haul.quests + (hud.haul.quests === 1 ? ' quest' : ' quests') +
    ' · ' + hud.haul.passed + ' checks passed' + (hud.haul.failed ? ' · ' + hud.haul.failed + ' failed' : '') + (hud.haul.banked ? ' · ' + hud.haul.banked + ' banked' : '') + (hud.haul.bugs ? ' · ' + hud.haul.bugs + (hud.haul.bugs === 1 ? ' bug loose' : ' bugs loose') : '') + (hud.haul.add ? ' · +' + hud.haul.add.toLocaleString('en-US') + ' lines' : '') + (hud.haul.del ? ' · −' + hud.haul.del.toLocaleString('en-US') + ' lines' : '') + '.'
  return { svg: body, width, height, alt }
}
