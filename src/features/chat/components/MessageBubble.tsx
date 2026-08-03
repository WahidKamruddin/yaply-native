import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
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
import { useAppTheme } from '../../../theme/ThemeProvider'
import type { DecryptedMessage } from '../types'

const REPLY_THRESHOLD = 64
const REPLY_ICON_MAX_OFFSET = 90

// What MessageBubble needs to know about the message being replied to —
// resolved by the chat screen (which already has the full decrypted list)
// and passed down, since the bubble itself only knows its own content.
export interface ReplyPreview {
  senderLabel: string
  text: string
  isDeleted: boolean
}

interface Props {
  message: DecryptedMessage
  isMine: boolean
  replyPreview?: ReplyPreview | null
  onReply: () => void
  onLongPress: () => void
  onPressReplyQuote?: () => void
}

// Fades/slides in on mount; swiping right reveals a reply icon that fires
// onReply past a threshold, springing back either way (mobile-idiomatic —
// web's equivalent is a desktop right-click, which doesn't translate).
// Bubble shape/color otherwise matches web exactly: rounded-2xl with the
// sender-side corner squashed into a "tail," primary->primary-dark gradient
// on own messages, flat card+border-soft on others.
export function MessageBubble({ message, isMine, replyPreview, onReply, onLongPress, onPressReplyQuote }: Props) {
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

  const { colors } = useAppTheme()

  return (
    <View style={[styles.row, isMine ? styles.rowMine : styles.rowTheirs]}>
      <Animated.View pointerEvents="none" style={[styles.replyIcon, replyIconStyle, { backgroundColor: colors.card }]}>
        <Text style={[styles.replyIconText, { color: colors.primaryText }]}>↩</Text>
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.bubbleWrapper, bubbleStyle, isMine ? styles.wrapperMine : styles.wrapperTheirs]}>
          {replyPreview && (
            <ReplyQuote preview={replyPreview} isMine={isMine} onPress={onPressReplyQuote} />
          )}
          <BubbleContent message={message} isMine={isMine} onLongPress={onLongPress} />
        </Animated.View>
      </GestureDetector>
    </View>
  )
}

function ReplyQuote({ preview, isMine, onPress }: { preview: ReplyPreview; isMine: boolean; onPress?: () => void }) {
  const { colors, radii, type } = useAppTheme()
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.replyQuote,
        {
          backgroundColor: colors.primaryTint,
          borderColor: colors.border,
          borderRadius: radii.bubble,
          alignSelf: isMine ? 'flex-end' : 'flex-start',
        },
      ]}
    >
      <View style={[styles.replyQuoteBar, { backgroundColor: colors.primary }]} />
      <View style={styles.replyQuoteText}>
        <Text style={[styles.replyQuoteSender, { color: colors.primaryText, ...type.caption, fontWeight: '600' }]} numberOfLines={1}>
          {preview.senderLabel}
        </Text>
        <Text
          style={[
            styles.replyQuotePreview,
            { color: colors.textSubtle, ...type.caption },
            preview.isDeleted && styles.replyQuoteDeleted,
          ]}
          numberOfLines={1}
        >
          {preview.isDeleted ? 'Message deleted' : preview.text}
        </Text>
      </View>
    </Pressable>
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
  const { colors, radii, type } = useAppTheme()
  const [showTime, setShowTime] = useState(false)
  const longPress = Gesture.LongPress()
    .minDuration(350)
    .onStart(() => runOnJS(onLongPress)())

  const text = message.decryptFailed ? "Couldn't decrypt this message" : message.content
  const time = new Date(message.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

  // Three corners at the full bubble radius, sender-side corner squashed to
  // a small "tail" — matches web's rounded-2xl + rounded-br-sm/rounded-bl-sm.
  const shapeStyle = isMine
    ? { borderTopLeftRadius: radii.bubble, borderTopRightRadius: radii.bubble, borderBottomLeftRadius: radii.bubble, borderBottomRightRadius: radii.bubbleTail }
    : { borderTopLeftRadius: radii.bubble, borderTopRightRadius: radii.bubble, borderBottomRightRadius: radii.bubble, borderBottomLeftRadius: radii.bubbleTail }

  const inner = (
    <Pressable onPress={() => setShowTime((v) => !v)} style={[styles.bubbleInner, { paddingHorizontal: 14, paddingVertical: 8 }]}>
      <Text style={[styles.bubbleText, { ...type.body }, isMine ? styles.bubbleTextMine : { color: colors.text }]}>{text}</Text>
      {showTime && (
        <Text
          style={[
            styles.timestamp,
            { ...type.caption, marginTop: 2, alignSelf: 'flex-end' },
            isMine ? styles.timestampMine : { color: colors.textSubtle },
          ]}
        >
          {time}
        </Text>
      )}
    </Pressable>
  )

  return (
    <GestureDetector gesture={longPress}>
      {isMine ? (
        <LinearGradient
          colors={[colors.primary, colors.primaryDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.bubble, shapeStyle]}
        >
          {inner}
        </LinearGradient>
      ) : (
        <View style={[styles.bubble, shapeStyle, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.borderSoft }]}>
          {inner}
        </View>
      )}
    </GestureDetector>
  )
}

const styles = StyleSheet.create({
  row: { marginVertical: 3, flexDirection: 'row', alignItems: 'flex-end' },
  rowMine: { justifyContent: 'flex-end' },
  rowTheirs: { justifyContent: 'flex-start' },
  bubbleWrapper: { maxWidth: '65%' },
  wrapperMine: { alignItems: 'flex-end' },
  wrapperTheirs: { alignItems: 'flex-start' },
  replyIcon: {
    position: 'absolute',
    left: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  replyIconText: { fontSize: 14 },
  bubble: { overflow: 'hidden' },
  bubbleInner: {},
  bubbleText: {},
  bubbleTextMine: { color: '#ffffff' },
  timestamp: {},
  timestampMine: { color: 'rgba(255,255,255,0.7)' },
  replyQuote: { flexDirection: 'row', alignItems: 'stretch', maxWidth: 220, marginBottom: 4, borderWidth: 1 },
  replyQuoteBar: { width: 2, borderRadius: 1, marginVertical: 8, marginLeft: 8 },
  replyQuoteText: { paddingVertical: 8, paddingRight: 12, paddingLeft: 8, minWidth: 0, flexShrink: 1 },
  replyQuoteSender: { marginBottom: 2 },
  replyQuotePreview: {},
  replyQuoteDeleted: { fontStyle: 'italic' },
})
