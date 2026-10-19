// app/index.tsx — the only decision the router makes: paired, or not yet.
//
// It waits for `ready` rather than guessing, because the vault read is async and a flash of the
// Pair screen on every launch of a paired app is the sort of thing people describe as "it logged
// me out again".

import { Redirect } from 'expo-router'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { useSession } from '@/state/session'
import { COLORS } from '@/theme'

export default function Index(): React.ReactNode {
  const { ready, pairing } = useSession()
  if (!ready) {
    return (
      <View style={styles.wait}>
        <ActivityIndicator color={COLORS.cyan} />
      </View>
    )
  }
  return <Redirect href={pairing === null ? '/pair' : '/(tabs)/live'} />
}

const styles = StyleSheet.create({
  wait: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.ground }
})
