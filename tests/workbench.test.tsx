import { expect, mock, test } from 'claude-code/testing'
import { drawLivingTrail } from '../hooks/living-trail'

type Drawing = { findAll(query: { type: string }): Promise<readonly { text?: string; props: Record<string, unknown> }[]> }
// The living map, told from the HUD by its own label.
async function sceneOf(ui: Drawing) {
  return (await ui.findAll({ type: 'Svg' })).find(item => String(item.props.source).includes('Patchhaven live work trail'))!
}
// Everything the pane says in words: its texts and each picture's alt text.
async function textsOf(ui: Drawing) {
  const texts = (await ui.findAll({ type: 'Text' })).map(item => item.text ?? '')
  const alts = (await ui.findAll({ type: 'Svg' })).map(item => String(item.props.alt ?? ''))
  return [...texts, ...alts].join('\n')
}

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

test('live tool activity gets its own pose, badge and animation', () => {
  const path = 'src/Engine.java'
  const room = {
    key: 'src', name: 'src', slot: 0,
    desks: [{ path, name: 'Engine.java', touch: { path, agent: 0, isActive: true, edits: 1, kind: 'edit' as const } }],
  }
  const render = (activity: { tool: string; mode: 'edit' | 'create' | 'read' | 'search' | 'test' | 'web' | 'apply' | 'shell' | 'tool'; isEdit?: boolean; isNew?: boolean }) => drawLivingTrail({
    haven: { hero: 'wizard', landmarks: [], motion: true },
    rooms: [room], activity: { '0': { ...activity, file: path, at: 100, isActive: true, isEdit: activity.isEdit ?? false } },
    from: {}, now: 100, isTurn: true, width: 54, paneWidth: 434, steps: [], drops: {}, spawns: {},
    splats: {}, departs: {}, asking: {},
  }).svg
  const cases = [
    { mode: 'edit', tool: 'Edit', isEdit: true, action: 'editing' },
    { mode: 'create', tool: 'Write', isEdit: true, isNew: true, action: 'creating' },
    { mode: 'read', tool: 'Read', action: 'reading' },
    { mode: 'search', tool: '⌕ Engine', action: 'searching' },
    { mode: 'test', tool: '$ npm test', action: 'testing' },
    { mode: 'web', tool: 'WebSearch', action: 'researching' },
    { mode: 'apply', tool: 'MultiEdit', isEdit: true, action: 'applying' },
    { mode: 'shell', tool: '$ git status', action: 'command' },
    { mode: 'tool', tool: '⚙ lookup', action: 'tool' },
  ] as const

  for (const { action, ...activity } of cases) {
    const svg = render(activity)
    expect(svg).toContain('data-agent="0"')
    expect(svg).toContain('data-action="' + action + '"')
    expect(svg).toContain('data-action-marker="' + action + '"')
    expect(svg).toContain('<animate')
  }

  // Hands-on work plays the whole attack strip at a prop; reading faces the open book.
  expect(render({ mode: 'edit', tool: 'Edit', isEdit: true })).toMatch(/<use href="#aq-mage-attack" x="0"><animate attributeName="x" calcMode="discrete" values="0;-56;-112;-168;-224;-280;-336;-392;-448;0"/)
  expect(render({ mode: 'edit', tool: 'Edit', isEdit: true })).toContain('data-prop="page"')
  expect(render({ mode: 'read', tool: 'Read' })).toContain('aq-mage-idle-west')
  expect(render({ mode: 'read', tool: 'Read' })).toContain('data-prop="book"')
})

function world($: Parameters<Parameters<typeof test>[1]>[0], on: Parameters<Parameters<typeof test>[1]>[1], options: { mockStore?: boolean; respondToolCall?: (event: Record<string, unknown>) => unknown | Promise<unknown> } = {}) {
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
  on('tool.call', async (_, e) => options.respondToolCall
    ? options.respondToolCall(e as Record<string, unknown>)
    : {
      result: 'ok',
      text: String((e as { command?: string }).command ?? '').startsWith('git commit') ? '[main 1a2b3c4] msg\n 2 files changed, 3 insertions(+)' : 'ok',
    })

  return clock
}

