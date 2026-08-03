import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useAtom } from 'jotai'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LinearGradient } from 'expo-linear-gradient'
import { useAuth } from '../../src/features/auth/useAuth'
import { useConversationMeta } from '../../src/features/chat/hooks/useConversationMeta'
import { useMessages } from '../../src/features/chat/hooks/useMessages'
import { useRealtimeMessages } from '../../src/features/chat/hooks/useRealtimeMessages'
import { useEncryption, getMyFingerprint, decodePhase1 } from '../../src/features/chat/hooks/useEncryption'
import type { DbEnvelope } from '../../src/features/chat/hooks/useEncryption'
import { sendMessage, fetchEnvelopesForMessages, deleteMessage } from '../../src/features/chat/api/messages'
import { markConversationRead } from '../../src/features/chat/api/conversations'
import { replyToMessageIdAtom, commandFeedbackAtom } from '../../src/features/chat/store/chat.atoms'
import { parseCommand } from '../../src/features/commands/commandParser'
import { executeCommand } from '../../src/features/commands/commandRegistry'
import { MessageBubble, type ReplyPreview } from '../../src/features/chat/components/MessageBubble'
import { MessageActionSheet } from '../../src/features/chat/components/MessageActionSheet'
import { useAppTheme } from '../../src/theme/ThemeProvider'
import type { DbMessage, DecryptedMessage } from '../../src/features/chat/types'

// Content-pattern → panel tab, matching the deprecated iOS app's
// systemMessageTabMap. Case-insensitive substring match against the decoded
// system message text (e.g. "Task created: Buy milk").
const SYSTEM_MESSAGE_TAB_MAP: Array<[RegExp, string]> = [
  [/task created/i, 'Tasks'],
  [/note created/i, 'Notes'],
  [/reminder set/i, 'Reminders'],
  [/(event|plan) created/i, 'Events'],
  [/album created/i, 'Albums'],
  [/budget created/i, 'Budgets'],
]

function tabForSystemMessage(content: string): string | null {
  for (const [pattern, tab] of SYSTEM_MESSAGE_TAB_MAP) {
    if (pattern.test(content)) return tab
  }
  return null
}

// FlatList (inverted) row: either a message or a date-separator label,
// matching web's DateSeparator between messages from different days.
type Row = { kind: 'message'; message: DecryptedMessage } | { kind: 'separator'; id: string; label: string }

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })
}

function buildRows(messages: DecryptedMessage[]): Row[] {
  // `messages` is newest-first (matches inverted FlatList order). Insert a
  // separator row right before the first message of an earlier day.
  const rows: Row[] = []
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    rows.push({ kind: 'message', message: msg })
    const next = messages[i + 1]
    if (!next || new Date(next.createdAt).toDateString() !== new Date(msg.createdAt).toDateString()) {
      rows.push({ kind: 'separator', id: `sep-${msg.id}`, label: dateLabel(msg.createdAt) })
    }
  }
  return rows
}

