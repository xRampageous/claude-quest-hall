import { expect, mock, test } from 'claude-code/testing'

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

type On = Parameters<Parameters<typeof test>[1]>[1]

const PANE = {
  plugin: 'task-board',
  component: 'Pane',
  requestId: 'task-board',
  surface: 'terminal',
  props: { title: 'Workbench', isFocused: false, bodyColumns: 43, placement: 'dock', scroll: { offset: 0, bodyRows: 36 }, view: {} },
} as const

function world(on: On, answer = (_tool: string): { result?: string; isError?: boolean; deny?: string } => ({ result: 'ok' })) {
  mock.clock(on)
  mock.store(on)
  const toasts: string[] = []
  const calls: string[] = []
  on('command.register', () => ({ value: { command: 'board' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: 'C:/proj' }))
  on('tool.call', (_, e) => {
    calls.push(e.tool)
    return answer(e.tool)
  })

  return { toasts, calls }
}

test('owned plans announce each completed step and count a finished quest once', async ($, on) => {
  const { toasts, calls } = world(on)
  await $.session.start({ cwd: 'C:/proj', surface: 'terminal', isInteractive: true })
  const tool = 'mcp__ccd_turn__update_plan'
  await $.tool.call({ tool, items: [{ content: 'Build', status: 'in_progress' }, { content: 'Test', status: 'pending' }] } as never)
  await $.tool.call({ tool, advance: true } as never)
  expect(toasts).toEqual(['Quest step complete: Build'])
  await $.tool.call({ tool, advance: true } as never)
  await $.tool.call({ tool, advance: true } as never)
  await $.tool.call({ tool: 'mcp__ccd_turn__wrap_up' } as never)
  expect(toasts).toEqual(['Quest step complete: Build', 'Congratulations, quest complete! (2 steps)'])
  expect(calls).toEqual(['mcp__ccd_turn__wrap_up'])

  const ui = await $.ui.mount(PANE)
  expect(await textsOf(ui as never)).toContain('1 quest')
  await ui.unmount()
})

test('step completion names the newly finished step even when later steps were already done', async ($, on) => {
  const { toasts } = world(on)
  await $.session.start({ cwd: 'C:/proj', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'board', args: 'plan' })
  const tool = 'mcp__ccd_turn__update_plan'
  await $.tool.call({ tool, items: [{ content: 'Build', status: 'pending' }, { content: 'Read', status: 'completed' }, { content: 'Test', status: 'pending' }] } as never)
  toasts.length = 0
  await $.tool.call({ tool, items: [{ content: 'Build', status: 'completed' }, { content: 'Read', status: 'completed' }, { content: 'Test', status: 'pending' }] } as never)
  expect(toasts).toEqual(['Quest step complete: Build'])
})

test('removing an unfinished step can finish a quest without increasing the completed count', async ($, on) => {
  const { toasts } = world(on)
  await $.session.start({ cwd: 'C:/proj', surface: 'terminal', isInteractive: true })
  const tool = 'mcp__ccd_turn__update_plan'
  await $.tool.call({ tool, items: [{ content: 'Build', status: 'completed' }, { content: 'Optional', status: 'pending' }] } as never)
  toasts.length = 0
  await $.tool.call({ tool, items: [{ content: 'Build', status: 'completed' }] } as never)
  await $.tool.call({ tool, items: [{ content: 'Build', status: 'completed' }] } as never)
  expect(toasts).toEqual(['Congratulations, quest complete! (1 step)'])
})

test('failed and denied native plan updates leave the board and quest count unchanged', async ($, on) => {
  let outcome: 'ok' | 'failed' | 'denied' = 'ok'
  const { toasts, calls } = world(on, () => outcome === 'denied' ? { deny: 'Refused in test' } : { result: outcome, isError: outcome === 'failed' })
  await $.session.start({ cwd: 'C:/proj', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'board', args: 'plan' })
  const tool = 'mcp__ccd_turn__update_plan'
  await $.tool.call({ tool, items: [{ content: 'Build', status: 'in_progress' }] } as never)
  for (const failed of ['failed', 'denied'] as const) {
    outcome = failed
    await $.tool.call({ tool, items: [{ content: 'Build', status: 'completed' }] } as never)
    const ui = await $.ui.mount(PANE)
    const text = await textsOf(ui as never)
    expect(text).toContain('Quests 0/1')
    expect(text).toContain('0 quests')
    await ui.unmount()
  }
  expect(toasts).toEqual([])
  outcome = 'ok'
  await $.tool.call({ tool, advance: true } as never)
  expect(toasts).toEqual(['Congratulations, quest complete! (1 step)'])
  expect(calls).toEqual([tool, tool, tool, tool])
})

test('TodoWrite and wrap_up count only successful quest completions', async ($, on) => {
  let fail = true
  const { toasts } = world(on, tool => ({ result: 'ok', isError: fail && tool.endsWith('wrap_up') }))
  await $.session.start({ cwd: 'C:/proj', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'TodoWrite', todos: [{ content: 'Build', status: 'in_progress' }] } as never)
  await $.tool.call({ tool: 'mcp__ccd_turn__wrap_up' } as never)
  expect(toasts).toEqual([])
  fail = false
  await $.tool.call({ tool: 'mcp__ccd_turn__wrap_up' } as never)
  await $.tool.call({ tool: 'mcp__ccd_turn__wrap_up' } as never)
  await $.tool.call({ tool: 'TodoWrite', todos: [{ content: 'Ship', status: 'in_progress' }] } as never)
  await $.tool.call({ tool: 'TodoWrite', todos: [{ content: 'Ship', status: 'completed' }] } as never)
  expect(toasts).toEqual(['Congratulations, quest complete! (1 step)', 'Congratulations, quest complete! (1 step)'])
  const ui = await $.ui.mount(PANE)
  expect(await textsOf(ui as never)).toContain('2 quests')
  await ui.unmount()
})

test('empty plans never earn a completed quest', async ($, on) => {
  const { toasts } = world(on)
  await $.session.start({ cwd: 'C:/proj', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'mcp__ccd_turn__update_plan', items: [] } as never)
  await $.tool.call({ tool: 'mcp__ccd_turn__wrap_up' } as never)
  expect(toasts).toEqual([])
})
