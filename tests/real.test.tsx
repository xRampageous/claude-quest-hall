import { expect, mock, test } from 'claude-code/testing'

const PANE = {
  plugin: 'task-board',
  component: 'Pane',
  requestId: 'task-board',
  props: { title: 'Workbench', isFocused: false, bodyColumns: 40, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

// 352 changes, like the repo that once made the app refuse the pane.
const files = Array.from({ length: 352 }, (_, i) => `src/${['main/java/com/example/engine', 'simulation/data', 'simulation/cases', 'dev/java'][i % 4]}/File${i}.java`)
const GIT: Record<string, string> = {
  'rev-parse': 'C:/proj\n',
  status: files.map(f => ` M ${f}\n`).join('') + '?? docs/new file.md\n',
  diff: files.map((f, i) => `${i}\t${i % 5}\t${f}\n`).join(''),
}

test('draws with a big real-looking state', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  on('command.register', () => ({ value: { command: 'x' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: 'C:/proj' }))
  on('fs.stat', () => ({ value: { kind: 'file', size: 1, mtimeMs: 1, isLink: false } }))
  on('process.run', (_, e) => ({ value: { exitCode: 0, stdout: GIT[String(e.argv[4])] ?? '', stderr: '', isStdoutTruncated: false } }))
  on('tool.call', () => ({ result: 'ok' }))

  await $.session.start({ cwd: 'C:/proj', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'mcp__ccd_turn__update_plan', items: [{ content: 'A', status: 'in_progress' }, { content: 'B', status: 'pending' }] } as never)
  // Forty files edited in one turn: the size that once made the app refuse the drawing.
  for (let i = 0; i < 40; i++) {
    await $.tool.call({ tool: 'Edit', file_path: `C:/proj/src/main/java/com/example/engine/File${i}.java`, old_string: 'a', new_string: 'b' })
  }
  await clock.advance(1000)

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
    expect(texts.length).toBeGreaterThan(5)
    if (surface === 'desktop') {
      const scene = await ui.find({ type: 'Svg' })
      const svg = String((scene as unknown as { props: { source: string } }).props.source)
      const height = Number(/viewBox="0 0 [\d.]+ ([\d.]+)/.exec(svg)?.[1])
      expect(svg).toContain('PATCH TRAIL')
      expect(height).toBeLessThanOrEqual(360)
    }
    // Well under what the app accepts for one drawing.
    expect(JSON.stringify(await ui.drawn()).length).toBeLessThan(100_000)
    await ui.unmount()
  }
})
