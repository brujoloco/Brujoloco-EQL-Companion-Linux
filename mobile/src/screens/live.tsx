// screens/live.tsx — the fight meter, and the keep-awake toggle.
//
// The screen is a renderer for `liveView(payload)` and nothing else: no formatting, no sorting, no
// arithmetic. That is what `present/live.ts` is for, and it is what makes the meter's two
// different percentages (the bar is a fraction of the TOP ROW, the number is a share of the
// FIGHT) a tested property rather than a comment.

import { useEffect, useState, type ReactNode } from 'react'
import { StyleSheet, Switch, Text, View } from 'react-native'
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake'
import { Bar, Chips, Empty, Panel, Row } from '@/components/ui'
import { liveView } from '@/phone/present/live'
import { useSession } from '@/state/session'
import { COLORS, HIT, SPACE, TYPE } from '@/theme'
import { TabFrame } from './tab-frame'
import type { PhoneFight } from '@shared/phone/types'

const TAG = 'eqzera-live'

function KeepAwake(): ReactNode {
  const { prefs } = useSession()
  const [on, setOn] = useState(prefs.keepAwakeByDefault)

  useEffect(() => {
    if (on) void activateKeepAwakeAsync(TAG)
    else void deactivateKeepAwake(TAG)
    return () => {
      void deactivateKeepAwake(TAG)
    }
  }, [on])

  return (
    <View style={styles.awake}>
      <Text style={styles.awakeLabel}>Keep the screen on</Text>
      <Switch
        value={on}
        onValueChange={setOn}
        accessibilityLabel="Keep the screen on"
        accessibilityHint="Stops the phone sleeping while you watch the meter"
        trackColor={{ false: COLORS.line, true: COLORS.cyan }}
        thumbColor={COLORS.ink}
      />
    </View>
  )
}

export function LiveScreen(): ReactNode {
  const { channels } = useSession()
  const view = liveView((channels.fight ?? null) as PhoneFight | null)

  return (
    <TabFrame>
      {view.empty !== null && view.rows.length === 0 ? (
        <Empty text={view.empty} />
      ) : (
        <>
          <Panel>
            <Text style={styles.mob}>
              {view.title}
              {view.live ? <Text style={styles.liveFlag}> {'·'} live</Text> : null}
            </Text>
            <Chips items={view.stats} />
          </Panel>
          <Panel title="Damage">
            {view.rows.map((row, index) => (
              <Row key={row.key} first={index === 0}>
                <View
                  accessible
                  accessibilityLabel={`${row.name}${row.you ? ', you' : ''}${row.pet ? ', pet' : ''}: ${row.damage} damage, ${row.dps}, ${row.share} of the fight`}
                >
                  <View style={styles.meterHead}>
                    <Text style={[styles.meterName, row.you ? styles.you : null]} numberOfLines={1}>
                      {row.name}
                      {row.pet ? <Text style={styles.petFlag}> pet</Text> : null}
                    </Text>
                    <Text style={styles.meterValue} numberOfLines={1}>
                      {row.damage} {'·'} {row.dps} {'·'} {row.share}
                    </Text>
                  </View>
                  <Bar fill={row.fill} you={row.you} />
                </View>
              </Row>
            ))}
          </Panel>
        </>
      )}
      <KeepAwake />
    </TabFrame>
  )
}

const styles = StyleSheet.create({
  mob: { ...TYPE.h1, marginBottom: SPACE.md },
  liveFlag: { color: COLORS.good, fontSize: 14 },
  meterHead: { flexDirection: 'row', justifyContent: 'space-between', gap: SPACE.md, alignItems: 'baseline' },
  meterName: { ...TYPE.body, flexShrink: 1 },
  you: { color: COLORS.cyan, fontWeight: '700' },
  petFlag: { ...TYPE.label, fontSize: 12 },
  meterValue: { ...TYPE.value, fontSize: 13, color: COLORS.ink2 },
  awake: {
    minHeight: HIT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACE.xs
  },
  awakeLabel: { ...TYPE.body, color: COLORS.ink2 }
})
