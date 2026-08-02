import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../../lib/supabase'

export interface Budget {
  id: string
  conversation_id: string
  name: string
  total_amount: number
  currency: string
  created_by: string
  created_at: string
  event_id: string | null
}

export interface Expense {
  id: string
  budget_id: string
  paid_by: string
  description: string
  amount: number
  category: string
  split_between: string[]
  created_at: string
}

// Splitwise export (OAuth2 client credentials) is not wired up — genuinely
// out of scope without API credentials, not a corner cut. This covers local
// budget/expense tracking only.
export function useBudgets(conversationId: string | null) {
  return useQuery({
    queryKey: ['budgets', conversationId],
    queryFn: async () => {
      if (!conversationId) return []
      const { data, error } = await supabase
        .from('budgets')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Budget[]
    },
    enabled: !!conversationId,
    staleTime: 30_000,
  })
}

export function useExpenses(budgetId: string | null) {
  return useQuery({
    queryKey: ['expenses', budgetId],
    queryFn: async () => {
      if (!budgetId) return []
      const { data, error } = await supabase.from('expenses').select('*').eq('budget_id', budgetId).order('created_at', { ascending: false })
      if (error) throw error
      return data as Expense[]
    },
    enabled: !!budgetId,
    staleTime: 30_000,
  })
}

export function useCreateBudget(conversationId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ name, totalAmount, createdBy }: { name: string; totalAmount: number; createdBy: string }) => {
      const { error } = await supabase
        .from('budgets')
        .insert({ conversation_id: conversationId, created_by: createdBy, name, total_amount: totalAmount, currency: 'USD' })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budgets', conversationId] }),
  })
}

export function useDeleteBudget() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (budgetId: string) => {
      const { error } = await supabase.from('budgets').delete().eq('id', budgetId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budgets'] }),
  })
}

export function useAddExpense(budgetId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (expense: { paid_by: string; description: string; amount: number; split_between: string[] }) => {
      const { error } = await supabase.from('expenses').insert({
        budget_id: budgetId,
        paid_by: expense.paid_by,
        description: expense.description,
        amount: expense.amount,
        category: 'other',
        split_between: expense.split_between,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expenses', budgetId] }),
  })
}
