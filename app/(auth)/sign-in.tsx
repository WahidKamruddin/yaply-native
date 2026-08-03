import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { supabase } from '../../src/lib/supabase'
import { useAppTheme } from '../../src/theme/ThemeProvider'
import { AuthScreen, AuthInput, AuthButton } from '../../src/components/AuthScreen'

export default function SignIn() {
  const { colors, spacing } = useAppTheme()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const onSubmit = async () => {
    setError(null)
    setLoading(true)
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (signInError) setError(signInError.message)
    // On success, useAuth's onAuthStateChange fires and Stack.Protected in
    // _layout.tsx routes to (tabs) automatically.
  }

  return (
    <AuthScreen
      title="Welcome back."
      subtitle="Sign in to keep the conversation going."
      footer={
        <Pressable style={styles.link} onPress={() => router.push('/(auth)/sign-up')}>
          <Text style={[styles.linkText, { color: colors.textMuted }]}>Need an account? Sign up</Text>
        </Pressable>
      }
    >
      <View style={{ gap: spacing.sm }}>
        <AuthInput
          placeholder="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <AuthInput placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} />
        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
        <View style={{ marginTop: spacing.xs }}>
          <AuthButton label={loading ? 'Signing in…' : 'Sign in'} onPress={onSubmit} disabled={loading} />
        </View>
      </View>
    </AuthScreen>
  )
}

const styles = StyleSheet.create({
  error: { textAlign: 'center', fontSize: 13 },
  link: { marginTop: 20, alignItems: 'center' },
  linkText: { textAlign: 'center' },
})
