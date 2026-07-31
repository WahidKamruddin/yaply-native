import { StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { theme } from '../../src/theme'

export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Chat {id} — placeholder (Phase 2)</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { color: theme.colors.text },
})
