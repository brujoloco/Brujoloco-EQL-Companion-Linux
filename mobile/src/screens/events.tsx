// screens/events.tsx — the celebration list, and the one haptic in the app.
//
// A NEW EVENT WHILE THE APP IS IN FRONT OF YOU GETS ONE TICK. Not a sound (the game already makes
// those and the desktop app has a whole alert system for them), not a banner (that is what push is
// for, and it is off by default) — one light impact, once, when the head of the list changes. It
// is watched by ID rather than by length, because the list is capped at thirty and at the cap a
// new event pushes an old one off without the length moving (`newestEventId`).

import { useEffect, useRef, type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { impactAsync, ImpactFeedbackStyle } from 'expo-haptics'
import { Empty, Panel, Row } from '@/components/ui'
import { useTick } from '@/hooks/use-tick'
import { eventsView, newestEventId } from '@/phone/present/events'
import { useSession } from '@/state/session'
import { COLORS, SPACE, TYPE } from '@/theme'
import { TabFrame } from './tab-frame'
import type { PhoneEvent } from '@shared/phone/types'

export function EventsScreen(): ReactNode {
  const { channels } = useSession()
  const now = useTick()
  const events = (channels.events ?? null) as PhoneEvent[] | null
  const view = eventsView(events, now)
  const newest = newestEventId(events)
  const seen = useRef<string | null>(null)

  useEffect(() => {
    // The FIRST list this screen ever sees is not news — it is everything that happened before
    // the app was opened, and buzzing for it would be a lie about what just happened.
    if (seen.current === null) {
      seen.current = newest
      return
    }
    if (newest !== null && newest !== seen.current) {
      seen.current = newest
      void impactAsync(ImpactFeedbackStyle.Light)
    }
  }, [newest])

  if (view.empty !== null) {
    return (
      <TabFrame>
        <Empty text={view.empty} />
      </TabFrame>
    )
  }

  return (
    <TabFrame>
      <Panel title="Recent">
        {view.rows.map((row, index) => (
          <Row key={row.key} first={index === 0}>
            <View accessible accessibilityLabel={`${row.label}: ${row.title}${row.subtitle === '' ? '' : `, ${row.subtitle}`}, ${row.when}`}>
              <View style={styles.head}>
                <Text style={styles.kind}>{row.label}</Text>
                <Text style={styles.when}>{row.when}</Text>
              </View>
              <Text style={styles.title}>{row.title}</Text>
              {row.subtitle === '' ? null : <Text style={styles.subtitle}>{row.subtitle}</Text>}
            </View>
          </Row>
        ))}
      </Panel>
    </TabFrame>
  )
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', gap: SPACE.md, alignItems: 'baseline' },
  kind: { fontFamily: 'monospace', fontSize: 11, letterSpacing: 1, color: COLORS.violet, textTransform: 'uppercase' },
  when: { fontFamily: 'monospace', fontSize: 12, color: COLORS.ink3 },
  title: { ...TYPE.body, marginTop: 2 },
  subtitle: { ...TYPE.label }
})
