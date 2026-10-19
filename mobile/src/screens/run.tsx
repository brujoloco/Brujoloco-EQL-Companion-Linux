// screens/run.tsx — the instance run: elapsed, kills, named, keys, the reward chest.
//
// `useTick()` is what makes the elapsed clock move: the `run` channel is 0.5 Hz at best and its
// change hash blanks `elapsedMs` on purpose, so a live run's clock is computed here from
// `startedAt` against a local second.

import type { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Chips, Empty, Muted, Panel, Row } from '@/components/ui'
import { useTick } from '@/hooks/use-tick'
import { runView } from '@/phone/present/run'
import { useSession } from '@/state/session'
import { COLORS, SPACE, TYPE } from '@/theme'
import { TabFrame } from './tab-frame'
import type { PhoneRun } from '@shared/phone/types'

export function RunScreen(): ReactNode {
  const { channels } = useSession()
  const now = useTick()
  const view = runView((channels.run ?? null) as PhoneRun | null, now)

  if (view.empty !== null) {
    return (
      <TabFrame>
        <Empty text={view.empty} />
      </TabFrame>
    )
  }

  return (
    <TabFrame>
      <Panel>
        <Text style={styles.zone}>
          {view.title}
          {view.live ? <Text style={styles.liveFlag}> {'·'} live</Text> : null}
        </Text>
        <Chips items={view.stats} />
      </Panel>

      {view.named.length === 0 ? null : (
        <Panel title="Named">
          {view.named.map((row, index) => (
            <Row key={row.key} first={index === 0}>
              <View style={styles.line}>
                <Text style={styles.name} numberOfLines={1}>
                  {row.name}
                </Text>
                <Text style={styles.when}>{row.when}</Text>
              </View>
            </Row>
          ))}
        </Panel>
      )}

      {view.keys.length === 0 ? null : (
        <Panel title="Keys">
          <Chips items={view.keys.map((k) => ({ key: k.key, label: k.name, value: k.count }))} />
        </Panel>
      )}

      {view.chest.length > 0 ? (
        <Panel title="Reward chest">
          <Chips items={view.chest} />
        </Panel>
      ) : view.chestNote === null ? null : (
        <Panel title="Reward chest">
          <Muted>{view.chestNote}</Muted>
        </Panel>
      )}
    </TabFrame>
  )
}

const styles = StyleSheet.create({
  zone: { ...TYPE.h1, marginBottom: SPACE.md },
  liveFlag: { color: COLORS.good, fontSize: 14 },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: SPACE.md, alignItems: 'baseline' },
  name: { ...TYPE.body, flexShrink: 1 },
  when: { ...TYPE.label, fontFamily: 'monospace', fontSize: 12 }
})
