import 'react-native-get-random-values'
import 'react-native-url-polyfill/auto'
import 'react-native-reanimated'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useAuth } from '../src/features/auth/useAuth'
import { useEncryption } from '../src/features/chat/hooks/useEncryption'

const queryClient = new QueryClient()

function RootNavigator() {
  const { user, loading } = useAuth()
  // Kick off device registration as soon as we know who's signed in — one
  // call here (not per-screen) is enough thanks to the single-flight guard
  // in useEncryption, so a message sent right after login is never silently
  // downgraded to phase-1.
  useEncryption(user?.id)

  if (loading) return null

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!user}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={!!user}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="chat/[id]" />
      </Stack.Protected>
    </Stack>
  )
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <RootNavigator />
        <StatusBar style="light" />
      </QueryClientProvider>
    </GestureHandlerRootView>
  )
}
