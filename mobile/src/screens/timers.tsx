// screens/timers.tsx — respawns and your buffs, counting locally between frames.
//
// EVERY CLOCK ON THIS SCREEN IS LOCAL. `useTick()` re-renders once a second and `timersView` is
// recomputed against that second, so a respawn window opens and a buff runs out on time even when
// the desktop has sent nothing for minutes — which, because a channel is only sent when its
// content hash moves, is the normal case rather than the failure case.

import type { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Empty, Panel, Row } from '@/components/ui'
import { useTick } from '@/hooks/use-tick'
import { timersView, type TimerRow } from '@/phone/present/timers'
import { useSession } from '@/state/session'
import { COLORS, SPACE, TYPE } from '@/theme'
import { TabFrame } from './tab-frame'
import type { PhoneBuff, PhoneRespawn } from '@shared/phone/types'

function TimerLine({ row, first }: { row: TimerRow; first: boolean }): ReactNode {
  // The label spells out what the styling says, so a screen reader gets the same fact.
  const spoken = row.permanent
    ? `${row.name}, no timer`
    : row.open
      ? `${row.name}, window open for ${row.time}`
      : row.up
        ? `${row.name}, ${row.time} elapsed`
        : `${row.name}, ${row.time} remaining`
  return (
    <Row first={first}>
      <View accessible accessibilityLabel={row.detail === '' ? spoken : `${spoken}, ${row.detail}`}>
        <View style={styles.line}>
          <Text style={styles.name} numberOfLines={1}>
            {row.name}
          </Text>
          <Text style={[styles.time, row.open ? styles.open : null, row.permanent ? styles.dim : null]}>
            {row.open ? 'up ' : row.up ? '+' : ''}
            {row.time}
          </Text>
        </View>
        {row.detail === '' ? null : <Text style={styles.detail}>{row.detail}</Text>}
      </View>
    </Row>
  )
}

export function TimersScreen(): ReactNode {
  const { channels } = useSession()
  const now = useTick()
  const view = timersView(
    (channels.respawns ?? null) as PhoneRespawn[] | null,
    (channels.buffs ?? null) as PhoneBuff[] | null,
    now
  )

  return (
    <TabFrame>
      {view.respawnsEmpty === null ? (
        <Panel title="Respawns">
          {view.respawns.map((row, index) => (
            <TimerLine key={row.key} row={row} first={index === 0} />
          ))}
        </Panel>
      ) : (
        <Empty text={view.respawnsEmpty} />
      )}

      {view.buffsEmpty === null ? (
        <Panel title="Your buffs">
          {view.buffs.map((row, index) => (
            <TimerLine key={row.key} row={row} first={index === 0} />
          ))}
        </Panel>
      ) : (
        <Empty text={view.buffsEmpty} />
      )}
    </TabFrame>
  )
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: SPACE.md, alignItems: 'baseline' },
  name: { ...TYPE.body, flexShrink: 1 },
  time: { ...TYPE.value, fontSize: 15 },
  open: { color: COLORS.pink },
  dim: { color: COLORS.ink3 },
  detail: { ...TYPE.label, marginTop: 2 }
})
