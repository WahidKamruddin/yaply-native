import { COMMANDS } from '../commands'

export function helpHandler(): string {
  const lines = ['Available commands:', '']
  for (const cmd of COMMANDS) {
    lines.push(`${cmd.usage} — ${cmd.description}${cmd.deferred ? ' (coming soon)' : ''}`)
  }
  return lines.join('\n')
}
