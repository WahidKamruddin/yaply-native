import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../../lib/supabase'
import { cancelReminderNotification } from '../notifications'

export interface Reminder {
  id: string
  user_id: string
  conversation_id: string | null
  message: string
  remind_at: string
  status: 'pending' | 'sent' | 'dismissed'
  created_at: string
}

// Shared per migration 00022 — all conversation members can view/dismiss,
// not just the creator. No `target_type` column.
export function useReminders(conversationId: string | null) {
  return useQuery({
    queryKey: ['reminders', conversationId],
    queryFn: async () => {
      if (!conversationId) return []
      const { data, error } = await supabase
        .from('reminders')
        .select('*')
        .eq('conversation_id', conversationId)
        .neq('status', 'dismissed')
        .order('remind_at', { ascending: true })
      if (error) throw error
      return data as Reminder[]
    },
    enabled: !!conversationId,
    staleTime: 30_000,
  })
}

export function useDismissReminder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (reminderId: string) => {
      await cancelReminderNotification(reminderId)
      const { error } = await supabase.from('reminders').update({ status: 'dismissed' }).eq('id', reminderId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reminders'] }),
  })
}
