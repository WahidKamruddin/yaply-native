import { useState, type ReactNode } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native'
import { BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
import { useAppTheme } from '../theme/ThemeProvider'
import { YaplyLogo } from './YaplyLogo'

interface Props {
  title: string
  subtitle: string
  children: ReactNode
  footer?: ReactNode
}

// Shared shell for sign-in/sign-up — decorative blurred orbs behind a
// glassmorphic card, matching web's auth.tsx (.lp-orb-a/.lp-orb-c + .auth-card
// + .lp-glass). Each screen keeps its own route/component per the "keep two
// routes" decision; this only factors out the visual chrome both share.
export function AuthScreen({ title, subtitle, children, footer }: Props) {
  const { colors, spacing, radii, type, mode } = useAppTheme()
  const glassOverlay = mode === 'dark' ? 'rgba(143,184,255,0.06)' : 'rgba(255,255,255,0.6)'

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Decorative orbs — echo web's .lp-orb-a (blue, top-right) and
          .lp-orb-c (mint, bottom-left). A BlurView sits above them (behind
          the card, in front of the orbs) so they read as a soft glow rather
          than hard-edged circles, without needing a native radial-gradient
          library. */}
      <View style={[styles.orbA, { backgroundColor: colors.primary }]} />
      <View style={[styles.orbC, { backgroundColor: colors.mint }]} />
      <BlurView intensity={80} tint={mode} style={StyleSheet.absoluteFill} />

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <YaplyLogo size={48} />
          </View>

          <View style={styles.cardWrapper}>
            <BlurView intensity={30} tint={mode} style={[StyleSheet.absoluteFill, { borderRadius: radii.lg }]} />
            <View
              style={[
                styles.card,
                {
                  backgroundColor: glassOverlay,
                  borderColor: colors.border,
                  borderRadius: radii.lg,
                  padding: spacing.lg,
                },
              ]}
            >
              <Text style={[styles.title, { color: colors.text, ...type.title, fontSize: 25 }]}>{title}</Text>
              <Text style={[styles.subtitle, { color: colors.textMuted, ...type.body, marginBottom: spacing.lg }]}>
                {subtitle}
              </Text>
              {children}
            </View>
          </View>

          {footer}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}

// Matches web's `.auth-field input`: tint fill, border, blue focus ring —
// approximated here as a border-color swap on focus (RN has no box-shadow).
export function AuthInput(props: TextInputProps) {
  const { colors, radii } = useAppTheme()
  const [focused, setFocused] = useState(false)
  return (
    <TextInput
      {...props}
      onFocus={(e) => {
        setFocused(true)
        props.onFocus?.(e)
      }}
      onBlur={(e) => {
        setFocused(false)
        props.onBlur?.(e)
      }}
      placeholderTextColor={colors.textSubtle}
      style={[
        inputStyles.input,
        {
          backgroundColor: focused ? colors.tintStrong : colors.tint,
          borderColor: focused ? colors.primary : colors.border,
          borderRadius: radii.md,
          color: colors.text,
        },
        props.style,
      ]}
    />
  )
}

const inputStyles = StyleSheet.create({
  input: { borderWidth: 1, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14 },
})

// Matches web's `.lp-btn-primary`: full-pill, diagonal primary→primary-dark
// gradient, soft blue shadow, white text.
export function AuthButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  const { colors, radii } = useAppTheme()
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [{ opacity: disabled ? 0.55 : pressed ? 0.9 : 1 }]}>
      <LinearGradient
        colors={[colors.primary, colors.primaryDark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          buttonStyles.button,
          { borderRadius: radii.pill, shadowColor: colors.primary },
        ]}
      >
        <Text style={buttonStyles.text}>{label}</Text>
      </LinearGradient>
    </Pressable>
  )
}

const buttonStyles = StyleSheet.create({
  button: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  text: { color: '#ffffff', fontWeight: '700', fontSize: 15, letterSpacing: -0.2 },
})

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 48 },
  orbA: { position: 'absolute', top: -140, right: -100, width: 280, height: 280, borderRadius: 140, opacity: 0.28 },
  orbC: { position: 'absolute', bottom: -120, left: -80, width: 220, height: 220, borderRadius: 110, opacity: 0.22 },
  brand: { alignItems: 'center', marginBottom: 24 },
  cardWrapper: { borderRadius: 24, overflow: 'hidden' },
  card: { borderWidth: 1 },
  title: { textAlign: 'center', marginBottom: 4 },
  subtitle: { textAlign: 'center' },
})
