import { supabase } from '../../../lib/supabase'
import { decryptV2ForUser, getMyFingerprint, decodePhase1 } from '../hooks/useEncryption'
import { fetchEnvelopesForMessages } from './messages'
import type { ConversationListItem, DecryptedMessage, MemberSummary, Profile } from '../types'

export async function fetchConversations(userId: string): Promise<ConversationListItem[]> {
  const { data: memberRows, error } = await supabase
    .from('conversation_members')
    .select(
      `
      last_read_at,
      muted_until,
      conversations (
        id,
        name,
        type,
        avatar_url,
        updated_at,
        conversation_members (
          user_id,
          role,
          last_read_at,
          profiles (
            id,
            username,
            display_name,
            avatar_url,
            is_online,
            last_seen_at
          )
        )
      )
    `,
    )
    .eq('user_id', userId)
    .order('updated_at', { referencedTable: 'conversations', ascending: false })

  if (error) throw error
  if (!memberRows) return []

  const convIds = memberRows
    .map((r) => (r.conversations as unknown as { id: string } | null)?.id)
    .filter((id): id is string => !!id)

  const myLastReadAt: Record<string, string | null> = {}
  for (const row of memberRows) {
    const conv = row.conversations as unknown as { id: string } | null
    if (!conv) continue
    myLastReadAt[conv.id] = row.last_read_at
  }

  const lastMessages: Record<string, DecryptedMessage> = {}
  const unreadCounts: Record<string, number> = {}
  const v2Previews: Array<{ convId: string; messageId: string; content: string; iv: string | null }> = []

  if (convIds.length > 0) {
    const { data: msgs } = await supabase
      .from('messages')
      .select('id, conversation_id, sender_id, content, iv, enc_v, type, deleted_at, created_at')
      .in('conversation_id', convIds)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (msgs) {
      const seen = new Set<string>()
      for (const m of msgs as unknown as Array<{
        id: string
        conversation_id: string
        sender_id: string | null
        content: string
        iv: string | null
        enc_v: number | null
        type: string
        deleted_at: string | null
        created_at: string
      }>) {
        if (!seen.has(m.conversation_id)) {
          seen.add(m.conversation_id)

          let preview = m.content
          let decryptFailed = false

          if (m.enc_v === 2) {
            v2Previews.push({ convId: m.conversation_id, messageId: m.id, content: m.content, iv: m.iv })
            preview = ''
          } else if (!m.iv) {
            preview = decodePhase1(m.content)
          } else {
            preview = ''
            decryptFailed = true
          }

          lastMessages[m.conversation_id] = {
            id: m.id,
            conversationId: m.conversation_id,
            senderId: m.sender_id,
            content: preview,
            decryptFailed,
            type: m.type,
            mediaUrl: null,
            replyToId: null,
            threadId: null,
            editedAt: null,
            deletedAt: m.deleted_at,
            createdAt: m.created_at,
          }
        }

        if (m.sender_id !== userId) {
          const lastRead = myLastReadAt[m.conversation_id]
          if (!lastRead || new Date(m.created_at) > new Date(lastRead)) {
            unreadCounts[m.conversation_id] = (unreadCounts[m.conversation_id] ?? 0) + 1
          }
        }
      }
    }
  }

  if (v2Previews.length > 0) {
    try {
      const myFp = await getMyFingerprint(userId)
      const envelopes = myFp ? await fetchEnvelopesForMessages(v2Previews.map((p) => p.messageId), myFp) : new Map()
      await Promise.all(
        v2Previews.map(async (p) => {
          try {
            lastMessages[p.convId].content = await decryptV2ForUser(userId, envelopes.get(p.messageId), p.content, p.iv)
          } catch {
            lastMessages[p.convId].content = ''
            lastMessages[p.convId].decryptFailed = true
          }
        }),
      )
    } catch {
      for (const p of v2Previews) {
        lastMessages[p.convId].content = ''
        lastMessages[p.convId].decryptFailed = true
      }
    }
  }

  return memberRows
    .map((row) => {
      const conv = row.conversations as unknown as {
        id: string
        name: string | null
        type: string
        avatar_url: string | null
        updated_at: string
        conversation_members: Array<{
          user_id: string
          role: string
          last_read_at: string | null
          profiles: Profile | null
        }>
      } | null

      if (!conv) return null

      const members: MemberSummary[] = (conv.conversation_members ?? [])
        .filter((cm) => cm.profiles)
        .map((cm) => ({
          userId: cm.user_id,
          profile: cm.profiles!,
          isAdmin: cm.role === 'owner' || cm.role === 'admin',
          lastReadAt: cm.last_read_at,
        }))

      const lastMsg = lastMessages[conv.id] ?? null
      const unreadCount = unreadCounts[conv.id] ?? 0
      const rowMutedUntil = (row as unknown as { muted_until: string | null }).muted_until
      const isMuted = rowMutedUntil ? new Date(rowMutedUntil) > new Date() : false

      const item: ConversationListItem = {
        id: conv.id,
        name: conv.name,
        isGroup: conv.type === 'group',
        avatarUrl: conv.avatar_url,
        members,
        lastMessage: lastMsg,
        unreadCount,
        isMuted,
        mutedUntil: rowMutedUntil,
        updatedAt: conv.updated_at,
      }
      return item
    })
    .filter((c): c is ConversationListItem => c !== null)
    .sort((a, b) => {
      const aTime = a.lastMessage?.createdAt ?? a.updatedAt
      const bTime = b.lastMessage?.createdAt ?? b.updatedAt
      return new Date(bTime).getTime() - new Date(aTime).getTime()
    })
}

