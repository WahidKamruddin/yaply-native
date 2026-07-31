// Pure parsing logic — no DOM/browser dependency, ported verbatim from web's
// src/features/commands/commandParser.ts.
export interface ParsedCommand {
  name: string
  rawArgs: string
  args: string[]
}

export function parseCommand(input: string): ParsedCommand | null {
  if (!input.startsWith('/')) return null
  const trimmed = input.slice(1).trim()
  const [rawName, ...rest] = trimmed.split(' ')
  if (!rawName) return null
  const name = rawName.toLowerCase()
  const rawArgs = rest.join(' ')
  const args = rest.filter(Boolean)
  return { name, rawArgs, args }
}

export function parseDuration(str: string): Date | null {
  if (str === 'forever') return null
  const match = str.match(/^(\d+)([mhdw])$/)
  if (!match) return null
  const [, num, unit] = match
  const n = parseInt(num!, 10)
  const now = Date.now()
  const ms =
    unit === 'm' ? n * 60_000 : unit === 'h' ? n * 3_600_000 : unit === 'd' ? n * 86_400_000 : n * 604_800_000
  return new Date(now + ms)
}

// Parses MM/DD/YYYY (or 'today'/'tomorrow') + HH:MM or HH:MMam/pm into a Date
export function parseDateTimeArgs(dateStr: string, timeStr: string): Date | null {
  const lower = dateStr.toLowerCase().trim()
  const now = new Date()
  let m: number, d: number, y: number

  if (lower === 'today') {
    m = now.getMonth() + 1
    d = now.getDate()
    y = now.getFullYear()
  } else if (lower === 'tomorrow') {
    const t = new Date(now)
    t.setDate(t.getDate() + 1)
    m = t.getMonth() + 1
    d = t.getDate()
    y = t.getFullYear()
  } else {
    const dateMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (!dateMatch) return null
    m = parseInt(dateMatch[1]!, 10)
    d = parseInt(dateMatch[2]!, 10)
    y = parseInt(dateMatch[3]!, 10)
    if (m < 1 || m > 12 || d < 1 || d > 31) return null
  }

  const timeMatch = timeStr.toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?(am|pm)?$/)
  if (!timeMatch) return null
  const [, h, min, ampm] = timeMatch
  let hour = parseInt(h!, 10)
  const minute = parseInt(min ?? '0', 10)
  if (ampm === 'pm' && hour < 12) hour += 12
  if (ampm === 'am' && hour === 12) hour = 0
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null

  const result = new Date(y, m - 1, d, hour, minute, 0, 0)
  if (isNaN(result.getTime())) return null
  return result
}
