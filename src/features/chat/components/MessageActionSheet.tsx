import { useEffect } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { BlurView } from 'expo-blur'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { useAppTheme } from '../../../theme/ThemeProvider'

interface Props {
  visible: boolean
  canDelete: boolean
  onReply: () => void
  onDelete: () => void
  onClose: () => void
}

// Bottom sheet (mobile-idiomatic — web's equivalent is a desktop right-click
// context menu, which doesn't translate directly) restyled to web's actual
// card/border/shadow tokens rather than a native Alert.
export function MessageActionSheet({ visible, canDelete, onReply, onDelete, onClose }: Props) {
  const { colors, spacing, radii, type, mode } = useAppTheme()
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
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <BlurView intensity={20} tint={mode} style={StyleSheet.absoluteFill} />
        </Animated.View>
      </Pressable>
      <View style={styles.container} pointerEvents="box-none">
        <Animated.View
          style={[
            sheetStyle,
            {
              backgroundColor: colors.card,
              borderTopLeftRadius: radii.lg,
              borderTopRightRadius: radii.lg,
              borderWidth: 1,
              borderBottomWidth: 0,
              borderColor: colors.border,
              paddingBottom: spacing.lg,
              paddingTop: spacing.sm,
              shadowColor: '#000',
              shadowOpacity: 0.5,
              shadowRadius: 24,
              shadowOffset: { width: 0, height: -4 },
              elevation: 12,
            },
          ]}
        >
          <Pressable style={[styles.option, { paddingHorizontal: spacing.lg, borderBottomColor: colors.borderSoft }]} onPress={onReply}>
            <Text style={[styles.optionText, { color: colors.text, ...type.body }]}>Reply</Text>
          </Pressable>
          {canDelete && (
            <Pressable style={[styles.option, { paddingHorizontal: spacing.lg, borderBottomColor: colors.borderSoft }]} onPress={onDelete}>
              <Text style={[styles.optionText, { color: colors.danger, ...type.body }]}>Delete</Text>
            </Pressable>
          )}
          <Pressable
            style={[styles.option, styles.cancel, { paddingHorizontal: spacing.lg, marginTop: spacing.xs }]}
            onPress={onClose}
          >
            <Text style={[styles.optionText, { color: colors.textMuted, ...type.body }]}>Cancel</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdropTouchable: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000', overflow: 'hidden' },
  container: { flex: 1, justifyContent: 'flex-end' },
  option: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  cancel: { borderBottomWidth: 0 },
  optionText: { textAlign: 'center' },
})
