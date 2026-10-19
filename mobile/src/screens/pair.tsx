// screens/pair.tsx — three doors to one parser.
//
// Scan, paste, or arrive on a link. All three end at `parsePairLink`, which accepts exactly one
// string shape and refuses everything else (`phone/pair-link.ts`). Nothing on this screen decides
// what a valid pairing looks like.
//
// THE CAMERA IS ASKED FOR IN CONTEXT AND A DENIAL IS NOT A DEAD END. The reason is on the screen
// above the button, and a refusal falls through to the paste field rather than to an apology —
// a phone in a case, with a broken camera, or with the QR on the same screen as the app all need
// door two anyway.

import { useCallback, useState, type ReactNode } from 'react'
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { getStringAsync } from 'expo-clipboard'
import { Button, Muted, Panel } from '@/components/ui'
import { parsePairLink } from '@/phone/pair-link'
import { useSession } from '@/state/session'
import { COLORS, RADIUS, SPACE, TYPE } from '@/theme'

const BAD = 'That isn’t an EQ Zera pairing link. Open EQ Zera on your PC, go to Preferences › Sharing › Pair a phone, and scan the code there.'

function Scanner({ onFound }: { onFound: (raw: string) => void }): ReactNode {
  const [permission, requestPermission] = useCameraPermissions()

  if (!permission) return null

  if (!permission.granted) {
    return (
      <Panel title="Scan the code">
        <Muted>
          EQ Zera uses the camera once, to read the pairing QR code your PC shows. Nothing is
          recorded, stored or sent.
        </Muted>
        <View style={styles.spacer} />
        <Button
          label={permission.canAskAgain ? 'Allow the camera' : 'Camera is off in Settings'}
          tone="accent"
          onPress={() => {
            if (permission.canAskAgain) void requestPermission()
          }}
          hint="Opens the system camera permission prompt"
        />
        <View style={styles.spacer} />
        <Muted>Or paste the link below instead — it works just as well.</Muted>
      </Panel>
    )
  }

  return (
    <Panel title="Scan the code">
      <View style={styles.camera}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={({ data }) => {
            onFound(data)
          }}
        />
      </View>
      <View style={styles.spacer} />
      <Muted>Point it at the QR code in Preferences {'›'} Sharing {'›'} Pair a phone.</Muted>
    </Panel>
  )
}

export function PairScreen(): ReactNode {
  const { pair } = useSession()
  const insets = useSafeAreaInsets()
  const [typed, setTyped] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const accept = useCallback(
    (raw: string) => {
      if (busy) return
      const parsed = parsePairLink(raw)
      if (!parsed) {
        setError(BAD)
        return
      }
      setBusy(true)
      setError(null)
      // The link is CONSUMED here and nothing keeps a copy: the field is cleared before the
      // pairing is even stored, so the key is not sitting in a text input behind a tab.
      setTyped('')
      void pair(parsed).finally(() => {
        setBusy(false)
      })
    },
    [busy, pair]
  )

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + SPACE.lg, paddingBottom: insets.bottom + SPACE.xxl }]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Pair with your PC</Text>
      <Muted>
        EQ Zera on your PC encrypts everything it sends. The pairing link carries the only key that
        can read it, and it never leaves your two devices.
      </Muted>
      <View style={styles.spacer} />

      <Scanner onFound={accept} />

      <Panel title="Or paste the link">
        <TextInput
          style={styles.input}
          value={typed}
          onChangeText={(next) => {
            setTyped(next)
            setError(null)
          }}
          placeholder="https://share.eqzera.com/phone/#..."
          placeholderTextColor={COLORS.ink3}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          multiline
          accessibilityLabel="Pairing link"
        />
        <View style={styles.spacer} />
        <View style={styles.buttons}>
          <Button
            label="Paste"
            onPress={() => {
              void getStringAsync().then((text) => {
                setTyped(text)
                setError(null)
              })
            }}
            hint="Pastes the link from your clipboard"
          />
          <Button label="Pair" tone="accent" onPress={() => { accept(typed) }} />
        </View>
      </Panel>

      {error === null ? null : (
        <Panel>
          <Text style={styles.error}>{error}</Text>
        </Panel>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.ground },
  content: { paddingHorizontal: SPACE.lg },
  title: { ...TYPE.h1, marginBottom: SPACE.sm },
  spacer: { height: SPACE.md },
  camera: {
    height: 260,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: COLORS.ground2
  },
  input: {
    minHeight: 72,
    color: COLORS.ink,
    fontFamily: 'monospace',
    fontSize: 13,
    backgroundColor: COLORS.ground2,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: RADIUS.md,
    padding: SPACE.md,
    textAlignVertical: 'top'
  },
  buttons: { flexDirection: 'row', gap: SPACE.md },
  error: { ...TYPE.body, color: COLORS.pink }
})
