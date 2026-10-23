export type HavenEvent = { seq: number; kind: 'read' | 'research' | 'edit' | 'quest' | 'check' | 'commit' | 'crew'; at: number; count: number; xp: number; skill?: 'crafting' | 'research' | 'verification' | 'teamwork'; skillXp?: number; questOutcome?: 'completed' | 'cancelled' | 'replaced' | 'blocked'; file?: string; ok?: boolean; role?: string; ref?: string }
export type HavenTotals = { edits: number; quests: number; checks: number; commits: number; crew: number; xp: number }
export type HavenSkills = { crafting: number; research: number; verification: number; teamwork: number }
export type HavenLandmark = { id: string; at: number; runId: string; evidence: string; file?: string; ref?: string }
export type HavenRun = { version: 2; id: string; root: string; name: string; startedAt: number; updatedAt: number; seq: number; totals: HavenTotals; skills: HavenSkills; events: HavenEvent[]; places: string[] }
export type HavenVisitRecap = { at: number; edits: number; files: string[]; passed: number; failed: number; quests: number; crew: number; xp: number; unlocks: string[]; evidence: string[] }
export type HavenState = {
  profile: { name: string; hero: 'wizard' | 'knight' | 'ranger' | 'smith'; view: 'world' | 'focus' | 'journal' | 'skills' | 'settings'; motion: boolean; size: 'auto' | 'comfortable' | 'large'; title?: string }
  run: HavenRun
  history: HavenRun[]
  landmarks: HavenLandmark[]
  skills: HavenSkills
  siteSlots: Record<string, number>
  journalIndex: number
  replay?: { runId: string; index: number; finished: boolean }
  saveError: boolean
  lastRecap?: HavenVisitRecap
}
export type Step = { text: string; status: 'pending' | 'in_progress' | 'completed' }
// A file an agent worked on this turn: `read` only looked, `edit` changed it.
// `isNew`: the file did not exist before this turn wrote it.
// `add` and `del`: lines its edits this turn wrote and replaced, for files git does not count.
export type Touch = { path: string; agent: number; isActive: boolean; edits: number; kind: 'read' | 'edit'; isNew?: boolean; add?: number; del?: number }
// What one agent did last: the tool, the file it was on, and when.
// `mode`: what it is doing besides reading or editing a file: reading the work orders
// (at the Patchboard), running a command or an outside tool (in the Terminal), or running
// tests, searching the web or applying changes (at its desk).
// `isApply`: a batch of changes applied at once (MultiEdit, git apply, patch).
export type Activity = { tool: string; file: string; at: number; isActive: boolean; isEdit: boolean; isNew?: boolean; isApply?: boolean; mode?: 'test' | 'web' | 'apply' | 'quests' | 'shell' | 'background' }
export type CrewAgent = { id: string; index: number; name: string; type: string; description: string; status: 'running' | 'completed' | 'failed' | 'killed' }
// A hitsplat over a character: a failed tool's damage, or a test run's pass or fail.
export type Splat = { kind: 'hit' | 'pass' | 'fail' | 'denied'; damage: number; at: number }
// A turn that died on an error: which one (rate_limit is the usage limit) and when.
export type Failure = { error: string; at: number }
// One file's git state: Modified, Added, Deleted, Renamed or Untracked.
export type Change = { code: 'M' | 'A' | 'D' | 'R' | 'U'; add: number; del: number; mtimeMs: number }
// XP an edit earned, floated up from its desk for a moment.
export type Drop = { xp: number; at: number }
// The last commit's files, when, and all files banked this session.
export type Bank = { files: number; at: number; total: number }
export type Stats = { edits: number; files: string[]; quests: number; checks?: number; crew?: number; xp?: number; add?: number; del?: number }

declare module 'claude-code' {
  interface PluginState {
    'task-board': {
      haven: HavenState | null
      steps: Step[]
      files: Touch[]
      agents: string[]
      // Current session's agent roster, including background tasks.
      crewAgents: CrewAgent[]
      crewExpanded: boolean
      changes: Record<string, Change>
      // Keyed by agent index ("0" is Claude).
      activity: Record<string, Activity>
      isTurn: boolean
      // Bumped every few seconds during a turn so idle and waiting agents show.
      pulse: number
      // Coding XP across sessions, and the latest drop per file path.
      xp: number
      drops: Record<string, Drop>
      // The level just reached and when, for the banner over the Patchboard.
      levelUp: { level: number; at: number } | null
      // When each subagent first appeared, for its teleport puff.
      spawns: Record<string, number>
      bank: Bank | null
      stats: Stats
      splats: Record<string, Splat>
      // When each finished subagent left, for its teleport out.
      departs: Record<string, number>
      // When the conversation was last compacted, for the deposit-all puff.
      compactAt: number | null
      // When each agent was asked for permission, until its tool goes on.
      asking: Record<string, number>
      // Each subagent's job, by its loop id: its type and what it was sent to do.
      jobs: Record<string, string>
      // When the current turn began, for the header's timer.
      turnStart: number
      failure: Failure | null
      // When you last stopped a turn, for the wizard's bubble at the Inn.
      stoppedAt: number | null
    }
  }
}
