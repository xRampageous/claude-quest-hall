import { expect, mock, test } from 'claude-code/testing'
import { activityAction, drawLivingTrail } from '../hooks/living-trail'
import type { ActorAction } from '../hooks/living-trail'
import type { Activity } from '../types'

type Drawing = { findAll(query: { type: string }): Promise<readonly { text?: string; props: Record<string, unknown> }[]> }
// The living map, told from the HUD by its own label.
async function sceneOf(ui: Drawing) {
  return String((await ui.findAll({ type: 'Svg' })).find(item => String(item.props.source).includes('Patchhaven live work trail'))!.props.source)
}
async function hudOf(ui: Drawing) {
  return (await ui.findAll({ type: 'Svg' })).find(item => String(item.props.source).includes('Patchhaven hero status'))!
}

const PANE = {
  plugin: 'task-board',
  component: 'Pane',
  requestId: 'task-board',
  props: { title: 'Patchhaven', isFocused: false, bodyColumns: 43, placement: 'dock', scroll: { offset: 0, bodyRows: 36 }, view: {} },
} as const

type On = Parameters<Parameters<typeof test>[1]>[1]
function world(on: On, answer: (event: Record<string, unknown>) => unknown = () => ({ result: 'ok', text: 'ok' })) {
  const clock = mock.clock(on)
  mock.store(on)
  on('command.register', () => ({ value: { command: 'x' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: 'C:\\proj' }))
  on('fs.stat', () => ({ value: { kind: 'file', size: 1, mtimeMs: 1, isLink: false } }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false } }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('tool.call', async (_, e) => answer(e as Record<string, unknown>) as never)
  return clock
}

const scene = (activity: Activity, extra: Record<string, unknown> = {}) => drawLivingTrail({
  haven: { hero: 'wizard', landmarks: [], motion: true },
  rooms: [{ key: 'src', name: 'src', slot: 0, desks: [{ path: 'src/Engine.java', name: 'Engine.java', touch: { path: 'src/Engine.java', agent: 0, isActive: true, edits: 1, kind: 'edit' } }] }],
  activity: { '0': activity }, from: {}, now: 100, isTurn: true, width: 54, paneWidth: 434, steps: [], drops: {}, spawns: {},
  splats: {}, departs: {}, asking: {}, ...extra,
}).svg

test('every kind of work has its own badge, and hands-on work its own prop', () => {
  const cases: [ActorAction, Partial<Activity>, string][] = [
    ['editing', { tool: 'Edit', isEdit: true, mode: 'edit' }, 'page'],
    ['creating', { tool: 'Write', isEdit: true, isNew: true, mode: 'create' }, 'new-page'],
    ['reading', { tool: 'Read', mode: 'read' }, 'book'],
    ['searching', { tool: '⌕ TODO', mode: 'search' }, 'lens'],
    ['testing', { tool: '$ npm test', mode: 'test' }, 'dummy'],
    ['researching', { tool: 'WebSearch', mode: 'web' }, 'globe'],
    ['applying', { tool: 'MultiEdit', isEdit: true, isApply: true, mode: 'apply' }, 'rune'],
    ['command', { tool: '$ git status', mode: 'shell' }, 'console'],
    ['tool', { tool: '⚙ lookup', mode: 'tool' }, 'gear'],
    ['delegating', { tool: '↗ Review the patch', mode: 'background' }, 'order'],
  ]
  const markers = new Set<string>()
  for (const [action, partial, prop] of cases) {
    const svg = scene({ tool: '', file: 'src/Engine.java', at: 100, isActive: true, isEdit: false, ...partial })
    expect(svg).toContain(`data-action="${action}"`)
    expect(svg).toContain(`data-action-marker="${action}"`)
    expect(svg).toContain(`data-prop="${prop}"`)
    // Each badge is a pixel icon, never a letter.
    const marker = svg.slice(svg.indexOf(`data-action-marker="${action}"`), svg.indexOf('</g>', svg.indexOf(`data-action-marker="${action}"`)))
    expect(marker).not.toContain('<text')
    markers.add(/<path d="([^"]+)" fill/.exec(marker)?.[1] ?? '')
  }
  expect(markers.size).toBe(cases.length)

  // Between tools: the model's streamed phase, a quest board, or a question for you.
  const idle = { tool: '', file: '#hall', at: 100, isActive: false, isEdit: false } as Activity
  expect(activityAction({ ...idle, mode: 'think' }, false, false, true)).toBe('thinking')
  expect(activityAction({ ...idle, mode: 'reply' }, false, false, true)).toBe('replying')
  expect(activityAction({ ...idle, mode: 'reply' }, false, false, false)).toBe('idle')
  expect(activityAction({ ...idle, mode: 'ask', isActive: true }, false, false, true)).toBe('waiting')
  expect(scene({ ...idle, mode: 'reply' })).toContain('data-prop="scroll"')
  expect(scene({ ...idle, mode: 'reply' })).toContain('WRITING REPLY')
  expect(scene({ ...idle, mode: 'quests' })).toContain('data-prop="board"')
})

