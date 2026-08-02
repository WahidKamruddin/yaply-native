import { useCallback, useState } from 'react'
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useAuth } from '../../src/features/auth/useAuth'
import { ConfirmDialog } from '../../src/components/ConfirmDialog'
import { theme } from '../../src/theme'

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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Conversation Tools</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar} contentContainerStyle={styles.tabBarContent}>
        {TABS.map((t) => (
          <Pressable key={t} style={[styles.tabPill, tab === t && styles.tabPillActive]} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t}</Text>
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
    <View style={styles.body}>
      <FlatList
        data={tasks}
        keyExtractor={(t) => t.id}
        ListEmptyComponent={<Text style={styles.empty}>No tasks yet.</Text>}
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() => updateStatus.mutate({ taskId: item.id, status: item.status === 'done' ? 'todo' : 'done' })}
            onLongPress={() => setConfirmId(item.id)}
          >
            <View style={[styles.checkbox, item.status === 'done' && styles.checkboxChecked]} />
            <Text style={[styles.rowText, item.status === 'done' && styles.rowTextDone]}>{item.title}</Text>
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
    <View style={styles.body}>
      <FlatList
        data={notes}
        keyExtractor={(n) => n.id}
        ListEmptyComponent={<Text style={styles.empty}>No notes yet.</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onLongPress={() => setConfirmId(item.id)}>
            <Text style={styles.rowText}>{item.title}</Text>
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
  const { data: reminders = [] } = useReminders(conversationId)
  const dismiss = useDismissReminder()

  return (
    <View style={styles.body}>
      <FlatList
        data={reminders}
        keyExtractor={(r) => r.id}
        ListEmptyComponent={<Text style={styles.empty}>No reminders yet. Use /remind in the chat to set one.</Text>}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowText}>{item.message}</Text>
              <Text style={styles.rowSubtext}>{new Date(item.remind_at).toLocaleString()}</Text>
            </View>
            <Pressable onPress={() => dismiss.mutate(item.id)}>
              <Text style={styles.dismiss}>Dismiss</Text>
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
    <View style={styles.body}>
      <FlatList
        data={events}
        keyExtractor={(e) => e.id}
        ListEmptyComponent={<Text style={styles.empty}>No events yet.</Text>}
        renderItem={({ item }) => (
          <View style={styles.rowColumn}>
            <Pressable style={styles.row} onLongPress={() => setConfirmId(item.id)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowText}>{item.name}</Text>
                <Text style={styles.rowSubtext}>
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
  const { data: rsvps = [] } = useEventRsvp(eventId)
  const setRsvp = useSetRsvp(eventId)
  const mine = rsvps.find((r) => r.user_id === userId)?.response

  return (
    <View style={styles.rsvpRow}>
      {(['going', 'maybe', 'not_going'] as const).map((response) => (
        <Pressable
          key={response}
          style={[styles.rsvpPill, mine === response && styles.rsvpPillActive]}
          onPress={() => setRsvp.mutate({ userId, response })}
        >
          <Text style={[styles.rsvpText, mine === response && styles.rsvpTextActive]}>
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
    <View style={styles.body}>
      <FlatList
        data={albums}
        keyExtractor={(a) => a.id}
        ListEmptyComponent={<Text style={styles.empty}>No albums yet.</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onLongPress={() => setConfirmId(item.id)}>
            <Text style={styles.rowText}>{item.name}</Text>
            <Text style={styles.rowSubtext}>No photos yet</Text>
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
    <View style={styles.body}>
      <FlatList
        data={budgets}
        keyExtractor={(b) => b.id}
        ListEmptyComponent={<Text style={styles.empty}>No budgets yet.</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onLongPress={() => setConfirmId(item.id)}>
            <Text style={styles.rowText}>{item.name}</Text>
            <Text style={styles.rowSubtext}>
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
  return (
    <View style={styles.addRow}>
      <TextInput
        style={styles.addInput}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textMuted}
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        returnKeyType="done"
      />
      <Pressable style={styles.addButton} onPress={onSubmit} disabled={!value.trim()}>
        <Text style={styles.addButtonText}>Add</Text>
      </Pressable>
    </View>
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
  title: { color: theme.colors.text, ...theme.type.heading, fontSize: 16, flex: 1, textAlign: 'center' },
  tabBar: { flexGrow: 0, marginBottom: theme.spacing.sm },
  tabBarContent: { paddingHorizontal: theme.spacing.md, gap: theme.spacing.xs },
  tabPill: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 6,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.surface,
    marginRight: theme.spacing.xs,
  },
  tabPillActive: { backgroundColor: theme.colors.accent },
  tabText: { color: theme.colors.textMuted, ...theme.type.label },
  tabTextActive: { color: '#1a0f0c' },
  body: { flex: 1, paddingHorizontal: theme.spacing.md },
  empty: { color: theme.colors.textMuted, textAlign: 'center', marginTop: theme.spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  rowColumn: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
  rowText: { color: theme.colors.text, ...theme.type.body },
  rowTextDone: { color: theme.colors.textMuted, textDecorationLine: 'line-through' },
  rowSubtext: { color: theme.colors.textMuted, ...theme.type.caption, marginTop: 2 },
  dismiss: { color: theme.colors.accent, ...theme.type.label },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 2, borderColor: theme.colors.textMuted },
  checkboxChecked: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  rsvpRow: { flexDirection: 'row', gap: theme.spacing.xs, paddingBottom: theme.spacing.sm },
  rsvpPill: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  rsvpPillActive: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  rsvpText: { color: theme.colors.textMuted, ...theme.type.caption },
  rsvpTextActive: { color: '#1a0f0c', fontWeight: '700' },
  addRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
  },
  addInput: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    color: theme.colors.text,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 8,
  },
  addButton: { backgroundColor: theme.colors.accent, borderRadius: theme.radii.md, paddingHorizontal: theme.spacing.md, paddingVertical: 8 },
  addButtonText: { color: '#1a0f0c', fontWeight: '700' },
})
