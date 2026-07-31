// Hand-copied from web's packages/shared/src/constants/commands.ts — see
// CLAUDE.md's "Repo/package boundary" decision for why this isn't a
// cross-repo import.
export type CommandCategory = 'utility' | 'productivity' | 'social'

export interface CommandDefinition {
  name: string
  description: string
  usage: string
  example?: string
  category: CommandCategory
  // Not yet implemented in yaply-native — Phase 5 builds the underlying
  // feature (Tasks/Notes/Albums/Budgets/Events); the command exists but
  // currently only returns a "not available yet" local message.
  deferred?: boolean
}

export const COMMANDS: CommandDefinition[] = [
  { name: 'remind', description: 'Set a personal reminder', usage: '/remind [date] [time] [message]', example: '/remind 06/15/2026 3:00pm Call Alice', category: 'utility' },
  { name: 'mute', description: 'Mute this conversation', usage: '/mute [duration]', example: '/mute 2h', category: 'utility' },
  { name: 'task', description: 'Create a task', usage: '/task [title]', example: '/task Fix login bug', category: 'productivity', deferred: true },
  { name: 'note', description: 'Save a note', usage: '/note [title]', example: '/note Meeting recap', category: 'productivity', deferred: true },
  { name: 'album', description: 'Create a photo album', usage: '/album [name]', example: '/album Trip photos', category: 'productivity', deferred: true },
  { name: 'budget', description: 'Create a shared budget', usage: '/budget [name]', example: '/budget Road trip', category: 'productivity', deferred: true },
  { name: 'plan', description: 'Poll group availability', usage: '/plan [title]', example: '/plan Weekend hike', category: 'social', deferred: true },
  { name: 'poll', description: 'Create a poll', usage: '/poll [question]', example: '/poll Pizza or tacos?', category: 'social', deferred: true },
  { name: 'event', description: 'Schedule an event', usage: '/event [title]', example: '/event Team lunch Friday', category: 'social', deferred: true },
]
