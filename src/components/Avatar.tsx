import { Image, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useAppTheme } from '../theme/ThemeProvider'

interface Props {
  uri?: string | null
  size: number
  online?: boolean
}

// RN port of web's src/components/Avatar.tsx: flat tint-strong circle, no
// photo → centered person-silhouette icon (never initials, never a
// per-user/per-conversation color — that was Phase 4's colorForConversation,
// removed to match web exactly). Optional online-dot overlay with a cutout
// ring matching the surrounding surface.
export function Avatar({ uri, size, online }: Props) {
  const { colors } = useAppTheme()

  return (
    <View style={{ width: size, height: size, borderRadius: size / 2 }}>
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          resizeMode="cover"
        />
      ) : (
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: colors.tintStrong,
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          <Feather name="user" size={Math.round(size * 0.55)} color={colors.textSubtle} />
        </View>
      )}
      {online !== undefined && (
        // Fixed 10px regardless of avatar size, matching web's `w-2.5 h-2.5`.
        <View
          style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            width: 10,
            height: 10,
            borderRadius: 5,
            borderWidth: 2,
            borderColor: colors.surface,
            backgroundColor: online ? colors.online : colors.offline,
          }}
        />
      )}
    </View>
  )
}
