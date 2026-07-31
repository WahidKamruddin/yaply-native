import { COMMANDS } from '../commands'

const VALID_TYPES = new Set(COMMANDS.filter((c) => c.deferred).map((c) => c.name))

// Web opens a creation modal here; yaply-native doesn't have Tasks/Notes/
// Albums/Budgets/Events built yet (Phase 5), so this only validates the
// command and returns an honest "not available yet" message instead of
// silently doing nothing.
export function createHandler(typeStr: string | undefined): string {
  const type = typeStr?.toLowerCase()
  if (!type || !VALID_TYPES.has(type)) {
    return `Unknown type "${typeStr ?? ''}". Use: task, poll, event, note, album, budget, plan`
  }
  return `/${type} isn't available yet in this app — coming in a later update.`
}
