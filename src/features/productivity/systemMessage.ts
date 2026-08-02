import { sendMessage } from '../chat/api/messages'
import { toBase64 } from '../../crypto/base64'

// The only thing written to a conversation on task/note/album/budget/event
// creation: a type='system' message, phase-1 encoded (iv=null, enc_v=null —
// system messages are never encrypted), auto-destructing after 7 days. Never
// the command feedback text itself — that stays local (commandFeedbackAtom).
export async function postSystemMessage(conversationId: string, senderId: string, text: string): Promise<void> {
  const content = toBase64(new TextEncoder().encode(text))
  const deletedAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  await sendMessage({ conversationId, senderId, content, iv: null, type: 'system', deletedAt })
}
