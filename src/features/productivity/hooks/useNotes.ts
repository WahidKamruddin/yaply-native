import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../../lib/supabase'

export interface Note {
  // Owner is `user_id`, not `created_by` — the deprecated iOS app shipped this
  // bug and had to fix it later. See CLAUDE.md's Development Notes.
  id: string
  user_id: string
  conversation_id: string | null
  title: string
  content: string
  created_at: string
  updated_at: string
}

export function useNotes(conversationId: string | null) {
  return useQuery({
    queryKey: ['notes', conversationId],
    queryFn: async () => {
      if (!conversationId) return []
      const { data, error } = await supabase
        .from('notes')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Note[]
    },
    enabled: !!conversationId,
    staleTime: 30_000,
  })
}

export function useCreateNote(conversationId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ title, content, userId }: { title: string; content: string; userId: string }) => {
      const { error } = await supabase.from('notes').insert({ conversation_id: conversationId, user_id: userId, title, content })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes', conversationId] }),
  })
}

export function useDeleteNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (noteId: string) => {
      const { error } = await supabase.from('notes').delete().eq('id', noteId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes'] }),
  })
}
