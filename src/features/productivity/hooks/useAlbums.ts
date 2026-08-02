import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../../lib/supabase'

export interface Album {
  id: string
  conversation_id: string
  name: string
  created_by: string
  created_at: string
  event_id: string | null
}

export function useAlbums(conversationId: string | null) {
  return useQuery({
    queryKey: ['albums', conversationId],
    queryFn: async () => {
      if (!conversationId) return []
      const { data, error } = await supabase
        .from('albums')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Album[]
    },
    enabled: !!conversationId,
    staleTime: 30_000,
  })
}

export function useCreateAlbum(conversationId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ name, createdBy }: { name: string; createdBy: string }) => {
      const { error } = await supabase.from('albums').insert({ conversation_id: conversationId, name, created_by: createdBy })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['albums', conversationId] }),
  })
}

export function useDeleteAlbum() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (albumId: string) => {
      const { error } = await supabase.from('albums').delete().eq('id', albumId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['albums'] }),
  })
}
