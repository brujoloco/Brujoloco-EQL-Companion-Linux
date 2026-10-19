// screens/character.tsx — THE TAB THE APP IS NAMED AFTER.
//
// "Carry your character with you on your phone" is this screen, and the property that makes the
// sentence true is not here: it is `state/session.tsx` loading the carried payload out of the
// vault BEFORE any socket is attempted (ruling 8). This screen never knows whether what it is
// drawing arrived a second ago or three days ago on a train with no signal — which is the point.
//
// Tapping a slot opens the item's facts as a SHEET. Everything in it comes from
// `present/character.ts itemFacts`; the only thing this file decides is what a sheet looks like.

import { useState, type ReactNode } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Button, Chips, Empty, Muted, Panel, Row } from '@/components/ui'
import { asProfile } from '@/phone/character-types'
import { characterView, itemFacts, type GearRow } from '@/phone/present/character'
import { useSession } from '@/state/session'
import { COLORS, HIT, RADIUS, SPACE, TYPE } from '@/theme'
import { TabFrame } from './tab-frame'

function Rank({ text }: { text: string }): ReactNode {
  return <Text style={styles.rank}>{` ${text} `}</Text>
}

function ItemSheet({ row, onClose }: { row: GearRow; onClose: () => void }): ReactNode {
  const insets = useSafeAreaInsets()
  const facts = itemFacts(row.cell)
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.sheet, { paddingTop: insets.top + SPACE.md, paddingBottom: insets.bottom + SPACE.lg }]}>
        <ScrollView contentContainerStyle={styles.sheetBody}>
          <Text style={styles.sheetSlot}>{row.slot}</Text>
          <Text style={styles.sheetTitle}>
            {facts.title}
            {facts.rank === null ? null : <Rank text={facts.rank} />}
          </Text>

          {facts.flags.length === 0 ? null : (
            <View style={styles.flags}>
              {facts.flags.map((flag) => (
                <Text key={flag} style={styles.flag}>
                  {flag}
                </Text>
              ))}
            </View>
          )}

          {facts.unknownNote === null ? null : (
            <View style={styles.note}>
              <Muted>{facts.unknownNote}</Muted>
            </View>
          )}

          {facts.numbers.length === 0 ? null : (
            <Panel title="Reads">
              <Chips items={facts.numbers} />
            </Panel>
          )}
          {facts.stats.length === 0 ? null : (
            <Panel title="Stats">
              <Chips items={facts.stats} />
            </Panel>
          )}
          {facts.effects.length === 0 ? null : (
            <Panel title="Effects">
              {facts.effects.map((fx, index) => (
                <Row key={fx.key} first={index === 0}>
                  <Text style={styles.body}>{fx.name}</Text>
                  <Text style={styles.detail}>{fx.detail}</Text>
                </Row>
              ))}
            </Panel>
          )}
          {facts.exaltations.length === 0 && facts.ornament === null ? null : (
            <Panel title="Sockets">
              {facts.exaltations.length === 0 ? null : (
                <Text style={styles.exalt}>{facts.exaltations.join(' · ')}</Text>
              )}
              {facts.ornament === null ? null : (
                <Text style={styles.detail}>Ornament: {facts.ornament}</Text>
              )}
            </Panel>
          )}
        </ScrollView>
        <Button label="Close" onPress={onClose} tone="accent" />
      </View>
    </Modal>
  )
}

export function CharacterScreen(): ReactNode {
  const { channels } = useSession()
  const [open, setOpen] = useState<GearRow | null>(null)
  const view = characterView(asProfile(channels.character ?? null))

  if (view.empty !== null && view.gear.length === 0) {
    return (
      <TabFrame>
        <Empty text={view.empty} />
      </TabFrame>
    )
  }

  return (
    <TabFrame>
      <Panel>
        <Text style={styles.name}>{view.name}</Text>
        {view.detail === '' ? null : <Muted>{view.detail}</Muted>}
      </Panel>

      <Panel title="Character with gear">
        <Chips items={view.totals} />
        {view.saves.length === 0 ? null : (
          <View style={styles.block}>
            <Chips items={view.saves} />
          </View>
        )}
        {view.unsummed.length === 0 ? null : (
          <View style={styles.block}>
            <Chips items={view.unsummed} />
          </View>
        )}
        <View style={styles.block}>
          <Muted>{view.coverage}</Muted>
        </View>
      </Panel>

      {view.scores.length === 0 ? null : (
        <Panel title="Build">
          <Chips items={view.scores} />
        </Panel>
      )}

      <Panel title="Worn gear">
        {view.gear.map((row, index) => (
          <Row key={row.key} first={index === 0}>
            <Pressable
              onPress={() => {
                if (row.hasFacts) setOpen(row)
              }}
              disabled={!row.hasFacts}
              accessibilityRole="button"
              accessibilityLabel={`${row.slot}: ${row.name}${row.rank === null ? '' : ` ${row.rank}`}`}
              accessibilityHint={row.hasFacts ? 'Opens what this item reads' : undefined}
              style={({ pressed }) => [styles.gear, pressed ? styles.pressed : null]}
            >
              <Text style={styles.slot}>{row.slot}</Text>
              <View style={styles.gearBody}>
                <Text style={styles.item}>
                  {row.name}
                  {row.rank === null ? null : <Rank text={row.rank} />}
                </Text>
                {row.exaltations === '' ? null : <Text style={styles.exalt}>{row.exaltations}</Text>}
                {row.ornament === null ? null : <Text style={styles.detail}>Ornament: {row.ornament}</Text>}
                {row.known ? null : <Text style={styles.detail}>Not in this app{'’'}s item list</Text>}
              </View>
            </Pressable>
          </Row>
        ))}
      </Panel>

      {open === null ? null : (
        <ItemSheet
          row={open}
          onClose={() => {
            setOpen(null)
          }}
        />
      )}
    </TabFrame>
  )
}

const styles = StyleSheet.create({
  name: { ...TYPE.h1 },
  block: { marginTop: SPACE.md },
  gear: { flexDirection: 'row', gap: SPACE.md, minHeight: HIT, alignItems: 'center' },
  gearBody: { flex: 1, minWidth: 0 },
  pressed: { opacity: 0.7 },
  slot: { ...TYPE.label, fontFamily: 'monospace', width: 92 },
  item: { ...TYPE.body },
  exalt: { fontSize: 13, color: COLORS.violet },
  detail: { ...TYPE.label, fontSize: 12 },
  body: { ...TYPE.body },
  rank: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: COLORS.ground,
    backgroundColor: COLORS.sun,
    borderRadius: RADIUS.pill,
    overflow: 'hidden'
  },
  sheet: { flex: 1, backgroundColor: COLORS.ground, paddingHorizontal: SPACE.lg },
  sheetBody: { paddingBottom: SPACE.lg },
  sheetSlot: { ...TYPE.section, color: COLORS.ink3 },
  sheetTitle: { ...TYPE.h1, marginBottom: SPACE.md },
  flags: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.xs, marginBottom: SPACE.md },
  flag: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: COLORS.violet,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACE.sm,
    paddingVertical: 2
  },
  note: { marginBottom: SPACE.md }
})
