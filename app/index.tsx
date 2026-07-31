import { Redirect } from 'expo-router'
import { useAuth } from '../src/features/auth/useAuth'

// Root route: sends signed-in users to the conversation list, signed-out
// users to sign-in. Stack.Protected in _layout.tsx enforces the actual
// access control; this just picks where "/" lands.
export default function Index() {
  const { user, loading } = useAuth()
  if (loading) return null
  return <Redirect href={user ? '/(tabs)' : '/(auth)/sign-in'} />
}
