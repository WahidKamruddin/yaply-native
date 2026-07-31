import { Redirect } from 'expo-router'

// Placeholder root route. Phase 2 replaces this with a real auth gate
// (redirect to /(auth)/sign-in when logged out, /(tabs) when logged in).
export default function Index() {
  return <Redirect href="/(tabs)" />
}
