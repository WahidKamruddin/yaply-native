import { atom } from 'jotai'

// UI state (not server data) — mirrors web's src/features/chat/store/chat.atoms.ts.
export const activeConversationIdAtom = atom<string | null>(null)
export const replyToMessageIdAtom = atom<string | null>(null)
