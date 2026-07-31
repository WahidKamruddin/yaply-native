import { muteConversation } from '../../chat/api/conversations'
import { parseDuration } from '../commandParser'

export interface MuteArgs {
  conversationId: string
  userId: string
  args: string[]
}

export async function muteHandler({ conversationId, userId, args }: MuteArgs): Promise<string> {
  const durationStr = args[0] ?? 'forever'

  let until: Date | null = null
  if (durationStr !== 'forever') {
    until = parseDuration(durationStr)
    if (!until) {
      return `Couldn't parse "${durationStr}". Use a number + m/h/d/w (e.g. 30m, 2h, 1d, 1w) or "forever".`
    }
  }

  await muteConversation(conversationId, userId, until)
  return until ? `Conversation muted until ${until.toLocaleString()}` : 'Conversation muted indefinitely'
}
