import { remindHandler } from './handlers/remindHandler'
import { muteHandler } from './handlers/muteHandler'
import { createHandler } from './handlers/createHandler'
import { helpHandler } from './handlers/helpHandler'

export interface CommandContext {
  conversationId: string
  userId: string
  args: string[]
  showLocalFeedback: (text: string) => void
}

const CREATE_COMMANDS = new Set(['task', 'poll', 'event', 'note', 'album', 'budget', 'plan'])

// Executes a parsed slash command. Feedback (help text, errors, confirmations)
// is shown only to the typing user via showLocalFeedback — never written to
// the DB. The only DB writes here are the entity itself (e.g. a reminders
// row) when a command legitimately creates something.
export async function executeCommand(name: string, ctx: CommandContext): Promise<void> {
  let result = ''

  if (name === 'help') {
    result = helpHandler()
  } else if (name === 'remind') {
    result = await remindHandler({ conversationId: ctx.conversationId, createdBy: ctx.userId, args: ctx.args })
  } else if (name === 'mute') {
    result = await muteHandler({ conversationId: ctx.conversationId, userId: ctx.userId, args: ctx.args })
  } else if (CREATE_COMMANDS.has(name)) {
    result = createHandler(name)
  } else {
    result = `Unknown command "/${name}". Type /help to see available commands.`
  }

  if (result) ctx.showLocalFeedback(result)
}
