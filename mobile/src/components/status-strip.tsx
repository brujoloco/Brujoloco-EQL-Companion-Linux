// components/status-strip.tsx — who, where, and whether anything is arriving.
//
// It is the one piece of chrome above the tabs, and it answers the two questions a person opens
// this app to ask: is this my character, and is it live right now?
//
// THE PILL SAYS WORDS, NOT JUST A COLOUR. `Live` / `Reconnecting` / `Desk offline` /
// `Not connected`, and past five seconds it also says how old the newest frame is — because "the
// meter has not moved" and "nothing is arriving" look identical otherwise, and only one of them
// is a problem.

import type { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { STALE_AFTER_MS } from '@/constants'
import { COLORS, PILL, RADIUS, SPACE, TYPE } from '@/theme'
import type { RelayStatus } from '@/phone/relay'

export type PillKind = keyof typeof PILL

/** Which of the four states the connection is in. The pill's whole logic, and it is testable. */
export function pillKind(status: RelayStatus, paired: boolean): PillKind {
  if (!paired) return 'idle'
  if (!status.open) return 'waiting'
  return status.desk ? 'live' : 'offline'
}

/** `last update 12s ago`, or '' while the newest frame is fresh (or there has never been one). */
export function staleLabel(status: RelayStatus, now: number): string {
  if (status.lastFrameAt === 0) return ''
  const age = now - status.lastFrameAt
  if (age < STALE_AFTER_MS) return ''
  return `last update ${String(Math.round(age / 1000))}s ago`
}

export function StatusStrip({
  name,
  detail,
  status,
  paired,
  now
}: {
  name: string
  detail: string
  status: RelayStatus
  paired: boolean
  now: number
}): ReactNode {
  const kind = pillKind(status, paired)
  const pill = PILL[kind]
  const stale = staleLabel(status, now)
  return (
    <View style={styles.strip}>
      <View style={styles.who}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        {detail === '' ? null : (
          <Text style={styles.detail} numberOfLines={1}>
            {detail}
          </Text>
        )}
      </View>
      <View
        accessible
        accessibilityRole="text"
        accessibilityLabel={stale === '' ? pill.label : `${pill.label}, ${stale}`}
        style={[
          styles.pill,
          { backgroundColor: pill.bg },
          kind === 'offline' ? styles.pillOffline : null
        ]}
      >
        <Text style={[styles.pillText, { color: pill.fg }]}>{pill.label}</Text>
        {stale === '' ? null : <Text style={styles.stale}>{stale}</Text>}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
    backgroundColor: COLORS.ground
  },
  who: { flex: 1, minWidth: 0 },
  name: { ...TYPE.h1, fontSize: 18 },
  detail: { ...TYPE.label, fontFamily: 'monospace' },
  pill: {
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.xs + 1,
    alignItems: 'flex-end'
  },
  pillOffline: { borderColor: COLORS.pink },
  pillText: { fontSize: 11, fontFamily: 'monospace', letterSpacing: 1 },
  stale: { fontSize: 10, fontFamily: 'monospace', color: COLORS.ink3, marginTop: 1 }
})
