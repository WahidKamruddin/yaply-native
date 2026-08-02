import { supabase } from '../../../lib/supabase'
import { parseDateTimeArgs } from '../commandParser'
import { scheduleReminderNotification } from '../../productivity/notifications'

export interface RemindArgs {
  conversationId: string
  createdBy: string
  args: string[]
}

export async function remindHandler({ conversationId, createdBy, args }: RemindArgs): Promise<string> {
  if (args.length < 3) {
    return 'Usage: /remind [date] [time] [message]\nDate: MM/DD/YYYY · Time: HH:MM or HH:MMam/pm\nExample: /remind 06/15/2026 3:00pm Call Alice'
  }

  const [dateStr, timeStr, ...messageParts] = args
  const message = messageParts.join(' ')
  if (!message) return 'Please include a reminder message after the date and time.'

  const remindAt = parseDateTimeArgs(dateStr!, timeStr!)
  if (!remindAt) {
    return "Couldn't parse date/time. Use today, tomorrow, or MM/DD/YYYY and HH:MM or HH:MMam/pm.\nExample: /remind tomorrow 3:00pm Call Alice"
  }
  if (remindAt.getTime() <= Date.now()) return 'That time is in the past. Pick a future date/time.'

  const { data, error } = await supabase
    .from('reminders')
    .insert({ conversation_id: conversationId, user_id: createdBy, message, remind_at: remindAt.toISOString(), status: 'pending' })
    .select('id')
    .single()
  if (error) throw error

  // Local scheduling (not web's 60s poll) — mirrors the deprecated iOS app's
  // UNNotificationRequest approach, documented in CLAUDE.md. Best-effort: a
  // denied permission shouldn't fail the command, just skip the notification.
  try {
    await scheduleReminderNotification(data.id, message, remindAt)
  } catch (err) {
    console.error('[yaply] failed to schedule reminder notification', err)
  }

  const formatted = remindAt.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
  return `⏰ Reminder set for ${formatted}: "${message}"`
}
