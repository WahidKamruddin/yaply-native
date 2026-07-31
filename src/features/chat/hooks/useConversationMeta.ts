import { useQuery } from '@tanstack/react-query'
import { fetchConversationMeta } from '../api/conversations'

export function useConversationMeta(conversationId: string | null) {
  return useQuery({
    queryKey: ['conversation-meta', conversationId],
    queryFn: () => fetchConversationMeta(conversationId!),
    enabled: !!conversationId,
    staleTime: 30_000,
  })
}
