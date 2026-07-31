import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useAtom } from 'jotai'
import { useMutation, useQueryClient } from '@tanstack/react-query'
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
import { theme } from '../../src/theme'
import type { DbMessage, DecryptedMessage } from '../../src/features/chat/types'

export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const conversationId = id ?? null
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { data: meta } = useConversationMeta(conversationId)
  const { data: pages, fetchNextPage, hasNextPage, isFetchingNextPage } = useMessages(conversationId)
  useRealtimeMessages(conversationId)
  const { encrypt, decryptV2 } = useEncryption(user?.id)

  const [replyId, setReplyId] = useAtom(replyToMessageIdAtom)
  const [feedback, setFeedback] = useAtom(commandFeedbackAtom)
  const [text, setText] = useState('')
  const [decrypted, setDecrypted] = useState<DecryptedMessage[]>([])
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

  const onLongPressMessage = useCallback(
    (msg: DecryptedMessage) => {
      if (msg.senderId !== user?.id) return
      Alert.alert('Delete message?', undefined, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteMessage(msg.id)
            void queryClient.invalidateQueries({ queryKey: ['messages', conversationId] })
          },
        },
      ])
    },
    [user, conversationId, queryClient],
  )

  const title = meta?.name || meta?.members.find((m) => m.userId !== user?.id)?.profile.display_name || 'Chat'

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <View style={{ width: 50 }} />
      </View>

      <FlatList
        style={styles.list}
        data={decrypted}
        inverted
        keyExtractor={(item) => item.id}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) void fetchNextPage()
        }}
        onEndReachedThreshold={0.3}
        renderItem={({ item }) => {
          const isMine = item.senderId === user?.id
          const isSystem = item.type === 'system'

          if (isSystem) {
            // System messages auto-destruct 7 days after insert (set at
            // insert time, read here — no client-side scheduling). Expired
            // ones are hidden silently, never shown as "message deleted".
            const expired = !!item.deletedAt && new Date(item.deletedAt) <= new Date()
            if (expired) return null
            return (
              <View style={styles.systemRow}>
                <Text style={styles.systemText}>{item.decryptFailed ? "Couldn't decrypt" : item.content}</Text>
              </View>
            )
          }

          if (item.deletedAt) {
            return (
              <View style={[styles.bubbleRow, isMine ? styles.bubbleRowMine : styles.bubbleRowTheirs]}>
                <View style={[styles.bubble, styles.bubbleDeleted]}>
                  <Text style={styles.bubbleTextDeleted}>Message deleted</Text>
                </View>
              </View>
            )
          }

          return (
            <Pressable
              onPress={() => setReplyId(item.id)}
              onLongPress={() => onLongPressMessage(item)}
              style={[styles.bubbleRow, isMine ? styles.bubbleRowMine : styles.bubbleRowTheirs]}
            >
              <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
                <Text style={styles.bubbleText}>{item.decryptFailed ? "Couldn't decrypt this message" : item.content}</Text>
              </View>
            </Pressable>
          )
        }}
      />

      {feedback && (
        <View style={styles.replyStrip}>
          <Text style={styles.replyText}>{feedback}</Text>
          <Pressable onPress={() => setFeedback(null)}>
            <Text style={styles.replyCancel}>✕</Text>
          </Pressable>
        </View>
      )}

      {replyId && (
        <View style={styles.replyStrip}>
          <Text style={styles.replyText} numberOfLines={1}>
            Replying to a message
          </Text>
          <Pressable onPress={() => setReplyId(null)}>
            <Text style={styles.replyCancel}>✕</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          placeholder="Message…"
          placeholderTextColor={theme.colors.textMuted}
          value={text}
          onChangeText={setText}
          multiline
        />
        <Pressable style={styles.sendButton} onPress={onSend} disabled={!text.trim()}>
          <Text style={styles.sendButtonText}>Send</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  back: { color: theme.colors.accent, width: 50 },
  title: { color: theme.colors.text, fontWeight: '700', fontSize: 16, flex: 1, textAlign: 'center' },
  list: { flex: 1, paddingHorizontal: theme.spacing.sm },
  bubbleRow: { marginVertical: 2, flexDirection: 'row' },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubbleRowTheirs: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '78%', borderRadius: theme.radii.bubble, paddingHorizontal: 14, paddingVertical: 8 },
  bubbleMine: { backgroundColor: theme.colors.bubbleOwn },
  bubbleTheirs: { backgroundColor: theme.colors.bubbleOther },
  bubbleDeleted: { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.colors.textMuted },
  bubbleText: { color: theme.colors.text, fontSize: 15 },
  bubbleTextDeleted: { color: theme.colors.textMuted, fontSize: 15, fontStyle: 'italic' },
  systemRow: { alignItems: 'center', marginVertical: 6 },
  systemText: { color: theme.colors.textMuted, fontSize: 12 },
  replyStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surface,
    marginHorizontal: theme.spacing.sm,
    borderRadius: theme.radii.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
  },
  replyText: { color: theme.colors.textMuted, flex: 1 },
  replyCancel: { color: theme.colors.textMuted, paddingHorizontal: 8 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  input: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    color: theme.colors.text,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 10,
    maxHeight: 120,
  },
  sendButton: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 10,
  },
  sendButtonText: { color: theme.colors.text, fontWeight: '700' },
})
