import * as Notifications from 'expo-notifications'

// Reminders are scheduled as local OS notifications, not polled every 60s
// like web does — the approach CLAUDE.md documents for native platforms
// (mirrors what the deprecated iOS app did with UNNotificationRequest).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
})

export async function ensureNotificationPermission(): Promise<boolean> {
  const { status } = await Notifications.getPermissionsAsync()
  if (status === 'granted') return true
  const { status: requested } = await Notifications.requestPermissionsAsync()
  return requested === 'granted'
}

export async function scheduleReminderNotification(reminderId: string, message: string, remindAt: Date): Promise<void> {
  const granted = await ensureNotificationPermission()
  if (!granted) return
  const seconds = Math.max(1, Math.round((remindAt.getTime() - Date.now()) / 1000))
  await Notifications.scheduleNotificationAsync({
    identifier: reminderId,
    content: { title: 'yaply reminder', body: message },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds, repeats: false },
  })
}

export async function cancelReminderNotification(reminderId: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(reminderId)
}
