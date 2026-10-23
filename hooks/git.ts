import type { EngineInterface } from 'claude-code'

import type { Change } from '../types'

// Lowercased absolute path → its change: what the tree badges and counts.
export type Changes = Record<string, Change>

function run($: EngineInterface, cwd: string, args: string[]) {
  return $.process.run(['git', '--no-optional-locks', '-C', cwd, ...args], { timeoutMs: 10_000, env: { GIT_OPTIONAL_LOCKS: '0' } })
}

// `git status` letters folded to one per file, the way an editor badges them.
function letter(xy: string): Change['code'] {
  if (xy === '??') return 'U'
  if (xy.includes('D')) return 'D'
  if (xy.includes('R')) return 'R'
  if (xy.includes('A')) return 'A'

  return 'M'
}

// Every changed file under the repository with its +/- line counts; empty
// outside a repository or when git is missing.
export async function readChanges($: EngineInterface, cwd: string): Promise<Changes> {
  try {
    const top = await run($, cwd, ['rev-parse', '--show-toplevel'])
    if (top.exitCode !== 0) return {}
    const root = top.stdout.trim().replace(/\\/g, '/')
    const [status, numstat] = await Promise.all([
      run($, cwd, ['status', '--porcelain=v1', '-uall']),
      run($, cwd, ['diff', '--numstat', 'HEAD']),
    ])
    const changes: Changes = {}
    for (const line of status.stdout.split('\n')) {
      if (line.length < 4) continue
      const rel = line.slice(3).split(' -> ').pop()!.replace(/^"|"$/g, '')
      changes[`${root}/${rel}`.toLowerCase()] = { code: letter(line.slice(0, 2)), add: 0, del: 0, mtimeMs: 0 }
    }
    // When each changed file was last written, for the "3m ago" beside it.
    await Promise.all(
      Object.keys(changes)
        .slice(0, 300)
        .map(async path => {
          const stat = await $.fs.stat(path).catch(() => undefined)
          const change = changes[path]
          if (stat && change) change.mtimeMs = stat.mtimeMs
        }),
    )
    for (const line of numstat.stdout.split('\n')) {
      const [add, del, rel] = line.split('\t')
      const change = rel ? changes[`${root}/${rel}`.toLowerCase()] : undefined
      if (change) {
        change.add = Number(add) || 0
        change.del = Number(del) || 0
      }
    }

    return changes
  } catch {
    return {}
  }
}