test('the model streaming shows as thinking, then writing a reply, without overwriting a running tool', async ($, on) => {
  let respond: (event: Record<string, unknown>) => unknown = () => ({ result: 'ok', text: 'ok' })
  world(on, event => respond(event))
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  on('turn.step', async function* (_, e) {
    yield { kind: 'thinking', index: 0, text: 'Let me look.' } as never
    await gate
    yield { kind: 'text', index: 1, text: 'Here is the fix.' } as never
    return { turnId: e.turnId, index: e.index, answer: 'Here is the fix.', toolUses: [] } as never
  })
  await $.session.start({ cwd: 'C:\\proj', surface: 'desktop', isInteractive: true })
  await $.prompt.submit({ text: 'fix it' } as never)
  const shown = async () => {
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
    const svg = await sceneOf(ui as never)
    await ui.unmount()
    return svg
  }

  const stream = $.turn.step({ turnId: 't1', index: 0, model: 'claude-test', messageCount: 1 })
  await stream.next()
  const thinking = await shown()
  expect(thinking).toMatch(/data-agent="0"[^>]*data-action="thinking"/)
  expect(thinking).toContain('THINKING')
  release()
  await stream.next()
  const replying = await shown()
  expect(replying).toMatch(/data-agent="0"[^>]*data-action="replying"/)
  expect(replying).toContain('WRITING REPLY')
  for (;;) if ((await stream.next()).done) break

  // A tool already running is never overwritten by a phase.
  let finish!: () => void
  const held = new Promise<void>(resolve => { finish = resolve })
  let started!: () => void
  const running = new Promise<void>(resolve => { started = resolve })
  respond = async () => { started(); await held; return { result: 'ok', text: 'ok' } }
  const pending = $.tool.call({ tool: 'Bash', command: 'npm run build' } as never)
  await running
  for await (const _ of $.turn.step({ turnId: 't1', index: 1, model: 'claude-test', messageCount: 3 })) { /* drain */ }
  expect(await shown()).toMatch(/data-agent="0"[^>]*data-action="command"/)
  finish()
  await pending
})

test('questions, skills, code navigation, browsing and messages each get the right cue', async ($, on) => {
  let finish!: () => void
  let started!: () => void
  world(on, async () => { started(); await new Promise<void>(resolve => { finish = resolve }); return { result: 'ok', text: 'ok' } })
  await $.session.start({ cwd: 'C:\\proj', surface: 'desktop', isInteractive: true })
  await $.prompt.submit({ text: 'go' } as never)
  const during = async (call: Record<string, unknown>) => {
    const begun = new Promise<void>(resolve => { started = resolve })
    const pending = $.tool.call(call as never)
    await begun
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
    const svg = await sceneOf(ui as never)
    await ui.unmount()
    finish()
    await pending
    return svg
  }

  const asked = await during({ tool: 'AskUserQuestion', questions: [] })
  expect(asked).toContain('AWAITING YOU')
  expect(asked).toContain('>?</text>')
  expect(await during({ tool: 'ExitPlanMode' })).toContain('AWAITING YOU')
  const skill = await during({ tool: 'Skill', skill: 'pdf' })
  expect(skill).toContain('✦ pdf')
  expect(skill).toContain('data-action="tool"')
  expect(await during({ tool: 'LSP', operation: 'goToDefinition' })).toContain('data-action="searching"')
  expect(await during({ tool: 'mcp__Claude_Browser__navigate', url: 'https://example.com' })).toContain('data-action="researching"')
  expect(await during({ tool: 'SendMessage', to: 'reviewer', message: 'hi' })).toContain('data-action="delegating"')
})

