import { expect, mock, test } from 'claude-code/testing'

const PANE = {
  plugin: 'task-board',
  component: 'Pane',
  requestId: 'task-board',
  props: { title: 'Workbench', isFocused: false, bodyColumns: 43, placement: 'dock', scroll: { offset: 0, bodyRows: 36 }, view: {} },
} as const

const GIT: Record<string, string> = {
  'rev-parse': 'C:/proj\n',
  status: ' M src/Engine.java\n?? docs/new.md\n',
  diff: '3\t1\tsrc/Engine.java\n',
}

function world($: Parameters<Parameters<typeof test>[1]>[0], on: Parameters<Parameters<typeof test>[1]>[1], options: { mockStore?: boolean } = {}) {
  const clock = mock.clock(on)
  if (options.mockStore !== false) mock.store(on)
  on('command.register', () => ({ value: { command: 'x' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: 'C:\\proj' }))
  on('fs.stat', () => ({ value: { kind: 'file', size: 1, mtimeMs: 1, isLink: false } }))
  on('process.run', (_, e) => ({
    value: { exitCode: 0, stdout: GIT[String(e.argv[4])] ?? '', stderr: '', isStdoutTruncated: false },
  }))
  // The app's own events, answered plainly beneath the mod.
  on('classic.PermissionDenied', () => ({}))
  on('classic.StopFailure', () => ({}))
  // A commit answers the way git does, so the bank can count its files.
  on('tool.call', (_, e) => ({
    result: 'ok',
    text: String((e as { command?: string }).command ?? '').startsWith('git commit') ? '[main 1a2b3c4] msg\n 2 files changed, 3 insertions(+)' : 'ok',
  }))

  return clock
}

test('the scene shows quests, rooms and the Coding level, and an edit earns XP', async ($, on) => {
  const clock = world($, on)
  await $.session.start({ cwd: 'C:\\proj', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'mcp__ccd_turn__update_plan', items: [{ content: 'Ship the rooms', status: 'in_progress' }] } as never)
  await $.tool.call({ tool: 'Edit', file_path: 'C:\\proj\\src\\Engine.java', old_string: 'a', new_string: 'b\nc' })
  await clock.advance(1000)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('\n')
  // 10 for the edit and 4 per line written: 18 xp, still level 1.
  expect(texts).toContain('Coding 1')
  expect(texts).toContain('18 xp')
  const scene = await ui.find({ type: 'Svg' })
  const svg = String((scene as unknown as { props: { source: string } }).props.source)
  expect(svg).toContain('Guild Hall')
  // The quest is on the Guild Hall's board, in the scene.
  expect(svg).toContain('Ship the rooms')
  expect(texts).toContain('Claude')
  expect(svg).toContain('Engine.java')
  expect(svg).toContain('>+18<')
  await ui.unmount()
})

test('thinking, creating, teleporting and banking all show in the scene', async ($, on) => {
  const clock = world($, on)
  on('fs.exists', () => ({ value: false }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  await $.session.start({ cwd: 'C:\\proj', surface: 'desktop', isInteractive: true })
  await $.prompt.submit({ text: 'go' } as never)
  const svgOf = async () => {
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
    const svg = String(((await ui.find({ type: 'Svg' })) as unknown as { props: { source: string } }).props.source)
    const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('\n')
    await ui.unmount()

    return { svg, texts }
  }

  // Thinking before touching anything: the wizard studies the quest board, reading.
  expect((await svgOf()).svg).toContain('c0f3')

  // Creating a file: its desk wears a NEW tag (the ✚ bubble shows only while it is written).
  await $.tool.call({ tool: 'Write', file_path: 'C:\\proj\\src\\Fresh.java', content: 'x\ny\nz' })
  const made = await svgOf()
  expect(made.svg).toContain('>NEW<')
  // Git knows nothing of it yet, so its desk counts the lines the Write wrote,
  // and the header adds them to the session's total.
  expect(made.svg).toContain('<tspan fill="#73c991">+3</tspan>')
  expect(made.texts).toContain('+3')

  // A subagent's first file: it teleports in.
  await $.tool.call({ tool: 'Edit', file_path: 'C:\\proj\\src\\Engine.java', old_string: 'a', new_string: 'b', agentId: 'sub-1' } as never)
  expect((await svgOf()).svg).toContain('#9cc8ff')

  // A commit banks its files.
  await $.tool.call({ tool: 'Bash', command: 'git commit -m "msg"' } as never)
  const banked = await svgOf()
  expect(banked.svg).toContain('2 banked')
  expect(banked.texts).toContain('2 edits · 2 files · 0 quests · 2 banked')
  await clock.advance(10)
})

test('seven background reviewers appear in the expanded crew roster', async ($, on) => {
  world($, on)
  const reviewers = Array.from({ length: 7 }, (_, i) => ({
    id: `review-${i + 1}`,
    name: `Sonnet 5.5 reviewer ${i + 1}`,
    type: 'reviewer',
    description: `Review file ${i + 1}`,
    status: 'running',
  }))
  on('agent.list', () => ({ value: reviewers }))
  await $.session.start({ cwd: 'C:\\proj', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const roster = await ui.find({ key: 'crew-toggle' })
  expect(roster?.props.label).toBe('Background crew · 7 running · 7 tracked ▴')
  expect((await ui.findAll({ type: 'Svg' })).length).toBe(8)
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('\n')
  for (let i = 1; i <= 7; i++) {
    expect(texts).toContain(`Sonnet 5.5 reviewer ${i}`)
    expect(texts).toContain(`Review file ${i}`)
  }
  await ui.unmount()

  const terminal = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const terminalTexts = (await terminal.findAll({ type: 'Text' })).map(t => t.text).join('\n')
  expect((await terminal.findAll({ type: 'Svg' })).length).toBe(0)
  for (let i = 1; i <= 7; i++) expect(terminalTexts).toContain(`Sonnet 5.5 reviewer ${i}`)
  await terminal.unmount()
})

test('a failed tool lands a hitsplat; a test run trains at the dummy and splats pass or fail', async ($, on) => {
  world($, on)
  await $.session.start({ cwd: 'C:\\proj', surface: 'desktop', isInteractive: true })
  const svgOf = async () => {
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
    const svg = String(((await ui.find({ type: 'Svg' })) as unknown as { props: { source: string } }).props.source)
    await ui.unmount()

    return svg
  }

  // The world's tool.call answers every test run with a pass.
  await $.tool.call({ tool: 'Bash', command: 'npm test' } as never)
  const passed = await svgOf()
  expect(passed).toContain('#2f8f2f')
  expect(passed).toContain('✓')
})

test('commands run in the Terminal; a refusal splats; the usage limit is out of run energy', async ($, on) => {
  world($, on)
  on('prompt.submit', (_, e) => ({ text: e.text }))
  await $.session.start({ cwd: 'C:\\proj', surface: 'desktop', isInteractive: true })
  await $.prompt.submit({ text: 'go' } as never)
  const shown = async () => {
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
    const svg = String(((await ui.find({ type: 'Svg' })) as unknown as { props: { source: string } }).props.source)
    const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('\n')
    await ui.unmount()

    return { svg, texts }
  }

  // A shell command: the Terminal room appears, and the header says what ran.
  await $.tool.call({ tool: 'Bash', command: 'git status --short' } as never)
  const ran = await shown()
  expect(ran.svg).toContain('>Terminal<')
  expect(ran.texts).toContain('Terminal · $ git status')

  // A refused tool: a ✋ splat.
  await $.classic.PermissionDenied({ tool_name: 'Bash', tool_input: {}, tool_use_id: 't1', reason: 'denied' } as never)
  expect((await shown()).svg).toContain('✋')

  // The usage limit: out of run energy, in the scene and the header.
  await $.classic.StopFailure({ error: 'rate_limit' } as never)
  const spent = await shown()
  expect(spent.svg).toContain('Out of run energy')
  expect(spent.texts).toContain('Out of run energy · usage limit reached')
})

test('XP saved by another copy of the mod carries over', async ($, on) => {
  world($, on)
  on('env.get', (_, e) => ({ value: String(e.name) === 'CLAUDE_CONFIG_DIR' ? 'C:/home/.claude' : undefined }))
  on('fs.list', () => ({ value: [{ name: 'task-board_inline-1.json', kind: 'file', size: 12, mtimeMs: 1, isLink: false }] }))
  on('fs.read', () => ({ value: '{"xp":9262}' }))
  await $.session.start({ cwd: 'C:\\proj', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('\n')
  expect(texts).toContain('9,262 xp')
  await ui.unmount()
})

test('a failed XP save preserves the successful edit and its XP feedback', async ($, on) => {
  world($, on, { mockStore: false })
  let saves = 0
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => {
    saves++
    return { deny: 'The store is read-only' }
  })
  await $.session.start({ cwd: 'C:\\proj', surface: 'desktop', isInteractive: true })
  const ran = await $.tool.call({ tool: 'Edit', file_path: 'C:\\proj\\src\\Engine.java', old_string: 'a', new_string: 'b\nc' })
  expect(ran.result).toBe('ok')
  expect(saves).toBe(4)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('\n')
  expect(texts).toContain('18 xp')
  expect(texts).toContain('1 edit')
  const scene = await ui.find({ type: 'Svg' })
  expect(String((scene as unknown as { props: { source: string } }).props.source)).toContain('>+18<')
  await ui.unmount()
})

test('board help lists its commands without changing the plan setting', async ($, on) => {
  world($, on)
  await $.session.start({ cwd: 'C:\\proj', surface: 'desktop', isInteractive: true })
  const help = await $.command.run({ command: 'board', args: 'help' })
  expect(help.text).toContain('/board sound')
  expect(help.text).toContain('/board plan')
  expect((await $.command.run({ command: 'board', args: '?' })).text).toBe(help.text)
  expect((await $.command.run({ command: 'board', args: 'plan' })).text).toBe("Claude's steps show under each message again.")
})

test('between turns, Claude rests at the Inn and dozes off later', async ($, on) => {
  world($, on)
  await $.session.start({ cwd: 'C:\\proj', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const scene = await ui.find({ type: 'Svg' })
  const svg = String((scene as unknown as { props: { source: string } }).props.source)
  expect(svg).toContain('>Inn<')
  expect(svg).toContain('ready for a quest')
  expect(svg).toContain('begin="120s"')
  await ui.unmount()
})

test('every surface shows the quests: on the Guild Hall board, or as text in a terminal', async ($, on) => {
  world($, on)
  await $.session.start({ cwd: 'C:\\proj', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'mcp__ccd_turn__update_plan', items: [{ content: 'Ship the rooms', status: 'pending' }] } as never)
  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const scene = await ui.find({ type: 'Svg' })
    const shown = surface !== 'terminal' && scene
      ? String((scene as unknown as { props: { source: string } }).props.source)
      : (await ui.findAll({ type: 'Text' })).map(t => t.text).join('\n')
    expect(`${surface}: ${shown}`).toContain('Ship the rooms')
    await ui.unmount()
  }
})

test('the board text keeps the same on-screen size at any zoom', async ($, on) => {
  world($, on)
  await $.session.start({ cwd: 'C:\\proj', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'mcp__ccd_turn__update_plan', items: [{ content: 'Ship the rooms', status: 'pending' }] } as never)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const scene = (await ui.find({ type: 'Svg' })) as unknown as { props: { source: string; width: number } }
  const viewBox = Number(/viewBox="0 0 ([\d.]+)/.exec(scene.props.source)?.[1])
  const size = Number(/font-size="([\d.]+)" fill="#a31d1d"/.exec(scene.props.source)?.[1])
  // Units times zoom: 11px on screen.
  expect(Math.round(size * (scene.props.width / viewBox))).toBe(11)
  await ui.unmount()
})