export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const conversationId = id ?? null
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { data: meta } = useConversationMeta(conversationId)
  const { data: pages, fetchNextPage, hasNextPage, isFetchingNextPage } = useMessages(conversationId)
  useRealtimeMessages(conversationId)
  const { encrypt, decryptV2 } = useEncryption(user?.id)
  const { colors, spacing, radii, type } = useAppTheme()

  const [replyId, setReplyId] = useAtom(replyToMessageIdAtom)
  const [feedback, setFeedback] = useAtom(commandFeedbackAtom)
  const [text, setText] = useState('')
  const [decrypted, setDecrypted] = useState<DecryptedMessage[]>([])
  const [actionTarget, setActionTarget] = useState<DecryptedMessage | null>(null)
  const decryptCacheRef = useRef(new Map<string, string | null>())

  const allDbMessages = useMemo<DbMessage[]>(() => pages?.pages.flatMap((p) => p.messages) ?? [], [pages])

  useEffect(() => {
    if (!conversationId || !user) return
    void markConversationRead(conversationId, user.id)
  }, [conversationId, user])

  // Decrypt whenever the underlying DB page changes — same pattern as web's
  // ChatView: batch-fetch this device's envelopes for not-yet-decrypted v2
  // messages, then decrypt each, caching by id+editedAt so re-renders don't
  // re-decrypt unchanged messages.
  useEffect(() => {
    if (!conversationId || !user || allDbMessages.length === 0) {
      setDecrypted([])
      return
    }
    let aborted = false

    async function run() {
      const cacheKeyFor = (m: DbMessage) => `${m.id}:${m.edited_at ?? ''}`
      const v2Ids = allDbMessages
        .filter((m) => m.enc_v === 2 && decryptCacheRef.current.get(cacheKeyFor(m)) === undefined)
        .map((m) => m.id)

      let envelopes = new Map<string, DbEnvelope>()
      if (v2Ids.length > 0) {
        try {
          const myFp = await getMyFingerprint(user!.id)
          if (myFp) envelopes = await fetchEnvelopesForMessages(v2Ids, myFp)
        } catch (err) {
          console.error('[yaply] chat envelope batch failed', err)
        }
      }
      if (aborted) return

      const results: DecryptedMessage[] = []
      for (const msg of allDbMessages) {
        const cacheKey = cacheKeyFor(msg)
        const cached = decryptCacheRef.current.get(cacheKey)
        let content = msg.content
        let decryptFailed = false

        if (cached !== undefined) {
          if (cached === null) {
            decryptFailed = true
            content = ''
          } else {
            content = cached
          }
        } else if (msg.enc_v === 2) {
          try {
            content = await decryptV2(envelopes.get(msg.id), msg.content, msg.iv)
            decryptCacheRef.current.set(cacheKey, content)
          } catch {
            decryptFailed = true
            content = ''
            decryptCacheRef.current.set(cacheKey, null)
          }
        } else if (!msg.iv) {
          content = decodePhase1(msg.content)
          decryptCacheRef.current.set(cacheKey, content)
        } else {
          decryptFailed = true
          content = ''
          decryptCacheRef.current.set(cacheKey, null)
        }

        results.push({
          id: msg.id,
          conversationId: msg.conversation_id,
          senderId: msg.sender_id,
          content,
          decryptFailed,
          type: msg.type,
          mediaUrl: msg.media_url,
          replyToId: msg.reply_to_id,
          threadId: msg.thread_id,
          editedAt: msg.edited_at,
          deletedAt: msg.deleted_at,
          createdAt: msg.created_at,
          senderProfile: msg.sender_profile,
        })
      }
      if (!aborted) setDecrypted(results)
    }

    void run()
    return () => {
      aborted = true
    }
  }, [allDbMessages, conversationId, user, decryptV2])

  const byId = useMemo(() => new Map(decrypted.map((m) => [m.id, m])), [decrypted])
  const rows = useMemo(() => buildRows(decrypted), [decrypted])

  const replyPreviewFor = useCallback(
    (message: DecryptedMessage): ReplyPreview | null => {
      if (!message.replyToId) return null
      const target = byId.get(message.replyToId)
      if (!target) return null
      const senderLabel = target.senderId === user?.id ? 'You' : target.senderProfile?.display_name || target.senderProfile?.username || 'Someone'
      return {
        senderLabel,
        text: target.decryptFailed ? "Couldn't decrypt" : target.content,
        isDeleted: !!target.deletedAt,
      }
    },
    [byId, user?.id],
  )

  const scrollToMessage = useCallback((_messageId: string) => {
    // No-op for now: FlatList scroll-to-index for an inverted list with
    // variable-height rows needs getItemLayout or a measured-offsets map to
    // be reliable. Tapping a reply quote is a visual affordance for now;
    // wiring the actual scroll is a follow-up, not a design-pass concern.
  }, [])

  const sendMutation = useMutation({
    mutationFn: sendMessage,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['messages', conversationId] })
      void queryClient.invalidateQueries({ queryKey: ['conversations'] })
    },
  })

  const onSend = useCallback(async () => {
    const body = text.trim()
    if (!body || !conversationId || !user || !meta) return
    setText('')
    setFeedback(null)

    // Slash commands never enter the conversation as a message — parse and
    // dispatch instead of encrypting/sending. Feedback is shown only to the
    // typing user (commandFeedbackAtom), never written to the DB.
    const parsed = parseCommand(body)
    if (parsed) {
      try {
        await executeCommand(parsed.name, {
          conversationId,
          userId: user.id,
          args: parsed.args,
          showLocalFeedback: setFeedback,
        })
      } catch (err) {
        console.error('[yaply] command failed', err)
        setFeedback('Something went wrong running that command.')
      }
      return
    }

    const capturedReplyId = replyId
    setReplyId(null)

    const memberIds = meta.members.map((m) => m.userId)
    const result = await encrypt(memberIds, body)
    sendMutation.mutate(
      result.mode === 'v2'
        ? {
            conversationId,
            senderId: user.id,
            content: result.content,
            iv: result.iv,
            envelopes: result.envelopes,
            type: 'text',
            replyToId: capturedReplyId,
          }
        : { conversationId, senderId: user.id, content: result.content, iv: null, type: 'text', replyToId: capturedReplyId },
    )
  }, [text, conversationId, user, meta, replyId, encrypt, sendMutation, setReplyId, setFeedback])

  const closeActionSheet = useCallback(() => setActionTarget(null), [])

  const onDeleteConfirmed = useCallback(async () => {
    if (!actionTarget) return
    const messageId = actionTarget.id
    setActionTarget(null)
    await deleteMessage(messageId)
    void queryClient.invalidateQueries({ queryKey: ['messages', conversationId] })
  }, [actionTarget, conversationId, queryClient])

  const onReplyFromSheet = useCallback(() => {
    if (!actionTarget) return
    setReplyId(actionTarget.id)
    setActionTarget(null)
  }, [actionTarget, setReplyId])

  const title = meta?.name || meta?.members.find((m) => m.userId !== user?.id)?.profile.display_name || 'Chat'

  const s = styles(colors, spacing, radii, type)

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={s.back}>‹ Back</Text>
        </Pressable>
        <Text style={s.title} numberOfLines={1}>
          {title}
        </Text>
        <Pressable style={s.panelButton} onPress={() => conversationId && router.push(`/panel/${conversationId}`)}>
          <Text style={s.panelButtonText}>Tools</Text>
        </Pressable>
      </View>

      <FlatList
        style={s.list}
        data={rows}
        inverted
        keyExtractor={(row) => (row.kind === 'message' ? row.message.id : row.id)}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) void fetchNextPage()
        }}
        onEndReachedThreshold={0.3}
        renderItem={({ item: row }) => {
          if (row.kind === 'separator') {
            return (
              <View style={s.dateSeparator}>
                <View style={s.dateSeparatorRule} />
                <Text style={s.dateSeparatorLabel}>{row.label}</Text>
                <View style={s.dateSeparatorRule} />
              </View>
            )
          }

          const item = row.message
          const isMine = item.senderId === user?.id
          const isSystem = item.type === 'system'

          if (isSystem) {
            // System messages auto-destruct 7 days after insert (set at
            // insert time, read here — no client-side scheduling). Expired
            // ones are hidden silently, never shown as "message deleted".
            const expired = !!item.deletedAt && new Date(item.deletedAt) <= new Date()
            if (expired) return null
            const linkTab = !item.decryptFailed ? tabForSystemMessage(item.content) : null
            return (
              <View style={s.systemRow}>
                <View style={s.systemPill}>
                  <Text style={s.systemText}>{item.decryptFailed ? "Couldn't decrypt" : item.content}</Text>
                  {linkTab && (
                    <Pressable onPress={() => conversationId && router.push(`/panel/${conversationId}?tab=${linkTab}`)}>
                      <Text style={s.systemLink}>Open {linkTab} →</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            )
          }

          if (item.deletedAt) {
            return (
              <View style={[s.bubbleRow, isMine ? s.bubbleRowMine : s.bubbleRowTheirs]}>
                <View style={s.bubbleDeleted}>
                  <Text style={s.bubbleTextDeleted}>Message deleted</Text>
                </View>
              </View>
            )
          }

          return (
            <MessageBubble
              message={item}
              isMine={isMine}
              replyPreview={replyPreviewFor(item)}
              onReply={() => setReplyId(item.id)}
              onLongPress={() => setActionTarget(item)}
              onPressReplyQuote={() => item.replyToId && scrollToMessage(item.replyToId)}
            />
          )
        }}
      />

      <MessageActionSheet
        visible={!!actionTarget}
        canDelete={actionTarget?.senderId === user?.id}
        onReply={onReplyFromSheet}
        onDelete={onDeleteConfirmed}
        onClose={closeActionSheet}
      />

      {feedback && (
        <View style={s.replyStrip}>
          <Text style={s.replyText}>{feedback}</Text>
          <Pressable onPress={() => setFeedback(null)}>
            <Text style={s.replyCancel}>✕</Text>
          </Pressable>
        </View>
      )}

      {replyId && (
        <View style={s.replyStrip}>
          <Text style={s.replyText} numberOfLines={1}>
            Replying to a message
          </Text>
          <Pressable onPress={() => setReplyId(null)}>
            <Text style={s.replyCancel}>✕</Text>
          </Pressable>
        </View>
      )}

      <View style={s.composer}>
        <TextInput
          style={s.input}
          placeholder="Message…"
          placeholderTextColor={colors.textSubtle}
          value={text}
          onChangeText={setText}
          multiline
        />
        <Pressable onPress={onSend} disabled={!text.trim()} style={({ pressed }) => [{ opacity: !text.trim() ? 0.4 : pressed ? 0.85 : 1 }]}>
          <LinearGradient colors={[colors.primary, colors.primaryDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.sendButton}>
            <Text style={s.sendButtonText}>➤</Text>
          </LinearGradient>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  )
}

type Colors = ReturnType<typeof useAppTheme>['colors']
type Spacing = ReturnType<typeof useAppTheme>['spacing']
type Radii = ReturnType<typeof useAppTheme>['radii']
type Type = ReturnType<typeof useAppTheme>['type']

const styles = (colors: Colors, spacing: Spacing, radii: Radii, type: Type) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 56,
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.sm,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    back: { color: colors.primaryText, width: 50 },
    panelButton: { width: 50, alignItems: 'flex-end' },
    panelButtonText: { color: colors.primaryText, ...type.label },
    title: { color: colors.text, ...type.heading, fontSize: 16, flex: 1, textAlign: 'center' },
    list: { flex: 1, paddingHorizontal: spacing.sm },
    dateSeparator: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginVertical: spacing.md },
    dateSeparatorRule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
    dateSeparatorLabel: { color: colors.textSubtle, ...type.caption, fontWeight: '600', paddingHorizontal: spacing.xs },
    bubbleRow: { marginVertical: 3, flexDirection: 'row' },
    bubbleRowMine: { justifyContent: 'flex-end' },
    bubbleRowTheirs: { justifyContent: 'flex-start' },
    bubbleDeleted: {
      maxWidth: '65%',
      borderRadius: radii.bubble,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.tint,
    },
    bubbleTextDeleted: { color: colors.textSubtle, ...type.body, fontStyle: 'italic' },
    systemRow: { alignItems: 'center', marginVertical: 6 },
    systemPill: {
      alignItems: 'center',
      backgroundColor: colors.tint,
      borderRadius: radii.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: 6,
      maxWidth: 320,
    },
    systemText: { color: colors.textMuted, ...type.caption, textAlign: 'center' },
    systemLink: { color: colors.primaryText, ...type.caption, fontWeight: '700', marginTop: 2, textDecorationLine: 'underline' },
    replyStrip: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.primaryTint,
      marginHorizontal: spacing.sm,
      borderRadius: radii.sm,
      borderLeftWidth: 2,
      borderLeftColor: colors.primary,
      paddingHorizontal: spacing.sm,
      paddingVertical: 6,
    },
    replyText: { color: colors.textMuted, flex: 1 },
    replyCancel: { color: colors.textMuted, paddingHorizontal: 8 },
    composer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      padding: spacing.sm,
      gap: spacing.sm,
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    input: {
      flex: 1,
      backgroundColor: colors.tint,
      color: colors.text,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.bubble,
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
      maxHeight: 120,
    },
    sendButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    sendButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  })