test('a failing check lets a bug loose where it ran, and a passing check squashes it', async ($, on) => {
  let output = 'Tests: 3 failed, 9 passed'
  let failing = true
  const checks = (e: Record<string, unknown>) => String(e.command ?? '').includes('test') ? { result: 'ok', text: output, isError: failing } : { result: 'ok', text: 'ok' }
  let respond: (event: Record<string, unknown>) => unknown = checks
  world(on, event => respond(event))
  await $.session.start({ cwd: 'C:\\proj', surface: 'desktop', isInteractive: true })
  await $.prompt.submit({ text: 'fix the engine' } as never)
  await $.tool.call({ tool: 'Edit', file_path: 'C:\\proj\\src\\Engine.java', old_string: 'a', new_string: 'b' })
  await $.tool.call({ tool: 'Bash', command: 'npm test' } as never)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const loose = await sceneOf(ui as never)
  // The bug stands in src, where the check ran, with one pip per failing test.
  expect(loose).toContain('data-mob-state="lurking"')
  expect((loose.slice(loose.indexOf('data-mob='), loose.indexOf('</g>', loose.indexOf('data-mob=') + 400) + 400).match(/fill="#d8524a"/g) ?? []).length).toBe(3)
  const hud = await hudOf(ui as never)
  expect(String(hud.props.alt)).toContain('1 bug loose')
  expect(String(hud.props.source)).toContain('data-haul="bugs"')
  await ui.unmount()

  // Working at the bug while it is loose: the worker strikes and the bug flinches.
  let finish!: () => void
  let started!: () => void
  respond = async () => { started(); await new Promise<void>(resolve => { finish = resolve }); return { result: 'ok', text: 'ok' } }
  const begun = new Promise<void>(resolve => { started = resolve })
  const editing = $.tool.call({ tool: 'Edit', file_path: 'C:\\proj\\src\\Engine.java', old_string: 'b', new_string: 'c' })
  await begun
  const fight = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await sceneOf(fight as never)).toContain('data-mob-state="hurt"')
  await fight.unmount()
  finish()
  await editing

  output = 'Tests: 12 passed'
  failing = false
  respond = checks
  await $.tool.call({ tool: 'Bash', command: 'npm test' } as never)
  const after = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const squashed = await sceneOf(after as never)
  expect(squashed).toContain('data-mob-state="defeated"')
  expect(squashed).toContain('SQUASHED')
  await after.unmount()

  // The terminal says the same in words.
  output = 'Tests: 1 failed'
  failing = true
  await $.tool.call({ tool: 'Bash', command: 'npm test' } as never)
  const terminal = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const words = (await terminal.findAll({ type: 'Text' })).map(item => item.text).join('\n')
  expect(words).toContain('IN THE FIELD')
  expect(words).toContain('1 bug loose from failing checks')
  await terminal.unmount()
})

test('the HUD drops the XP an edit earns and lights the skill that earned it', async ($, on) => {
  world(on)
  await $.session.start({ cwd: 'C:\\proj', surface: 'desktop', isInteractive: true })
  await $.prompt.submit({ text: 'edit' } as never)
  await $.tool.call({ tool: 'Edit', file_path: 'C:\\proj\\src\\Engine.java', old_string: 'a', new_string: 'b\nc' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const hud = await hudOf(ui as never)
  const source = String(hud.props.source)
  expect(source).toContain('data-xp-drop="coding"')
  expect(source).toContain('>+18<')
  expect(source).toContain('data-xp-drop="crafting"')
  expect(source).toMatch(/data-skill="crafting"[^>]*><circle[^>]*><animate attributeName="r"/)
  expect(source).toMatch(/data-xp-fill="0\.\d+"/)
  expect(source).toContain('data-haul="edits"')
  expect(String(hud.props.alt)).toContain('Coding 1 · 18 xp')
  // The terminal keeps the same facts as text.
  await ui.unmount()
  const terminal = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const words = (await terminal.findAll({ type: 'Text' })).map(item => item.text).join('\n')
  expect(words).toContain('Coding 1')
  expect(words).toContain('Claude · patch saved · src › Engine.java')
  await terminal.unmount()
})

test('a crowded, walking scene stays under the Svg source limit at every size', () => {
  const crew = Array.from({ length: 7 }, (_, index) => ({ id: `c${index}`, index: index + 1, name: `R${index}`, type: 'reviewer', description: 'Review', status: 'running' as const }))
  const places = ['src/Engine.java', '#terminal', 'tests/Engine.test.java', 'docs/guide.md', '#crew', 'src/Engine.java', '#hall', 'src/Fresh.java']
  const desk = (path: string) => ({ path, name: path.split('/').at(-1)!, touch: { path, agent: 0, isActive: true, edits: 1, kind: 'edit' as const } })
  for (const paneWidth of [240, 320, 434, 560]) {
    for (const size of ['auto', 'comfortable', 'large'] as const) {
      const svg = drawLivingTrail({
        haven: { hero: 'wizard', landmarks: [], motion: true, size },
        rooms: [{ key: 'src', name: 'src', desks: [desk('src/Engine.java'), desk('src/Fresh.java')] }, { key: 'tests', name: 'tests', desks: [desk('tests/Engine.test.java')] }, { key: 'docs', name: 'docs', desks: [desk('docs/guide.md')] }],
        activity: Object.fromEntries(places.map((file, index) => [String(index), { tool: 'Edit', file, at: 100, isActive: true, isEdit: true, mode: 'edit' as const }])),
        crew, from: Object.fromEntries(places.map((_, index) => [String(index), { x: 5, y: 5 }])),
        now: 100, isTurn: true, width: 54, paneWidth, steps: [], drops: {}, spawns: {}, splats: {}, departs: {}, asking: {},
        mobs: [{ id: 'b1', file: 'src/Engine.java', agent: 0, hp: 5, at: 1 }, { id: 'b2', file: '#terminal', agent: 1, hp: 2, at: 1 }],
      }).svg
      expect(svg.length).toBeLessThan(131_072)
      expect(svg).toContain('data-state="walking"')
    }
  }
})
