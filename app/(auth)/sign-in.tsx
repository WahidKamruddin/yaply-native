import { StyleSheet, Text, View } from 'react-native'
import { theme } from '../../src/theme'

export default function SignIn() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Sign in — placeholder (Phase 2)</Text>
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
