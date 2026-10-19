// screens/tab-frame.tsx — the chrome every tab shares: the status strip, then a scroll.
//
// It is a component rather than a layout route because the status strip reads the SESSION and the
// local clock, and a route layout that did the same would make every tab re-render on a tick it
// does not use. One place, one subscription.

import type { ReactNode } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { StatusStrip } from '@/components/status-strip'
import { useTick } from '@/hooks/use-tick'
import { statusLine } from '@/phone/present/live'
import { useSession } from '@/state/session'
import { COLORS, SPACE } from '@/theme'
import type { PhoneStatus } from '@shared/phone/types'

export function TabFrame({ children }: { children: ReactNode }): ReactNode {
  const { channels, status, pairing } = useSession()
  const insets = useSafeAreaInsets()
  const now = useTick()
  const line = statusLine((channels.status ?? null) as PhoneStatus | null)

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <StatusStrip
        name={line.name}
        detail={line.detail}
        status={status}
        paired={pairing !== null}
        now={now}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
      >
        {children}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.ground },
  scroll: { flex: 1 },
  content: { padding: SPACE.md, paddingBottom: SPACE.xxl }
})
