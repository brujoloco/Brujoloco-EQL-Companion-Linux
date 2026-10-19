// screens/settings.tsx — the paired PC, the notification switches, and the plain sentence.
//
// RULING 7 IS ENFORCED BY LAYOUT HERE, not by good intentions: `NOTIFICATION_PRIVACY` is rendered
// ABOVE the switches, always, with no disclosure triangle and no way to dismiss it. A person
// cannot turn one of these on without having been told what it costs.

import { useState, type ReactNode } from 'react'
import { Alert, Linking, ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Constants from 'expo-constants'
import { Button, Muted, Panel, Row } from '@/components/ui'
import { LINKS } from '@/constants'
import { maskRoomId } from '@/phone/pair-link'
import { vault } from '@/phone/native-store'
import { applyKinds, NOTIFICATION_PRIVACY } from '@/notifications/push'
import { PUSH_KIND_LABEL, PUSH_KINDS } from '@/settings/prefs'
import { useSession } from '@/state/session'
import { COLORS, HIT, SPACE, TYPE } from '@/theme'

function LinkRow({ label, url, first }: { label: string; url: string; first?: boolean | undefined }): ReactNode {
  return (
    <Row first={first}>
      <Button
        label={label}
        onPress={() => {
          void Linking.openURL(url)
        }}
        hint="Opens in your browser"
      />
    </Row>
  )
}

function Notifications(): ReactNode {
  const { push, setPush } = useSession()
  const [busy, setBusy] = useState(false)

  const toggle = (kind: string, on: boolean): void => {
    if (busy) return
    setBusy(true)
    const wanted = on ? [...push.kinds, kind] : push.kinds.filter((k) => k !== kind)
    void applyKinds(push, wanted)
      .then(async (next) => {
        setPush(next)
        // The token and its kinds travel TOGETHER, in the keystore — they are one registration.
        await vault.savePush(next.token === null ? null : { token: next.token, kinds: next.kinds })
      })
      .finally(() => {
        setBusy(false)
      })
  }

  return (
    <Panel title="Notifications">
      <Muted>{NOTIFICATION_PRIVACY}</Muted>
      <View style={styles.gap} />
      {PUSH_KINDS.map((kind, index) => {
        const label = PUSH_KIND_LABEL[kind]
        if (!label) return null
        const on = push.kinds.includes(kind)
        return (
          <Row key={kind} first={index === 0}>
            <View style={styles.switchRow}>
              <View style={styles.switchText}>
                <Text style={styles.switchTitle}>{label.title}</Text>
                <Text style={styles.switchDetail}>{label.detail}</Text>
              </View>
              <Switch
                value={on}
                disabled={busy}
                onValueChange={(next) => {
                  toggle(kind, next)
                }}
                accessibilityLabel={label.title}
                accessibilityHint={label.detail}
                trackColor={{ false: COLORS.line, true: COLORS.cyan }}
                thumbColor={COLORS.ink}
              />
            </View>
          </Row>
        )
      })}
      {push.note === null ? null : (
        <View style={styles.gap}>
          <Text style={styles.note}>{push.note}</Text>
        </View>
      )}
    </Panel>
  )
}

export function SettingsScreen(): ReactNode {
  const { pairing, prefs, setPrefs, forget } = useSession()
  const insets = useSafeAreaInsets()
  const version = Constants.expoConfig?.version ?? '1.0.0'

  const confirmForget = (): void => {
    Alert.alert(
      'Forget this PC?',
      'This deletes the pairing, the key and the character kept on this phone. You can pair again by scanning a new code.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Forget', style: 'destructive', onPress: () => void forget() }
      ]
    )
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + SPACE.lg, paddingBottom: insets.bottom + SPACE.xxl }]}
    >
      <Text style={styles.title}>Settings</Text>

      <Panel title="Paired PC">
        {pairing === null ? (
          <Muted>Not paired yet.</Muted>
        ) : (
          <>
            <Text style={styles.room}>{maskRoomId(pairing.roomId)}</Text>
            <Muted>
              Everything this app shows was encrypted on that PC. The relay passes it along and
              cannot read it.
            </Muted>
            <View style={styles.gap} />
            <Button label="Forget this PC" tone="danger" onPress={confirmForget} hint="Deletes the pairing and the saved character" />
          </>
        )}
      </Panel>

      <Notifications />

      <Panel title="Live tab">
        <View style={styles.switchRow}>
          <View style={styles.switchText}>
            <Text style={styles.switchTitle}>Keep the screen on by default</Text>
            <Text style={styles.switchDetail}>Turns the Live tab{'’'}s toggle on when you open it.</Text>
          </View>
          <Switch
            value={prefs.keepAwakeByDefault}
            onValueChange={(next) => {
              setPrefs({ ...prefs, keepAwakeByDefault: next })
            }}
            accessibilityLabel="Keep the screen on by default"
            trackColor={{ false: COLORS.line, true: COLORS.cyan }}
            thumbColor={COLORS.ink}
          />
        </View>
      </Panel>

      <Panel title="About">
        <Muted>EQ Zera {version}</Muted>
        <View style={styles.gap} />
        <LinkRow first label="eqzera.com" url={LINKS.site} />
        <LinkRow label="Guides" url={LINKS.guides} />
        <LinkRow label="Privacy" url={LINKS.privacy} />
      </Panel>

      <Panel title="Open-source licences">
        <Muted>
          This app is built on Expo and React Native, and uses @noble/ciphers for AES-256-GCM.
          Their licences, and EQ Zera{'’'}s own, are published at eqzera.com and in the project
          repository. No analytics or tracking library is in this app at all.
        </Muted>
      </Panel>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.ground },
  content: { paddingHorizontal: SPACE.lg },
  title: { ...TYPE.h1, marginBottom: SPACE.md },
  room: { ...TYPE.value, fontSize: 18, marginBottom: SPACE.sm },
  gap: { marginTop: SPACE.md },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, minHeight: HIT },
  switchText: { flex: 1, minWidth: 0 },
  switchTitle: { ...TYPE.body },
  switchDetail: { ...TYPE.label, fontSize: 12 },
  note: { ...TYPE.body, color: COLORS.sun, fontSize: 14 }
})
