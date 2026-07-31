import { useCallback, useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { router } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../src/features/auth/useAuth'
import { useConversations } from '../../src/features/chat/hooks/useConversations'
import { createDirectConversation, searchUsers } from '../../src/features/chat/api/conversations'
import { supabase } from '../../src/lib/supabase'
import { theme } from '../../src/theme'
import type { ConversationListItem, Profile } from '../../src/features/chat/types'

function conversationTitle(item: ConversationListItem, myUserId: string): string {
  if (item.name) return item.name
  const other = item.members.find((m) => m.userId !== myUserId)
  return other?.profile.display_name || other?.profile.username || 'Conversation'
}

export default function ConversationList() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { data: conversations, isLoading } = useConversations(user?.id)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Profile[]>([])
  const [searching, setSearching] = useState(false)

  const onSearchChange = useCallback(
    async (text: string) => {
      setQuery(text)
      if (!user || text.trim().length < 2) {
        setResults([])
        return
      }
      setSearching(true)
      try {
        const found = await searchUsers(text.trim(), user.id)
        setResults(found)
      } finally {
        setSearching(false)
      }
    },
    [user],
  )

  const openDm = useCallback(
    async (otherUserId: string) => {
      const conversationId = await createDirectConversation(otherUserId)
      setQuery('')
      setResults([])
      void queryClient.invalidateQueries({ queryKey: ['conversations'] })
      router.push(`/chat/${conversationId}`)
    },
    [queryClient],
  )

  if (!user) return null

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>yaply</Text>
        <Pressable onPress={() => supabase.auth.signOut()}>
          <Text style={styles.signOut}>Sign out</Text>
        </Pressable>
      </View>

      <TextInput
        style={styles.search}
        placeholder="Search people…"
        placeholderTextColor={theme.colors.textMuted}
        value={query}
        onChangeText={onSearchChange}
        autoCapitalize="none"
      />

      {results.length > 0 && (
        <View style={styles.results}>
          {results.map((p) => (
            <Pressable key={p.id} style={styles.resultRow} onPress={() => openDm(p.id)}>
              <Text style={styles.resultName}>{p.display_name || p.username}</Text>
              <Text style={styles.resultUsername}>@{p.username}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {searching && <Text style={styles.muted}>Searching…</Text>}

      <FlatList
        data={conversations ?? []}
        keyExtractor={(item) => item.id}
        refreshing={isLoading}
        onRefresh={() => queryClient.invalidateQueries({ queryKey: ['conversations', user.id] })}
        ListEmptyComponent={!isLoading ? <Text style={styles.muted}>No conversations yet — search for someone above.</Text> : null}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => router.push(`/chat/${item.id}`)}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{conversationTitle(item, user.id).charAt(0).toUpperCase()}</Text>
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>{conversationTitle(item, user.id)}</Text>
              <Text style={styles.rowPreview} numberOfLines={1}>
                {item.lastMessage?.decryptFailed
                  ? "Couldn't decrypt this message"
                  : item.lastMessage?.content || 'No messages yet'}
              </Text>
            </View>
            {item.unreadCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{item.unreadCount}</Text>
              </View>
            )}
          </Pressable>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background, paddingTop: 60 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  headerTitle: { color: theme.colors.text, fontSize: 24, fontWeight: '700' },
  signOut: { color: theme.colors.textMuted },
  search: {
    marginHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    color: theme.colors.text,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  results: { marginHorizontal: theme.spacing.md, marginBottom: theme.spacing.sm },
  resultRow: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.sm,
    marginBottom: 4,
  },
  resultName: { color: theme.colors.text, fontWeight: '600' },
  resultUsername: { color: theme.colors.textMuted, fontSize: 12 },
  muted: { color: theme.colors.textMuted, textAlign: 'center', marginTop: theme.spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.bubbleOwn,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: theme.colors.text, fontWeight: '700' },
  rowBody: { flex: 1 },
  rowTitle: { color: theme.colors.text, fontWeight: '600', fontSize: 16 },
  rowPreview: { color: theme.colors.textMuted, marginTop: 2 },
  badge: {
    backgroundColor: theme.colors.accent,
    borderRadius: 12,
    minWidth: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: { color: theme.colors.text, fontSize: 12, fontWeight: '700' },
})
