import { atom } from 'jotai'

// UI state (not server data) — mirrors web's src/features/chat/store/chat.atoms.ts.
export const activeConversationIdAtom = atom<string | null>(null)
export const replyToMessageIdAtom = atom<string | null>(null)
// Slash command feedback (help text, errors, confirmations) — shown only to
// the typing user, never written to the DB.
export const commandFeedbackAtom = atom<string | null>(null)