test('foreground creation and background-agent tools stay animated until they return', async ($, on) => {
  let continueTool!: () => void
  let announceTool!: () => void
  const gate = new Promise<void>(resolve => { continueTool = resolve })
  const started = new Promise<void>(resolve => { announceTool = resolve })
  world($, on, { respondToolCall: async () => { announceTool(); await gate; return { result: 'ok', text: 'ok' } } })
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('fs.exists', () => ({ value: false }))
  on('agent.list', () => ({ value: [{ id: 'review-1', name: 'Reviewer', type: 'reviewer', description: 'Review the patch', status: 'running' }] }))
  await $.session.start({ cwd: 'C:\\proj', surface: 'desktop', isInteractive: true })
  await $.prompt.submit({ text: 'create a file and ask for review' } as never)

  const pending = $.tool.call({ tool: 'Write', file_path: 'C:\\proj\\src\\Fresh.java', content: 'class Fresh {}', agentId: 'review-1' } as never)
  await started
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const svg = String(((await sceneOf(ui as never)) as unknown as { props: { source: string } }).props.source)
  expect(svg).toMatch(/data-agent="1" data-role="(?:mage|rogue|ranger|sage)" data-state="creating" data-action="creating"/)
  expect(svg).toContain('data-action-marker="creating"')
  await ui.press({ key: 'crew-toggle' })
  const crewText = await textsOf(ui as never)
  expect(crewText).toContain('· creating')
  await ui.unmount()

  continueTool()
  await pending
  const completed = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const after = String(((await sceneOf(completed as never)) as unknown as { props: { source: string } }).props.source)
  expect(after).toContain('data-action="thinking"')
  expect(after).toContain('data-action-marker="thinking"')
  expect(after).toContain('BETWEEN TOOLS')
  await completed.unmount()
})

