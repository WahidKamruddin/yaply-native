import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { supabase } from '../../src/lib/supabase'
import { useAppTheme } from '../../src/theme/ThemeProvider'
import { AuthScreen, AuthInput, AuthButton } from '../../src/components/AuthScreen'

export default function SignUp() {
  const { colors, spacing } = useAppTheme()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const onSubmit = async () => {
    setError(null)
    setLoading(true)
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username: username || email.split('@')[0] } },
    })
    setLoading(false)
    if (signUpError) setError(signUpError.message)
  }

  return (
    <AuthScreen
      title="Create your account."
      subtitle="Takes less than a minute."
      footer={
        <Pressable style={styles.link} onPress={() => router.back()}>
          <Text style={[styles.linkText, { color: colors.textMuted }]}>Already have an account? Sign in</Text>
        </Pressable>
      }
    >
      <View style={{ gap: spacing.sm }}>
        <AuthInput placeholder="Username" autoCapitalize="none" value={username} onChangeText={setUsername} />
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
          <AuthButton label={loading ? 'Creating…' : 'Sign up'} onPress={onSubmit} disabled={loading} />
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
