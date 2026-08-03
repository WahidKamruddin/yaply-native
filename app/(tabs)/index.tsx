import { useCallback, useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { router } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { Feather } from '@expo/vector-icons'
import { useAuth } from '../../src/features/auth/useAuth'
import { useConversations } from '../../src/features/chat/hooks/useConversations'
import { createDirectConversation, searchUsers } from '../../src/features/chat/api/conversations'
import { supabase } from '../../src/lib/supabase'
import { useAppTheme } from '../../src/theme/ThemeProvider'
import { Avatar } from '../../src/components/Avatar'
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
  const { colors, spacing, radii, type, mode, toggle } = useAppTheme()

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

  const s = styles(colors, spacing, radii, type)

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.headerTitle}>yaply</Text>
        <View style={s.headerActions}>
          <Pressable style={s.iconButton} onPress={toggle}>
            <Feather name={mode === 'dark' ? 'sun' : 'moon'} size={18} color={colors.textSubtle} />
          </Pressable>
          <Pressable onPress={() => supabase.auth.signOut()}>
            <Text style={s.signOut}>Sign out</Text>
          </Pressable>
        </View>
      </View>

      <TextInput
        style={s.search}
        placeholder="Search people…"
        placeholderTextColor={colors.textSubtle}
        value={query}
        onChangeText={onSearchChange}
        autoCapitalize="none"
      />

      {results.length > 0 && (
        <View style={s.results}>
          {results.map((p) => (
            <Pressable key={p.id} style={s.resultRow} onPress={() => openDm(p.id)}>
              <Avatar uri={p.avatar_url} size={32} />
              <View>
                <Text style={s.resultName}>{p.display_name || p.username}</Text>
                <Text style={s.resultUsername}>@{p.username}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}
      {searching && <Text style={s.muted}>Searching…</Text>}

      <FlatList
        data={conversations ?? []}
        keyExtractor={(item) => item.id}
        refreshing={isLoading}
        onRefresh={() => queryClient.invalidateQueries({ queryKey: ['conversations', user.id] })}
        ListEmptyComponent={!isLoading ? <Text style={s.muted}>No conversations yet — search for someone above.</Text> : null}
        renderItem={({ item }) => {
          const title = conversationTitle(item, user.id)
          const unread = item.unreadCount > 0
          const other = !item.isGroup ? item.members.find((m) => m.userId !== user.id) : undefined
          return (
            <Pressable style={s.row} onPress={() => router.push(`/chat/${item.id}`)}>
              <Avatar uri={other?.profile.avatar_url} size={46} online={other ? other.profile.is_online : undefined} />
              <View style={s.rowBody}>
                <Text style={[s.rowTitle, unread && s.rowTitleUnread]}>{title}</Text>
                <Text style={[s.rowPreview, unread && s.rowPreviewUnread]} numberOfLines={1}>
                  {item.lastMessage?.decryptFailed
                    ? "Couldn't decrypt this message"
                    : item.lastMessage?.content || 'No messages yet'}
                </Text>
              </View>
              {unread && (
                <View style={s.badge}>
                  <Text style={s.badgeText}>{item.unreadCount}</Text>
                </View>
              )}
            </Pressable>
          )
        }}
      />
    </View>
  )
}

type Colors = ReturnType<typeof useAppTheme>['colors']
type Spacing = ReturnType<typeof useAppTheme>['spacing']
type Radii = ReturnType<typeof useAppTheme>['radii']
type Type = ReturnType<typeof useAppTheme>['type']

const styles = (colors: Colors, spacing: Spacing, radii: Radii, type: Type) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.surface, paddingTop: 60 },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      marginBottom: spacing.sm,
    },
    headerTitle: { color: colors.text, ...type.title },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    iconButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.tint,
    },
    signOut: { color: colors.textMuted },
    search: {
      marginHorizontal: spacing.md,
      backgroundColor: colors.tint,
      color: colors.text,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      marginBottom: spacing.sm,
    },
    results: { marginHorizontal: spacing.md, marginBottom: spacing.sm },
    resultRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.sm,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      borderRadius: radii.sm,
      marginBottom: 4,
    },
    resultName: { color: colors.text, fontWeight: '600' },
    resultUsername: { color: colors.textMuted, fontSize: 12 },
    muted: { color: colors.textSubtle, textAlign: 'center', marginTop: spacing.lg },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      gap: spacing.sm,
    },
    rowBody: { flex: 1 },
    rowTitle: { color: colors.text, ...type.label, fontSize: 16 },
    rowTitleUnread: { fontWeight: '800' },
    rowPreview: { color: colors.textMuted, ...type.caption, marginTop: 2 },
    rowPreviewUnread: { color: colors.text, fontWeight: '600' },
    badge: {
      backgroundColor: colors.primary,
      borderRadius: radii.pill,
      minWidth: 22,
      height: 22,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 6,
    },
    badgeText: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
  })
