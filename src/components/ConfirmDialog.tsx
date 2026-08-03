import { useEffect } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { BlurView } from 'expo-blur'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { useAppTheme } from '../theme/ThemeProvider'

interface Props {
  visible: boolean
  title: string
  message?: string
  destructiveLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

// Matches web's shared Radix Dialog delete-confirm pattern (MessageBubble.tsx
// / ConversationItem.tsx on web): centered card, black/50 + blur overlay,
// fade+zoom-from-95% entrance, solid red destructive button (web's literal
// bg-red-500, not its own `--danger` token — an inconsistency in web itself,
// reproduced faithfully here rather than "fixed").
export function ConfirmDialog({ visible, title, message, destructiveLabel = 'Delete', onConfirm, onCancel }: Props) {
  const { colors, spacing, radii, type, mode } = useAppTheme()
  const progress = useSharedValue(0)

  useEffect(() => {
    progress.value = withTiming(visible ? 1 : 0, { duration: 200, easing: Easing.out(Easing.cubic) })
  }, [visible, progress])

  const cardStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.95 + progress.value * 0.05 }],
  }))
  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value * 0.5 }))

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onCancel}>
      <Pressable style={styles.backdropTouchable} onPress={onCancel}>
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <BlurView intensity={20} tint={mode} style={StyleSheet.absoluteFill} />
        </Animated.View>
      </Pressable>
      <View style={styles.container} pointerEvents="box-none">
        <Animated.View
          style={[
            cardStyle,
            {
              width: '100%',
              maxWidth: 384,
              backgroundColor: colors.card,
              borderRadius: radii.lg,
              borderWidth: 1,
              borderColor: colors.border,
              padding: spacing.lg,
              shadowColor: '#000',
              shadowOpacity: 0.5,
              shadowRadius: 24,
              shadowOffset: { width: 0, height: 12 },
              elevation: 12,
            },
          ]}
        >
          <Text style={[styles.title, { color: colors.text, ...type.heading, fontSize: 16 }]}>{title}</Text>
          {message ? (
            <Text style={[styles.message, { color: colors.textMuted, ...type.body, marginTop: 4, marginBottom: spacing.md }]}>
              {message}
            </Text>
          ) : null}
          <View style={[styles.actions, { gap: spacing.md, marginTop: spacing.sm }]}>
            <Pressable
              style={[styles.button, { borderColor: colors.tintStrong, borderRadius: radii.md }]}
              onPress={onCancel}
            >
              <Text style={[styles.buttonText, { color: colors.textMuted, ...type.label }]}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.button, styles.destructiveButton, { backgroundColor: colors.destructiveButton, borderRadius: radii.md }]}
              onPress={onConfirm}
            >
              <Text style={[styles.buttonText, { color: '#fff', ...type.label }]}>{destructiveLabel}</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdropTouchable: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000', overflow: 'hidden' },
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { marginBottom: 2, textAlign: 'center' },
  message: { textAlign: 'center' },
  actions: { flexDirection: 'row' },
  button: { flex: 1, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  destructiveButton: { borderWidth: 0 },
  buttonText: {},
})
