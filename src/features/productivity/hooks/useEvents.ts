import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../../lib/supabase'

export interface Event {
  id: string
  conversation_id: string
  created_by: string
  name: string
  description: string | null
  location: string | null
  status: 'planning' | 'confirmed'
  starts_at: string | null
  ends_at: string | null
  created_at: string
  updated_at: string
}

export interface EventRsvp {
  id: string
  event_id: string
  user_id: string
  response: 'going' | 'maybe' | 'not_going' | 'pending'
  updated_at: string
}

// `planning` = when2meet mode (no date locked), `confirmed` = date set. The
// full availability-heatmap grid (UTC slot-key contract in CLAUDE.md) is not
// built yet — see the Feature Map. This covers list/create/RSVP/delete.
export function useEvents(conversationId: string | null) {
  return useQuery({
    queryKey: ['events', conversationId],
    queryFn: async () => {
      if (!conversationId) return []
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Event[]
    },
    enabled: !!conversationId,
    staleTime: 30_000,
  })
}

export function useEventRsvp(eventId: string | null) {
  return useQuery({
    queryKey: ['event-rsvp', eventId],
    queryFn: async () => {
      if (!eventId) return []
      const { data, error } = await supabase.from('event_rsvp').select('*').eq('event_id', eventId)
      if (error) throw error
      return data as EventRsvp[]
    },
    enabled: !!eventId,
    staleTime: 15_000,
  })
}

export function useSetRsvp(eventId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId, response }: { userId: string; response: EventRsvp['response'] }) => {
      const { error } = await supabase
        .from('event_rsvp')
        .upsert({ event_id: eventId, user_id: userId, response, updated_at: new Date().toISOString() }, { onConflict: 'event_id,user_id' })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['event-rsvp', eventId] }),
  })
}

export function useCreateEvent(conversationId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      name,
      createdBy,
      startsAt,
    }: {
      name: string
      createdBy: string
      startsAt: Date | null // null = planning mode; set = confirmed
    }) => {
      const { error } = await supabase.from('events').insert({
        conversation_id: conversationId,
        created_by: createdBy,
        name,
        status: startsAt ? 'confirmed' : 'planning',
        starts_at: startsAt?.toISOString() ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['events', conversationId] }),
  })
}

export function useDeleteEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (eventId: string) => {
      const { error } = await supabase.from('events').delete().eq('id', eventId)
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['events'] })
      // ON DELETE SET NULL fires on albums/notes/budgets linked to this event.
      void qc.invalidateQueries({ queryKey: ['albums'] })
      void qc.invalidateQueries({ queryKey: ['notes'] })
      void qc.invalidateQueries({ queryKey: ['budgets'] })
    },
  })
}
