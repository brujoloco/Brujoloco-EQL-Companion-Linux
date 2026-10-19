// app/(tabs)/_layout.tsx — the five tabs, and the way into Settings.
//
// The order is the order a person needs them in during a pull: what is happening now, what this
// run has been, what is about to come up, who you are, and what just happened.
//
// No icon library. The labels ARE the affordance at this size, and a five-icon set that is not
// the platform's own reads as a web page in a shell — which is the thing this app exists not to
// be. The tab bar carries the app's own colours and the platform's own behaviour.

import { Redirect, Tabs, router } from 'expo-router'
import { Pressable, StyleSheet, Text } from 'react-native'
import { useSession } from '@/state/session'
import { COLORS, HIT, SPACE } from '@/theme'

function SettingsButton(): React.ReactNode {
  return (
    <Pressable
      onPress={() => {
        router.push('/settings')
      }}
      accessibilityRole="button"
      accessibilityLabel="Settings"
      style={({ pressed }) => [styles.gear, pressed ? styles.pressed : null]}
      hitSlop={SPACE.md}
    >
      <Text style={styles.gearText}>Settings</Text>
    </Pressable>
  )
}

export default function TabsLayout(): React.ReactNode {
  const { ready, pairing } = useSession()
  if (ready && pairing === null) return <Redirect href="/pair" />

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: COLORS.ground },
        tabBarActiveTintColor: COLORS.cyan,
        tabBarInactiveTintColor: COLORS.ink3,
        tabBarStyle: { backgroundColor: COLORS.ground2, borderTopColor: COLORS.line },
        tabBarLabelStyle: { fontSize: 12, letterSpacing: 0.5 },
        tabBarIconStyle: { display: 'none' }
      }}
    >
      <Tabs.Screen name="live" options={{ title: 'Live', headerShown: true, headerTransparent: true, headerTitle: '', headerRight: SettingsButton }} />
      <Tabs.Screen name="run" options={{ title: 'Run' }} />
      <Tabs.Screen name="timers" options={{ title: 'Timers' }} />
      <Tabs.Screen name="character" options={{ title: 'Character' }} />
      <Tabs.Screen name="events" options={{ title: 'Events' }} />
    </Tabs>
  )
}

const styles = StyleSheet.create({
  gear: { minHeight: HIT, justifyContent: 'center', paddingHorizontal: SPACE.lg },
  gearText: { color: COLORS.ink3, fontSize: 13 },
  pressed: { opacity: 0.7 }
})
