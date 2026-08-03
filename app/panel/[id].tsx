import { useCallback, useState } from 'react'
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useAuth } from '../../src/features/auth/useAuth'
import { ConfirmDialog } from '../../src/components/ConfirmDialog'
import { useAppTheme } from '../../src/theme/ThemeProvider'

import { useTasks, useCreateTask, useUpdateTaskStatus, useDeleteTask } from '../../src/features/productivity/hooks/useTasks'
import { useNotes, useCreateNote, useDeleteNote } from '../../src/features/productivity/hooks/useNotes'
import { useReminders, useDismissReminder } from '../../src/features/productivity/hooks/useReminders'
import { useEvents, useCreateEvent, useDeleteEvent, useEventRsvp, useSetRsvp } from '../../src/features/productivity/hooks/useEvents'
import { useAlbums, useCreateAlbum, useDeleteAlbum } from '../../src/features/productivity/hooks/useAlbums'
import { useBudgets, useCreateBudget, useDeleteBudget } from '../../src/features/productivity/hooks/useBudgets'
import { postSystemMessage } from '../../src/features/productivity/systemMessage'

const TABS = ['Tasks', 'Notes', 'Reminders', 'Events', 'Albums', 'Budgets'] as const
type Tab = (typeof TABS)[number]

export default function Panel() {
  const { id, tab: initialTab } = useLocalSearchParams<{ id: string; tab?: string }>()
  const conversationId = id ?? null
  const { user } = useAuth()
  const [tab, setTab] = useState<Tab>((TABS as readonly string[]).includes(initialTab ?? '') ? (initialTab as Tab) : 'Tasks')
  const themeCtx = useAppTheme()
  const s = styles(themeCtx)

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={s.back}>‹ Back</Text>
        </Pressable>
        <Text style={s.title}>Conversation Tools</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabBar} contentContainerStyle={s.tabBarContent}>
        {TABS.map((t) => (
          <Pressable key={t} style={[s.tabPill, tab === t && s.tabPillActive]} onPress={() => setTab(t)}>
            <Text style={[s.tabText, tab === t && s.tabTextActive]}>{t}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {!conversationId || !user ? null : tab === 'Tasks' ? (
        <TasksTab conversationId={conversationId} userId={user.id} />
      ) : tab === 'Notes' ? (
        <NotesTab conversationId={conversationId} userId={user.id} />
      ) : tab === 'Reminders' ? (
        <RemindersTab conversationId={conversationId} />
      ) : tab === 'Events' ? (
        <EventsTab conversationId={conversationId} userId={user.id} />
      ) : tab === 'Albums' ? (
        <AlbumsTab conversationId={conversationId} userId={user.id} />
      ) : (
        <BudgetsTab conversationId={conversationId} userId={user.id} />
      )}
    </View>
  )
}

// ─── Tasks ─────────────────────────────────────────────────────────────────

function TasksTab({ conversationId, userId }: { conversationId: string; userId: string }) {
  const s = styles(useAppTheme())
  const { data: tasks = [] } = useTasks(conversationId)
  const createTask = useCreateTask(conversationId)
  const updateStatus = useUpdateTaskStatus()
  const deleteTask = useDeleteTask()
  const [title, setTitle] = useState('')
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const onAdd = useCallback(() => {
    const t = title.trim()
    if (!t) return
    setTitle('')
    createTask.mutate(
      { title: t, createdBy: userId },
      { onSuccess: () => void postSystemMessage(conversationId, userId, `Task created: ${t}`) },
    )
  }, [title, userId, createTask, conversationId])

  return (
    <View style={s.body}>
      <FlatList
        data={tasks}
        keyExtractor={(t) => t.id}
        ListEmptyComponent={<Text style={s.empty}>No tasks yet.</Text>}
        renderItem={({ item }) => (
          <Pressable
            style={s.row}
            onPress={() => updateStatus.mutate({ taskId: item.id, status: item.status === 'done' ? 'todo' : 'done' })}
            onLongPress={() => setConfirmId(item.id)}
          >
            <View style={[s.checkbox, item.status === 'done' && s.checkboxChecked]} />
            <Text style={[s.rowText, item.status === 'done' && s.rowTextDone]}>{item.title}</Text>
          </Pressable>
        )}
      />
      <AddRow placeholder="New task…" value={title} onChangeText={setTitle} onSubmit={onAdd} />
      <ConfirmDialog
        visible={!!confirmId}
        title="Delete task?"
        onConfirm={() => {
          if (confirmId) deleteTask.mutate(confirmId)
          setConfirmId(null)
        }}
        onCancel={() => setConfirmId(null)}
      />
    </View>
  )
}

// ─── Notes ─────────────────────────────────────────────────────────────────

function NotesTab({ conversationId, userId }: { conversationId: string; userId: string }) {
  const s = styles(useAppTheme())
  const { data: notes = [] } = useNotes(conversationId)
  const createNote = useCreateNote(conversationId)
  const deleteNote = useDeleteNote()
  const [title, setTitle] = useState('')
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const onAdd = useCallback(() => {
    const t = title.trim()
    if (!t) return
    setTitle('')
    createNote.mutate(
      { title: t, content: '', userId },
      { onSuccess: () => void postSystemMessage(conversationId, userId, `Note created: ${t}`) },
    )
  }, [title, userId, createNote, conversationId])

  return (
    <View style={s.body}>
      <FlatList
        data={notes}
        keyExtractor={(n) => n.id}
        ListEmptyComponent={<Text style={s.empty}>No notes yet.</Text>}
        renderItem={({ item }) => (
          <Pressable style={s.row} onLongPress={() => setConfirmId(item.id)}>
            <Text style={s.rowText}>{item.title}</Text>
          </Pressable>
        )}
      />
      <AddRow placeholder="New note title…" value={title} onChangeText={setTitle} onSubmit={onAdd} />
      <ConfirmDialog
        visible={!!confirmId}
        title="Delete note?"
        onConfirm={() => {
          if (confirmId) deleteNote.mutate(confirmId)
          setConfirmId(null)
        }}
        onCancel={() => setConfirmId(null)}
      />
    </View>
  )
}

// ─── Reminders ──────────────────────────────────────────────────────────────
// Creation happens via the /remind slash command (Phase 3) — this tab is
// read + dismiss, matching web's shared-reminders model (migration 00022).

function RemindersTab({ conversationId }: { conversationId: string }) {
  const s = styles(useAppTheme())
  const { data: reminders = [] } = useReminders(conversationId)
  const dismiss = useDismissReminder()

  return (
    <View style={s.body}>
      <FlatList
        data={reminders}
        keyExtractor={(r) => r.id}
        ListEmptyComponent={<Text style={s.empty}>No reminders yet. Use /remind in the chat to set one.</Text>}
        renderItem={({ item }) => (
          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={s.rowText}>{item.message}</Text>
              <Text style={s.rowSubtext}>{new Date(item.remind_at).toLocaleString()}</Text>
            </View>
            <Pressable onPress={() => dismiss.mutate(item.id)}>
              <Text style={s.dismiss}>Dismiss</Text>
            </Pressable>
          </View>
        )}
      />
    </View>
  )
}

// ─── Events ─────────────────────────────────────────────────────────────────
// List/create/RSVP/delete only — the when2meet-style availability heatmap
// (UTC slot-key contract in CLAUDE.md) is not built yet.

function EventsTab({ conversationId, userId }: { conversationId: string; userId: string }) {
  const s = styles(useAppTheme())
  const { data: events = [] } = useEvents(conversationId)
  const createEvent = useCreateEvent(conversationId)
  const deleteEvent = useDeleteEvent()
  const [name, setName] = useState('')
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const onAdd = useCallback(() => {
    const n = name.trim()
    if (!n) return
    setName('')
    // Always creates in planning mode from this quick-add row; locking a
    // confirmed date needs the availability calendar this app doesn't have
    // yet, so there's no "confirmed" creation path here.
    createEvent.mutate(
      { name: n, createdBy: userId, startsAt: null },
      { onSuccess: () => void postSystemMessage(conversationId, userId, `Event created: ${n}`) },
    )
  }, [name, userId, createEvent, conversationId])

  return (
    <View style={s.body}>
      <FlatList
        data={events}
        keyExtractor={(e) => e.id}
        ListEmptyComponent={<Text style={s.empty}>No events yet.</Text>}
        renderItem={({ item }) => (
          <View style={s.rowColumn}>
            <Pressable style={s.row} onLongPress={() => setConfirmId(item.id)}>
              <View style={{ flex: 1 }}>
                <Text style={s.rowText}>{item.name}</Text>
                <Text style={s.rowSubtext}>
                  {item.status === 'confirmed' && item.starts_at
                    ? new Date(item.starts_at).toLocaleString()
                    : 'Planning — no date locked'}
                </Text>
              </View>
            </Pressable>
            {item.status === 'confirmed' && <RsvpRow eventId={item.id} userId={userId} />}
          </View>
        )}
      />
      <AddRow placeholder="New event name…" value={name} onChangeText={setName} onSubmit={onAdd} />
      <ConfirmDialog
        visible={!!confirmId}
        title="Delete event?"
        onConfirm={() => {
          if (confirmId) deleteEvent.mutate(confirmId)
          setConfirmId(null)
        }}
        onCancel={() => setConfirmId(null)}
      />
    </View>
  )
}

function RsvpRow({ eventId, userId }: { eventId: string; userId: string }) {
  const s = styles(useAppTheme())
  const { data: rsvps = [] } = useEventRsvp(eventId)
  const setRsvp = useSetRsvp(eventId)
  const mine = rsvps.find((r) => r.user_id === userId)?.response

  return (
    <View style={s.rsvpRow}>
      {(['going', 'maybe', 'not_going'] as const).map((response) => (
        <Pressable
          key={response}
          style={[s.rsvpPill, mine === response && s.rsvpPillActive]}
          onPress={() => setRsvp.mutate({ userId, response })}
        >
          <Text style={[s.rsvpText, mine === response && s.rsvpTextActive]}>
            {response === 'going' ? 'Going' : response === 'maybe' ? 'Maybe' : "Can't go"}
          </Text>
        </Pressable>
      ))}
    </View>
  )
}

// ─── Albums ─────────────────────────────────────────────────────────────────
// No media picker yet (Phase 6 depends on the same Storage infra as image
// messages) — albums can be created but stay empty until then.

function AlbumsTab({ conversationId, userId }: { conversationId: string; userId: string }) {
  const s = styles(useAppTheme())
  const { data: albums = [] } = useAlbums(conversationId)
  const createAlbum = useCreateAlbum(conversationId)
  const deleteAlbum = useDeleteAlbum()
  const [name, setName] = useState('')
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const onAdd = useCallback(() => {
    const n = name.trim()
    if (!n) return
    setName('')
    createAlbum.mutate(
      { name: n, createdBy: userId },
      { onSuccess: () => void postSystemMessage(conversationId, userId, `Album created: ${n}`) },
    )
  }, [name, userId, createAlbum, conversationId])

  return (
    <View style={s.body}>
      <FlatList
        data={albums}
        keyExtractor={(a) => a.id}
        ListEmptyComponent={<Text style={s.empty}>No albums yet.</Text>}
        renderItem={({ item }) => (
          <Pressable style={s.row} onLongPress={() => setConfirmId(item.id)}>
            <Text style={s.rowText}>{item.name}</Text>
            <Text style={s.rowSubtext}>No photos yet</Text>
          </Pressable>
        )}
      />
      <AddRow placeholder="New album name…" value={name} onChangeText={setName} onSubmit={onAdd} />
      <ConfirmDialog
        visible={!!confirmId}
        title="Delete album?"
        onConfirm={() => {
          if (confirmId) deleteAlbum.mutate(confirmId)
          setConfirmId(null)
        }}
        onCancel={() => setConfirmId(null)}
      />
    </View>
  )
}

// ─── Budgets ────────────────────────────────────────────────────────────────
// Local tracking only — Splitwise export needs OAuth credentials this app
// doesn't have configured, genuinely out of scope rather than cut.

function BudgetsTab({ conversationId, userId }: { conversationId: string; userId: string }) {
  const s = styles(useAppTheme())
  const { data: budgets = [] } = useBudgets(conversationId)
  const createBudget = useCreateBudget(conversationId)
  const deleteBudget = useDeleteBudget()
  const [name, setName] = useState('')
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const onAdd = useCallback(() => {
    const n = name.trim()
    if (!n) return
    setName('')
    createBudget.mutate(
      { name: n, totalAmount: 0, createdBy: userId },
      { onSuccess: () => void postSystemMessage(conversationId, userId, `Budget created: ${n}`) },
    )
  }, [name, userId, createBudget, conversationId])

  return (
    <View style={s.body}>
      <FlatList
        data={budgets}
        keyExtractor={(b) => b.id}
        ListEmptyComponent={<Text style={s.empty}>No budgets yet.</Text>}
        renderItem={({ item }) => (
          <Pressable style={s.row} onLongPress={() => setConfirmId(item.id)}>
            <Text style={s.rowText}>{item.name}</Text>
            <Text style={s.rowSubtext}>
              {item.total_amount > 0 ? `${item.currency} ${item.total_amount.toFixed(2)}` : 'No total set'}
            </Text>
          </Pressable>
        )}
      />
      <AddRow placeholder="New budget name…" value={name} onChangeText={setName} onSubmit={onAdd} />
      <ConfirmDialog
        visible={!!confirmId}
        title="Delete budget?"
        onConfirm={() => {
          if (confirmId) deleteBudget.mutate(confirmId)
          setConfirmId(null)
        }}
        onCancel={() => setConfirmId(null)}
      />
    </View>
  )
}

// ─── Shared bits ─────────────────────────────────────────────────────────────

function AddRow({
  placeholder,
  value,
  onChangeText,
  onSubmit,
}: {
  placeholder: string
  value: string
  onChangeText: (v: string) => void
  onSubmit: () => void
}) {
  const { colors } = useAppTheme()
  const s = styles(useAppTheme())
  return (
    <View style={s.addRow}>
      <TextInput
        style={s.addInput}
        placeholder={placeholder}
        placeholderTextColor={colors.textSubtle}
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        returnKeyType="done"
      />
      <Pressable style={s.addButton} onPress={onSubmit} disabled={!value.trim()}>
        <Text style={s.addButtonText}>Add</Text>
      </Pressable>
    </View>
  )
}

const styles = ({ colors, spacing, radii, type }: ReturnType<typeof useAppTheme>) =>
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
    title: { color: colors.text, ...type.heading, fontSize: 16, flex: 1, textAlign: 'center' },
    tabBar: { flexGrow: 0, marginTop: spacing.sm, marginBottom: spacing.sm },
    tabBarContent: { paddingHorizontal: spacing.md, gap: spacing.xs },
    tabPill: {
      paddingHorizontal: spacing.md,
      paddingVertical: 6,
      borderRadius: radii.pill,
      backgroundColor: colors.tint,
      borderWidth: 1,
      borderColor: colors.border,
      marginRight: spacing.xs,
    },
    tabPillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    tabText: { color: colors.textMuted, ...type.label },
    tabTextActive: { color: '#ffffff' },
    body: { flex: 1, paddingHorizontal: spacing.md },
    empty: { color: colors.textSubtle, textAlign: 'center', marginTop: spacing.lg },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSoft,
    },
    rowColumn: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderSoft },
    rowText: { color: colors.text, ...type.body },
    rowTextDone: { color: colors.textSubtle, textDecorationLine: 'line-through' },
    rowSubtext: { color: colors.textMuted, ...type.caption, marginTop: 2 },
    dismiss: { color: colors.primaryText, ...type.label },
    checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 2, borderColor: colors.textSubtle },
    checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
    rsvpRow: { flexDirection: 'row', gap: spacing.xs, paddingBottom: spacing.sm },
    rsvpPill: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: colors.border,
    },
    rsvpPillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    rsvpText: { color: colors.textMuted, ...type.caption },
    rsvpTextActive: { color: '#ffffff', fontWeight: '700' },
    addRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      paddingVertical: spacing.sm,
      alignItems: 'center',
    },
    addInput: {
      flex: 1,
      backgroundColor: colors.tint,
      color: colors.text,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 8,
    },
    addButton: { backgroundColor: colors.primary, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: 8 },
    addButtonText: { color: '#ffffff', fontWeight: '700' },
  })
