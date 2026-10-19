// components/ui.tsx — the six pieces every tab is built from.
//
// One file rather than six, because each is ten to thirty lines and splitting them would make the
// import list longer than the components. Every one of them is a pure function of props: nothing
// here reads the session, fetches, or knows which tab it is on.
//
// ACCESSIBILITY IS PART OF THE COMPONENT, NOT A PASS AFTERWARDS. Every pressable declares its
// role and its label, every pressable clears `HIT` (44pt), no text is locked against the OS text
// size, and nothing carries meaning in colour alone — the connection pill has words, an open
// respawn window says "up", and a meter row prints its own numbers beside its bar.

import type { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View, type DimensionValue } from 'react-native'
import { COLORS, HIT, RADIUS, SPACE, TYPE } from '@/theme'

export function Panel({ title, children }: { title?: string; children: ReactNode }): ReactNode {
  return (
    <View style={styles.panel}>
      {title === undefined ? null : <Text style={styles.section}>{title}</Text>}
      {children}
    </View>
  )
}

export function Muted({ children }: { children: ReactNode }): ReactNode {
  return <Text style={styles.muted}>{children}</Text>
}

/** An empty STATE, which is a sentence, not an error. */
export function Empty({ text }: { text: string }): ReactNode {
  return (
    <Panel>
      <Muted>{text}</Muted>
    </Panel>
  )
}

/** The chip row: a label and a value, wrapping. Used for every "stats" block in the app. */
export function Chips({ items }: { items: { key: string; label: string; value: string }[] }): ReactNode {
  if (items.length === 0) return null
  return (
    <View style={styles.chips}>
      {items.map((item) => (
        <View key={item.key} style={styles.chip} accessible accessibilityLabel={`${item.label}: ${item.value}`}>
          <Text style={styles.chipLabel}>{item.label}</Text>
          <Text style={styles.chipValue}>{item.value}</Text>
        </View>
      ))}
    </View>
  )
}

/** A row in a list, with the hairline rule above it that the share page uses. */
export function Row({ first, children }: { first?: boolean | undefined; children: ReactNode }): ReactNode {
  return <View style={[styles.row, first === true ? styles.rowFirst : null]}>{children}</View>
}

/** A button. `tone` picks the one accent; everything else is the ghost. */
export function Button({
  label,
  onPress,
  tone = 'ghost',
  hint
}: {
  label: string
  onPress: () => void
  tone?: 'accent' | 'ghost' | 'danger' | undefined
  hint?: string | undefined
}): ReactNode {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      style={({ pressed }) => [
        styles.button,
        tone === 'accent' ? styles.buttonAccent : tone === 'danger' ? styles.buttonDanger : styles.buttonGhost,
        pressed ? styles.pressed : null
      ]}
    >
      <Text style={[styles.buttonText, tone === 'accent' ? styles.buttonTextAccent : null]}>{label}</Text>
    </Pressable>
  )
}

/** A bar. It is drawn beside its own numbers, never instead of them. */
export function Bar({ fill, you }: { fill: number; you: boolean }): ReactNode {
  // `DimensionValue` is `\`${number}%\``, so the number has to reach the template as a NUMBER —
  // a `String()` around it widens the type to `${string}%` and stops type-checking the unit.
  const percent = Math.round(Math.min(1, Math.max(0, fill)) * 100)
  const width: DimensionValue = `${percent}%`
  return (
    <View style={styles.track} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.fill, you ? styles.fillYou : null, { width }]} />
    </View>
  )
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: COLORS.panel,
    borderColor: COLORS.line,
    borderWidth: 1,
    borderRadius: RADIUS.lg,
    padding: SPACE.lg,
    marginBottom: SPACE.md
  },
  section: { ...TYPE.section, marginBottom: SPACE.md },
  muted: { ...TYPE.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  chip: {
    flexDirection: 'row',
    gap: SPACE.sm,
    backgroundColor: COLORS.ground2,
    borderColor: COLORS.line,
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingVertical: SPACE.xs + 2,
    paddingHorizontal: SPACE.md - 2
  },
  chipLabel: { ...TYPE.label },
  chipValue: { ...TYPE.value },
  row: { paddingVertical: SPACE.sm, borderTopWidth: 1, borderTopColor: COLORS.line },
  rowFirst: { borderTopWidth: 0 },
  button: {
    minHeight: HIT,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACE.xl,
    borderRadius: RADIUS.md
  },
  buttonAccent: { backgroundColor: COLORS.cyan },
  buttonGhost: { borderWidth: 1, borderColor: COLORS.line, backgroundColor: 'transparent' },
  buttonDanger: { borderWidth: 1, borderColor: COLORS.pink, backgroundColor: 'transparent' },
  buttonText: { fontSize: 15, fontWeight: '700', color: COLORS.ink2 },
  buttonTextAccent: { color: COLORS.ground },
  pressed: { opacity: 0.75 },
  track: {
    height: 7,
    borderRadius: 4,
    backgroundColor: COLORS.ground2,
    borderWidth: 1,
    borderColor: COLORS.line,
    overflow: 'hidden',
    marginTop: SPACE.xs
  },
  fill: { height: '100%', backgroundColor: COLORS.pink },
  fillYou: { backgroundColor: COLORS.cyan }
})