// Uses the find_or_create_direct_conversation RPC (security definer — bypasses RLS correctly).
export async function createDirectConversation(otherUserId: string): Promise<string> {
  const { data, error } = await supabase.rpc('find_or_create_direct_conversation', {
    target_user_id: otherUserId,
  })
  if (error) throw error
  return data as string
}

// null = mute forever (matches the schema's documented convention: null
// `muted_until` means not muted, so "forever" is encoded as a far-future
// timestamp rather than a literal null in the column itself).
const MUTE_FOREVER = new Date(8640000000000).toISOString()

export async function muteConversation(
  conversationId: string,
  userId: string,
  mutedUntil: Date | null,
): Promise<void> {
  const { error } = await supabase
    .from('conversation_members')
    .update({ muted_until: mutedUntil ? mutedUntil.toISOString() : MUTE_FOREVER })
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
  if (error) throw error
}

export async function searchUsers(query: string, currentUserId: string): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url, is_online, last_seen_at')
    .ilike('username', `%${query}%`)
    .neq('id', currentUserId)
    .limit(20)
  if (error) throw error
  return (data ?? []) as unknown as Profile[]
}

export async function markConversationRead(conversationId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('conversation_members')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
  if (error) throw error
}

export interface ConversationMeta {
  id: string
  name: string | null
  isGroup: boolean
  members: MemberSummary[]
}

// Single-conversation membership fetch — used by the chat screen to build the
// recipient list for encryption and to render a title/avatar without waiting
// on the full conversation list query.
export async function fetchConversationMeta(conversationId: string): Promise<ConversationMeta | null> {
  const { data, error } = await supabase
    .from('conversations')
    .select(
      `
      id,
      name,
      type,
      conversation_members (
        user_id,
        role,
        last_read_at,
        profiles ( id, username, display_name, avatar_url, is_online, last_seen_at )
      )
    `,
    )
    .eq('id', conversationId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  const row = data as unknown as {
    id: string
    name: string | null
    type: string
    conversation_members: Array<{ user_id: string; role: string; last_read_at: string | null; profiles: Profile | null }>
  }

  return {
    id: row.id,
    name: row.name,
    isGroup: row.type === 'group',
    members: (row.conversation_members ?? [])
      .filter((cm) => cm.profiles)
      .map((cm) => ({
        userId: cm.user_id,
        profile: cm.profiles!,
        isAdmin: cm.role === 'owner' || cm.role === 'admin',
        lastReadAt: cm.last_read_at,
      })),
  }
}

export async function deleteConversation(conversationId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('conversation_members')
    .delete()
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
  if (error) throw error
}