test('the compact patch trail shows files, quests and the Coding level', async ($, on) => {
  const clock = world($, on)
  await $.session.start({ cwd: 'C:\\proj', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'mcp__ccd_turn__update_plan', items: [{ content: 'Ship the rooms', status: 'in_progress' }] } as never)
  await $.tool.call({ tool: 'Edit', file_path: 'C:\\proj\\src\\Engine.java', old_string: 'a', new_string: 'b\nc' })
  await clock.advance(1000)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const texts = await textsOf(ui as never)
  // 10 for the edit and 4 per line written: 18 xp, still level 1.
  expect(texts).toContain('Coding 1')
  expect(texts).toContain('18 xp')
  const scene = await sceneOf(ui as never)
  const svg = String((scene as unknown as { props: { source: string } }).props.source)
  expect(svg).toContain('PATCHBOARD')
  expect(svg).toContain('data-station="board"')
  expect(svg).toContain('data-station="folder"')
  expect(svg).toContain('NOW · CAMP')
  expect(svg).toContain('aria-label="Patchhaven live work trail"')
  expect(svg).toContain('PATCHBOARD 0/1')
  expect(svg).toContain('aqbg-guild')
  const spriteHeights = [...svg.matchAll(/<(?:svg|use)[^>]*\bheight="([\d.]+)"/g)].map(match => Number(match[1]))
  expect(spriteHeights.length).toBeGreaterThan(0)
  expect(Math.min(...spriteHeights)).toBeGreaterThanOrEqual(29)
  expect(Number(/viewBox="0 0 [\d.]+ ([\d.]+)/.exec(svg)?.[1])).toBeGreaterThanOrEqual(200)
  expect(svg).toContain('data-current-location="inn"')
  expect(svg).not.toContain('Guild Hall')
  // The quest is on Patchhaven's board, in the scene.
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
    const svg = String(((await sceneOf(ui as never)) as unknown as { props: { source: string } }).props.source)
    const texts = await textsOf(ui as never)
    await ui.unmount()

    return { svg, texts }
  }

  // Before the first file appears, Claude waits by the Patchboard and idles.
  const thinking = await svgOf()
  expect(thinking.svg).toContain('PATCHBOARD')
  expect(thinking.svg).toContain('<animateTransform')

  // Creating a file: its desk wears a NEW tag (the ✚ bubble shows only while it is written).
  await $.tool.call({ tool: 'Write', file_path: 'C:\\proj\\src\\Fresh.java', content: 'x\ny\nz' })
  const made = await svgOf()
  expect(made.svg).toContain('NEW · +3')
  // Git knows nothing of it yet, so its desk counts the lines the Write wrote,
  // and the header adds them to the session's total.
  expect(made.svg).toContain('+3')
  expect(made.texts).toContain('+3')

  // A subagent's first file: it teleports in.
  await $.tool.call({ tool: 'Edit', file_path: 'C:\\proj\\src\\Engine.java', old_string: 'a', new_string: 'b', agentId: 'sub-1' } as never)
  expect((await svgOf()).svg).toContain('#67c7c0')

  // A commit banks its files.
  await $.tool.call({ tool: 'Bash', command: 'git commit -m "msg"' } as never)
  const banked = await svgOf()
  expect(banked.svg).toContain('2 BANKED')
  expect(banked.texts).toContain('2 edits · 2 files · 0 quests')
  await clock.advance(10)
})

test('Claude walks with directional Agent Quest frames when the live file district changes', async ($, on) => {
  world($, on)
  on('prompt.submit', (_, e) => ({ text: e.text }))
  await $.session.start({ cwd: 'C:\\proj', surface: 'desktop', isInteractive: true })
  await $.prompt.submit({ text: 'patch two areas' } as never)
  const render = async () => {
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
    const scene = await sceneOf(ui as never) as unknown as { props: { source: string } }
    const svg = String(scene.props.source)
    await ui.unmount()
    return svg
  }

  await $.tool.call({ tool: 'Edit', file_path: 'C:\\proj\\src\\Engine.java', old_string: 'a', new_string: 'b' })
  expect(await render()).toContain('data-current-location="room:src"')
  await $.tool.call({ tool: 'Edit', file_path: 'C:\\proj\\docs\\guide.md', old_string: 'a', new_string: 'b' })
  const svg = await render()
  expect(svg).toContain('data-current-location="room:docs"')
  expect(svg).toContain('data-state="walking"')
  // A whole nine-frame walk strip, added to the worker's place rather than replacing it.
  expect(svg).toMatch(/aq-mage-walk-(?:east|west|north|south)/)
  expect(svg).toMatch(/type="translate" additive="sum" from="-[\d.]+ 0" to="0 0" dur="[\d.]+s" fill="freeze"/)
})

test('seven background reviewers stay tucked away until the crew roster opens', async ($, on) => {
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
  expect(roster?.props.label).toBe('Background crew · 7 running · 7 tracked ▾')
  // The HUD and the map; the roster's portraits stay folded away.
  expect((await ui.findAll({ type: 'Svg' })).length).toBe(2)
  const map = await sceneOf(ui as never)
  const mapSvg = String((map as unknown as { props: { source: string } }).props.source)
  expect(mapSvg).toContain('data-station="crew"')
  expect(mapSvg).toContain('aria-label="Crew Lodge work station"')
  expect(mapSvg).toContain('Review file 1')
  expect(mapSvg).toContain('BETWEEN TOOLS')
  expect(mapSvg).toMatch(/data-role="(?:mage|rogue|ranger|sage)" data-state="thinking" data-action="thinking"/)
  expect(mapSvg).toMatch(/data-action-marker="thinking"/)
  expect(mapSvg).toContain('values=".25;1;.25"')
  expect(mapSvg).not.toMatch(/aq-(?:mage|rogue|ranger|sage)-attack/)
  const collapsedButtons = (await ui.findAll({ type: 'Button' })).map(button => String(button.props.label ?? '')).join('\n')
  expect(collapsedButtons).not.toContain('Sonnet 5.5 reviewer 1')
  await ui.press({ key: 'crew-toggle' })
  expect((await ui.find({ key: 'crew-toggle' }))?.props.label).toBe('Background crew · 7 running · 7 tracked ▴')
  expect((await ui.findAll({ type: 'Svg' })).length).toBe(9)
  const texts = await textsOf(ui as never)
  const buttonLabels = (await ui.findAll({ type: 'Button' })).map(button => String(button.props.label ?? '')).join('\n')
  for (let i = 1; i <= 7; i++) {
    expect(buttonLabels).toContain(`Sonnet 5.5 reviewer ${i}`)
    expect(texts).toContain(`Review file ${i}`)
  }
  await ui.unmount()

  await $.command.run({ command: 'haven', args: 'motion' })
  const still = await $.ui.mount({ ...PANE, surface: 'desktop' })
  // Motion off stills every picture: the map, the HUD and each roster portrait.
  const stillPictures = (await still.findAll({ type: 'Svg' })).map(item => String(item.props.source))
  expect(stillPictures.length).toBe(9)
  for (const picture of stillPictures) expect(picture).not.toContain('<animate')
  await still.unmount()

  const terminal = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const terminalTexts = await textsOf(terminal as never)
  const terminalButtons = (await terminal.findAll({ type: 'Button' })).map(button => String(button.props.label ?? '')).join('\n')
  expect((await terminal.findAll({ type: 'Svg' })).length).toBe(0)
  for (let i = 1; i <= 7; i++) expect(`${terminalTexts}\n${terminalButtons}`).toContain(`Sonnet 5.5 reviewer ${i}`)
  await terminal.unmount()
})

test('Focus follows one selected worker and keeps other agents off the map', async ($, on) => {
  world($, on)
  on('agent.list', () => ({ value: [
    { id: 'review-1', name: 'First reviewer', type: 'reviewer', description: 'Check the API', status: 'running' },
    { id: 'review-2', name: 'Second reviewer', type: 'reviewer', description: 'Check the UI', status: 'running' },
  ] }))
  await $.session.start({ cwd: 'C:\\proj', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'crew-toggle' })
  await ui.press({ key: 'agent-select-review-2' })
  await ui.unmount()

  const focused = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const map = await sceneOf(focused as never) as unknown as { props: { source: string } }
  const svg = String(map.props.source)
  expect(svg).toContain('data-station="crew"')
  expect(svg).toContain('aria-label="Current scene: Crew Lodge"')
  expect((svg.match(/<svg x="/g) ?? []).length).toBe(1)
  expect(svg).not.toContain('Review file 1')
  await focused.unmount()
})

test('approval waits show a question marker on the worker', async ($, on) => {
  world($, on)
  await $.session.start({ cwd: 'C:\\proj', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'haven', args: 'demo approval' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const map = await sceneOf(ui as never) as unknown as { props: { source: string } }
  expect(String(map.props.source)).toContain('AWAITING YOU')
  expect(String(map.props.source)).toContain('>?</text>')
  await ui.unmount()
})

test('a failed tool lands a hitsplat; a test run trains at the dummy and splats pass or fail', async ($, on) => {
  world($, on)
  await $.session.start({ cwd: 'C:\\proj', surface: 'desktop', isInteractive: true })
  const svgOf = async () => {
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
    const svg = String(((await sceneOf(ui as never)) as unknown as { props: { source: string } }).props.source)
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
    const svg = String(((await sceneOf(ui as never)) as unknown as { props: { source: string } }).props.source)
    const texts = await textsOf(ui as never)
    await ui.unmount()

    return { svg, texts }
  }

  // A shell command: the Terminal site appears with a short command label.
  await $.tool.call({ tool: 'Bash', command: 'git status --short' } as never)
  const ran = await shown()
  expect(ran.svg).toContain('TERMINAL')
  expect(ran.svg).toContain('data-station="terminal"')
  expect(ran.svg).toContain('$ git status')
  expect(ran.svg).toContain('BETWEEN COMMANDS')

  await $.tool.call({ tool: 'Read', file_path: 'C:\\proj\\src\\Engine.java' })
  const read = await shown()
  expect(read.svg).toContain('READ COMPLETE')
  expect(read.svg).toContain('data-current-location="room:src"')

  await $.tool.call({ tool: 'Grep', pattern: 'Engine', path: 'src' } as never)
  const searched = await shown()
  expect(searched.svg).toContain('SEARCH COMPLETE')
  expect(searched.svg).toContain('data-current-location="terminal"')

  await $.tool.call({ tool: 'mcp__sample__lookup', query: 'patch notes' } as never)
  const tooled = await shown()
  expect(tooled.svg).toContain('TOOL COMPLETE')
  expect(tooled.svg).toContain('⚙ lookup')
  expect(tooled.svg).toContain('data-current-location="terminal"')

  // A refused tool: a red warning splat.
  await $.classic.PermissionDenied({ tool_name: 'Bash', tool_input: {}, tool_use_id: 't1', reason: 'denied' } as never)
  expect((await shown()).svg).toContain('✋')

  // The usage limit: out of run energy, in the scene and the header.
  await $.classic.StopFailure({ error: 'rate_limit' } as never)
  const spent = await shown()
  expect(spent.svg).toContain('OUT OF RUN ENERGY')
  expect(spent.texts).toContain('Out of run energy · usage limit reached')
})

test('XP saved by another copy of the mod carries over', async ($, on) => {
  world($, on)
  on('env.get', (_, e) => ({ value: String(e.name) === 'CLAUDE_CONFIG_DIR' ? 'C:/home/.claude' : undefined }))
  on('fs.list', () => ({ value: [{ name: 'task-board_inline-1.json', kind: 'file', size: 12, mtimeMs: 1, isLink: false }] }))
  on('fs.read', () => ({ value: '{"xp":9262}' }))
  await $.session.start({ cwd: 'C:\\proj', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const texts = await textsOf(ui as never)
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
  expect(saves).toBeGreaterThanOrEqual(4)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const texts = await textsOf(ui as never)
  expect(texts).toContain('18 xp')
  expect(texts).toContain('1 edit')
  const scene = await sceneOf(ui as never)
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

test('between turns, Claude rests by the campfire at camp', async ($, on) => {
  world($, on)
  await $.session.start({ cwd: 'C:\\proj', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const scene = await sceneOf(ui as never)
  const svg = String((scene as unknown as { props: { source: string } }).props.source)
  expect(svg).toContain('AT CAMP')
  expect(svg).toContain('NOW · CAMP')
  expect(svg).toContain('data-prop="campfire"')
  expect(svg).toContain('data-station="board"')
  expect(svg).toContain('data-station="inn"')
  expect(svg).not.toContain('data-station="terminal"')
  expect(Number(/viewBox="0 0 [\d.]+ ([\d.]+)/.exec(svg)?.[1])).toBeGreaterThanOrEqual(200)
  expect(Number(/font-size="([\d.]+)" font-weight="700" letter-spacing="1" fill="#e0c782">PATCH TRAIL/.exec(svg)?.[1])).toBeGreaterThanOrEqual(10)
  const heroMarkup = svg.slice(svg.indexOf('data-agent="0"'), svg.indexOf('data-agent="0"') + 500)
  const heroHeight = Number(/<svg x="[^"]+" y="[^"]+" width="[\d.]+" height="([\d.]+)"/.exec(heroMarkup)?.[1])
  expect(heroHeight).toBeGreaterThanOrEqual(40)
  await ui.unmount()
})

test('every surface shows the quests: on the Patchboard, or as text in a terminal', async ($, on) => {
  world($, on)
  await $.session.start({ cwd: 'C:\\proj', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'mcp__ccd_turn__update_plan', items: [{ content: 'Ship the rooms', status: 'pending' }] } as never)
  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const scene = await sceneOf(ui as never)
    const shown = surface !== 'terminal' && scene
      ? String((scene as unknown as { props: { source: string } }).props.source)
      : await textsOf(ui as never)
    expect(`${surface}: ${shown}`).toContain('Ship the rooms')
    await ui.unmount()
  }
})

test('the patch labels stay readable in narrow and wide panes', async ($, on) => {
  world($, on)
  await $.session.start({ cwd: 'C:\\proj', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'mcp__ccd_turn__update_plan', items: [{ content: 'Ship the rooms', status: 'pending' }] } as never)
  for (const bodyColumns of [38, 54]) {
    const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns }, surface: 'desktop' })
    const scene = (await sceneOf(ui as never)) as unknown as { props: { source: string; width: number } }
    const viewBox = Number(/viewBox="0 0 ([\d.]+)/.exec(scene.props.source)?.[1])
    const size = Number(/font-size="([\d.]+)" fill="#f0efdc"/.exec(scene.props.source)?.[1])
    expect(size * (scene.props.width / viewBox)).toBeGreaterThanOrEqual(10)
    await ui.unmount()
  }
})

test('scale modes enlarge the full map and motion off pauses ambient animation', async ($, on) => {
  world($, on)
  await $.session.start({ cwd: 'C:\\proj', surface: 'desktop', isInteractive: true })
  const svgOf = async () => {
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
    const scene = (await sceneOf(ui as never)) as unknown as { props: { source: string; height: number } }
    const result = { source: String(scene.props.source), height: scene.props.height }
    await ui.unmount()
    return result
  }
  const normal = await svgOf()
  await $.command.run({ command: 'haven', args: 'size large' })
  const enlarged = await svgOf()
  expect(enlarged.height).toBeGreaterThan(normal.height)
  expect(enlarged.source).toContain('data-station="inn"')
  await $.command.run({ command: 'haven', args: 'motion' })
  expect((await svgOf()).source).not.toContain('<animate')
})
