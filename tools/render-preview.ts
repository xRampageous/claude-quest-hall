import { writeFile } from 'node:fs/promises'
import { drawRooms } from '../hooks/rooms'
import type { Scene } from '../hooks/rooms'

const now = Date.now()
const previewWidth = Number(process.argv[2]) || 434
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

const scene: Scene = {
  haven: { hero: 'knight', landmarks: [{ id: 'camp', at: now, runId: 'preview', evidence: 'Three helpers joined the field work' }], motion: true, size: 'auto' },
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
    '0': { tool: 'Edit', file: src, at: now, isActive: true, isEdit: true },
    '1': { tool: 'Review', file: '#crew', at: now - 8000, isActive: false, isEdit: false, mode: 'background' },
    '2': { tool: '$ pnpm test', file: '#terminal', at: now, isActive: true, isEdit: false, mode: 'shell' },
    '3': { tool: 'Edit', file: doc, at: now - 5000, isActive: false, isEdit: true },
  },
  from: {},
  now,
  isTurn: true,
  width: 54,
  paneWidth: previewWidth,
  steps: [
    { text: 'Map the work', status: 'completed' },
    { text: 'Check the patch', status: 'in_progress' },
    { text: 'Share the result', status: 'pending' },
  ],
  drops: {},
  spawns: { '1': now - 300 },
  bank: undefined,
  splats: { '2': { kind: 'pass', damage: 0, at: now - 2000 } },
  departs: {},
  asking: { '1': now },
}

async function main() {
  const image = drawRooms(scene)
  await writeFile(new URL('../assets/patch-trail-preview.svg', import.meta.url), image.svg, 'utf8')
  console.log(`Rendered ${image.width}×${image.height} Patchhaven preview.`)
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
