import { writeFile } from 'node:fs/promises'
import { drawRooms } from '../hooks/rooms'
import type { Scene } from '../hooks/rooms'
import { drawHud } from '../hooks/hud'
import { AGENT_QUEST_SPRITES } from '../hooks/agentquest-sprites'

// Usage: npx --yes tsx tools/render-preview.ts [pane width] [auto|comfortable|large]
const now = Date.now()
const previewWidth = Number(process.argv[2]) || 434
const size = (['auto', 'comfortable', 'large'] as const).find(name => name === process.argv[3]) ?? 'auto'
const zoom = size === 'large' ? 1.22 : size === 'comfortable' ? 1.12 : 1
const width = previewWidth / zoom
const src = 'src/Engine.java'
const test = 'tests/Engine.test.java'
const fresh = 'src/FreshPatch.java'
const doc = 'docs/roadmap.md'
const desk = (path: string, name: string, agent: number, kind: 'read' | 'edit' = 'edit', isNew = false) => ({
  path,
  name,
  touch: { path, agent, isActive: false, edits: 2, kind, isNew, add: isNew ? 18 : 12, del: 4 },
  change: { code: isNew ? 'A' as const : 'M' as const, add: isNew ? 18 : 12, del: 4, mtimeMs: now },
})

// Claude edits Engine.java while a bug from a failing check is still loose there;
// one crew member runs the tests, another waits for approval, a third writes docs.
const scene: Scene = {
  haven: { hero: 'knight', landmarks: [{ id: 'camp', at: now, runId: 'preview', evidence: 'Three helpers joined the field work' }], motion: true, size },
  backgroundAgents: ['1', '2', '3'],
  crew: [
    { id: 'review-1', index: 1, name: 'Reviewer', type: 'reviewer', description: 'Review the API patch', status: 'running' },
    { id: 'test-1', index: 2, name: 'Test runner', type: 'test', description: 'Run the engine checks', status: 'running' },
    { id: 'docs-1', index: 3, name: 'Writer', type: 'writer', description: 'Update the field guide', status: 'running' },
  ],
  crewTotal: 3,
  questStatus: 'active',
  rooms: [
    { key: 'src', name: 'src', slot: 0, desks: [desk(src, 'Engine.java', 0)] },
    { key: 'tests', name: 'tests', slot: 1, desks: [desk(test, 'Engine.test.java', 2, 'read')] },
    { key: '#forge', name: 'Forge', slot: 2, desks: [desk(fresh, 'FreshPatch.java', 0, 'edit', true)] },
    { key: 'docs', name: 'docs', slot: 3, desks: [desk(doc, 'roadmap.md', 3, 'read')] },
  ],
  activity: {
    '0': { tool: 'Edit', file: src, at: now, isActive: true, isEdit: true, mode: 'edit' },
    '1': { tool: 'Review', file: '#crew', at: now - 8000, isActive: false, isEdit: false, mode: 'background' },
    '2': { tool: '$ pnpm test', file: '#terminal', at: now, isActive: true, isEdit: false, mode: 'test' },
    '3': { tool: '', file: doc, at: now - 5000, isActive: false, isEdit: true, mode: 'reply' },
  },
  from: {},
  now,
  isTurn: true,
  width: Math.round(width / 1.5),
  paneWidth: width,
  steps: [
    { text: 'Map the work', status: 'completed' },
    { text: 'Check the patch', status: 'in_progress' },
    { text: 'Share the result', status: 'pending' },
  ],
  drops: { [src]: { xp: 18, at: now - 400 } },
  spawns: {},
  bank: undefined,
  splats: {},
  departs: {},
  asking: { '1': now },
  mobs: [{ id: 'preview-bug', file: src, agent: 2, hp: 3, at: now - 20_000 }],
}

const hud = drawHud({
  width,
  scale: Math.max(1.1, Math.min(1.38, previewWidth / 315)),
  motion: true,
  now,
  portrait: AGENT_QUEST_SPRITES.rogue!.idle.south,
  name: 'Claude · Craftmaster',
  subtitle: 'knight · Homestead · patchhaven',
  status: 'WORKING · 3:42',
  statusTone: 'live',
  coding: { level: 12, xp: 1834, from: 1358, to: 2184 },
  skills: [
    { id: 'crafting', name: 'Crafting', level: 7, progress: .62, lit: true },
    { id: 'research', name: 'Research', level: 4, progress: .3, lit: false },
    { id: 'verification', name: 'Verification', level: 3, progress: .85, lit: false },
    { id: 'teamwork', name: 'Teamwork', level: 2, progress: .1, lit: false },
  ],
  drops: [{ xp: 18, skill: 'coding', at: now - 400 }, { xp: 12, skill: 'crafting', at: now - 300 }],
  haul: { edits: 14, files: 9, passed: 3, failed: 1, quests: 2, banked: 6, crew: 3, bugs: 1, add: 120, del: 30 },
})

async function main() {
  const map = drawRooms(scene)
  const gap = 6
  const height = hud.height + gap + map.height
  // The pane draws the HUD and the map as two pictures; the preview stacks them.
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Patchhaven HUD and live work trail" width="' + previewWidth + '" height="' + Math.round(height * zoom) + '" viewBox="0 0 ' + width + ' ' + height + '">' +
    '<rect width="' + width + '" height="' + height + '" fill="#101a1b"/>' +
    hud.svg.replace('<svg ', '<svg x="0" y="0" ') +
    map.svg.replace('<svg ', '<svg x="0" y="' + (hud.height + gap) + '" ') + '</svg>'
  await writeFile(new URL('../assets/patch-trail-preview.svg', import.meta.url), svg, 'utf8')
  console.log(`Rendered a ${previewWidth}px Patchhaven preview (${size}): HUD ${hud.svg.length.toLocaleString()} and map ${map.svg.length.toLocaleString()} characters.`)
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
