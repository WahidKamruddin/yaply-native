import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../../lib/supabase'

// Re-fetch on any change rather than parsing the realtime payload — keeps
// decryption logic in exactly one place (the query fn), matching web's
// rationale documented in CLAUDE.md.
export function useRealtimeMessages(conversationId: string | null) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!conversationId) return

    const invalidate = () => {
      void queryClient.invalidateQueries({ queryKey: ['messages', conversationId] })
      void queryClient.invalidateQueries({ queryKey: ['conversations'] })
    }

    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        invalidate,
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        invalidate,
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [conversationId, queryClient])
}
