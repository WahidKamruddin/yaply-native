import { useEffect } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { theme } from '../../../theme'
import type { DecryptedMessage } from '../types'

const REPLY_THRESHOLD = 64
const REPLY_ICON_MAX_OFFSET = 90

interface Props {
  message: DecryptedMessage
  isMine: boolean
  onReply: () => void
  onLongPress: () => void
}

// Messenger-esque bubble: fades/slides in on mount, and swiping right reveals
// a reply icon that fires onReply past a threshold, springing back either
// way. Own-message bubbles fill with a coral-to-amber gradient; others are
// flat surface color.
export function MessageBubble({ message, isMine, onReply, onLongPress }: Props) {
  const entrance = useSharedValue(0)
  const translateX = useSharedValue(0)
  const replyIconOpacity = useSharedValue(0)

  useEffect(() => {
    entrance.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.quad) })
    // entrance is a Reanimated shared value — stable across renders, safe to
    // omit from deps without re-triggering the animation on every re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pan = Gesture.Pan()
    .activeOffsetX([-1000, 10])
    .failOffsetY([-12, 12])
    .onUpdate((e) => {
      const dx = Math.max(0, e.translationX)
      translateX.value = Math.min(dx, REPLY_ICON_MAX_OFFSET)
      replyIconOpacity.value = Math.min(dx / REPLY_THRESHOLD, 1)
    })
    .onEnd((e) => {
      const dx = Math.max(0, e.translationX)
      if (dx >= REPLY_THRESHOLD) {
        runOnJS(onReply)()
      }
      translateX.value = withSpring(0, { damping: 18, stiffness: 220 })
      replyIconOpacity.value = withTiming(0, { duration: 150 })
    })

  const bubbleStyle = useAnimatedStyle(() => ({
    opacity: entrance.value,
    transform: [{ translateY: (1 - entrance.value) * 8 }, { translateX: translateX.value }],
  }))

  const replyIconStyle = useAnimatedStyle(() => ({
    opacity: replyIconOpacity.value,
    transform: [{ scale: 0.6 + replyIconOpacity.value * 0.4 }],
  }))

  return (
    <View style={[styles.row, isMine ? styles.rowMine : styles.rowTheirs]}>
      <Animated.View pointerEvents="none" style={[styles.replyIcon, replyIconStyle]}>
        <Text style={styles.replyIconText}>↩</Text>
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.bubbleWrapper, bubbleStyle]}>
          <BubbleContent message={message} isMine={isMine} onLongPress={onLongPress} />
        </Animated.View>
      </GestureDetector>
    </View>
  )
}

function BubbleContent({
  message,
  isMine,
  onLongPress,
}: {
  message: DecryptedMessage
  isMine: boolean
  onLongPress: () => void
}) {
  const longPress = Gesture.LongPress()
    .minDuration(350)
    .onStart(() => runOnJS(onLongPress)())

  const text = message.decryptFailed ? "Couldn't decrypt this message" : message.content
  const time = new Date(message.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

  const inner = (
    <View style={styles.bubbleInner}>
      <Text style={[styles.bubbleText, isMine && styles.bubbleTextMine]}>{text}</Text>
      <Text style={[styles.timestamp, isMine && styles.timestampMine]}>{time}</Text>
    </View>
  )

  return (
    <GestureDetector gesture={longPress}>
      {isMine ? (
        <LinearGradient
          colors={theme.gradient.bubbleOwn}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.bubble, styles.bubbleMine]}
        >
          {inner}
        </LinearGradient>
      ) : (
        <View style={[styles.bubble, styles.bubbleTheirs]}>{inner}</View>
      )}
    </GestureDetector>
  )
}

const styles = StyleSheet.create({
  row: { marginVertical: 3, flexDirection: 'row', alignItems: 'center' },
  rowMine: { justifyContent: 'flex-end' },
  rowTheirs: { justifyContent: 'flex-start' },
  bubbleWrapper: { maxWidth: '100%' },
  replyIcon: {
    position: 'absolute',
    left: theme.spacing.sm,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  replyIconText: { color: theme.colors.accentSoft, fontSize: 14 },
  bubble: { maxWidth: 280, borderRadius: theme.radii.bubble, overflow: 'hidden' },
  bubbleMine: {},
  bubbleTheirs: { backgroundColor: theme.colors.bubbleOther },
  bubbleInner: { paddingHorizontal: 14, paddingVertical: 8 },
  bubbleText: { color: theme.colors.text, ...theme.type.body },
  bubbleTextMine: { color: '#1a0f0c' },
  timestamp: { color: theme.colors.textMuted, ...theme.type.caption, marginTop: 2, alignSelf: 'flex-end' },
  timestampMine: { color: 'rgba(26,15,12,0.6)' },
})
