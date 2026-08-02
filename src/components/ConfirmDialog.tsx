import { useEffect } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { theme } from '../theme'

interface Props {
  visible: boolean
  title: string
  message?: string
  destructiveLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

// Generic reusable version of the animated-sheet pattern from
// MessageActionSheet, for the productivity panel's delete confirmations —
// keeps "no native Alert" consistent outside the chat screen too.
export function ConfirmDialog({ visible, title, message, destructiveLabel = 'Delete', onConfirm, onCancel }: Props) {
  const progress = useSharedValue(0)

  useEffect(() => {
    progress.value = withTiming(visible ? 1 : 0, { duration: 180, easing: Easing.out(Easing.cubic) })
  }, [visible, progress])

  const cardStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.92 + progress.value * 0.08 }],
  }))
  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value * 0.5 }))

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onCancel}>
      <Pressable style={styles.backdropTouchable} onPress={onCancel}>
        <Animated.View style={[styles.backdrop, backdropStyle]} />
      </Pressable>
      <View style={styles.container} pointerEvents="box-none">
        <Animated.View style={[styles.card, cardStyle]}>
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <View style={styles.actions}>
            <Pressable style={styles.button} onPress={onCancel}>
              <Text style={styles.buttonText}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.button} onPress={onConfirm}>
              <Text style={[styles.buttonText, styles.destructive]}>{destructiveLabel}</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdropTouchable: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000' },
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.lg },
  card: {
    width: '100%',
    backgroundColor: theme.colors.surfaceRaised,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.lg,
  },
  title: { color: theme.colors.text, ...theme.type.heading, fontSize: 17, marginBottom: 4 },
  message: { color: theme.colors.textMuted, ...theme.type.body, marginBottom: theme.spacing.md },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: theme.spacing.lg, marginTop: theme.spacing.sm },
  button: { paddingVertical: 6, paddingHorizontal: 4 },
  buttonText: { color: theme.colors.text, ...theme.type.label },
  destructive: { color: theme.colors.danger },
})
