// app/_layout.tsx — the root: the session, the dark theme, and the deep link.
//
// `src/app/` is ROUTES ONLY (expo-project-structure). Every file here is a route or a layout, and
// every screen body lives in `src/screens/`.
//
// THE DEEP LINK IS HANDLED HERE, ONCE. `eqzera://pair#…` and — where the Worker serves the two
// well-known files (docs/plans/phone-native.md, section 4) — `https://share.eqzera.com/phone/#…`
// both arrive as a URL. It goes through the SAME `parsePairLink` the camera and the paste field
// use, so a link that opens the app is judged by exactly the rules a scanned one is.

import { useEffect } from 'react'
import { Stack, router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import * as Linking from 'expo-linking'
import { parsePairLink } from '@/phone/pair-link'
import { SessionProvider, useSession } from '@/state/session'
import { COLORS } from '@/theme'

function DeepLinks(): null {
  const { pair } = useSession()

  useEffect(() => {
    let alive = true
    const handle = (url: string | null): void => {
      if (!alive || url === null) return
      const parsed = parsePairLink(url)
      if (!parsed) return
      void pair(parsed).then(() => {
        router.replace('/(tabs)/live')
      })
    }
    void Linking.getInitialURL().then(handle)
    const subscription = Linking.addEventListener('url', ({ url }) => {
      handle(url)
    })
    return () => {
      alive = false
      subscription.remove()
    }
  }, [pair])

  return null
}

export default function RootLayout(): React.ReactNode {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <DeepLinks />
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: COLORS.ground },
            animation: 'fade'
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="pair" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="settings" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        </Stack>
      </SessionProvider>
    </SafeAreaProvider>
  )
}
