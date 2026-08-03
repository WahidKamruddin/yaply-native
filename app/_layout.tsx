import 'react-native-get-random-values'
import 'react-native-url-polyfill/auto'
import 'react-native-reanimated'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useFonts } from 'expo-font'
import '../src/features/productivity/notifications'
import { useAuth } from '../src/features/auth/useAuth'
import { useEncryption } from '../src/features/chat/hooks/useEncryption'
import { ThemeProvider, useAppTheme } from '../src/theme/ThemeProvider'

const queryClient = new QueryClient()

function RootNavigator() {
  const { user, loading } = useAuth()
  const { mode } = useAppTheme()
  // Kick off device registration as soon as we know who's signed in — one
  // call here (not per-screen) is enough thanks to the single-flight guard
  // in useEncryption, so a message sent right after login is never silently
  // downgraded to phase-1.
  useEncryption(user?.id)

  if (loading) return null

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={!user}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={!!user}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="chat/[id]" />
          <Stack.Screen name="panel/[id]" options={{ presentation: 'modal' }} />
        </Stack.Protected>
      </Stack>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
    </>
  )
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    // Web self-hosts a .woff2 of the same font — RN can't load .woff2 as a
    // native font, so this is a separately-sourced .ttf build (see
    // assets/fonts/BricolageGrotesque.ttf, fetched from Google Fonts' OFL
    // release). Variable-weight selection via CSS-style fontWeight isn't
    // guaranteed to work the way it does on web; text tagged with this family
    // may render at the font's default instance regardless of fontWeight —
    // a known limitation, not a bug, documented in CLAUDE.md.
    BricolageGrotesque: require('../assets/fonts/BricolageGrotesque.ttf'),
  })

  if (!fontsLoaded) return null

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <RootNavigator />
        </QueryClientProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  )
}
