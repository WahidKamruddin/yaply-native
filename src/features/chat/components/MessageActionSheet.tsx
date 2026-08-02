import { useEffect } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { theme } from '../../../theme'

interface Props {
  visible: boolean
  canDelete: boolean
  onReply: () => void
  onDelete: () => void
  onClose: () => void
}

// Custom animated bottom sheet replacing a native Alert — part of the
// Messenger-esque interaction language (CLAUDE.md's Design Direction: no
// native alerts/sheets, custom components throughout).
export function MessageActionSheet({ visible, canDelete, onReply, onDelete, onClose }: Props) {
  const progress = useSharedValue(0)

  useEffect(() => {
    progress.value = withTiming(visible ? 1 : 0, { duration: 200, easing: Easing.out(Easing.cubic) })
  }, [visible, progress])

  const sheetStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 40 }],
  }))
  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value * 0.5 }))

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.backdropTouchable} onPress={onClose}>
        <Animated.View style={[styles.backdrop, backdropStyle]} />
      </Pressable>
      <View style={styles.container} pointerEvents="box-none">
        <Animated.View style={[styles.sheet, sheetStyle]}>
          <Pressable style={styles.option} onPress={onReply}>
            <Text style={styles.optionText}>Reply</Text>
          </Pressable>
          {canDelete && (
            <Pressable style={styles.option} onPress={onDelete}>
              <Text style={[styles.optionText, styles.destructive]}>Delete</Text>
            </Pressable>
          )}
          <Pressable style={[styles.option, styles.cancel]} onPress={onClose}>
            <Text style={styles.optionText}>Cancel</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdropTouchable: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000' },
  container: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: theme.colors.surfaceRaised,
    borderTopLeftRadius: theme.radii.lg,
    borderTopRightRadius: theme.radii.lg,
    paddingBottom: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
  },
  option: {
    paddingVertical: 14,
    paddingHorizontal: theme.spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  cancel: { borderBottomWidth: 0, marginTop: theme.spacing.xs },
  optionText: { color: theme.colors.text, ...theme.type.body, textAlign: 'center' },
  destructive: { color: theme.colors.danger },
})
