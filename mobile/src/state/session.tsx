// ============================================================================
// state/session.tsx — ONE PLACE THAT KNOWS: the pairing, the socket, the seven channels.
// ============================================================================
//
// A context rather than a store library, because there is exactly one of these and it holds seven
// values. Everything with a decision in it lives elsewhere and is tested there — `relay.ts` owns
// the socket, `store.ts` owns what is kept, `present/*` owns what a tab says. This file is the
// wiring, and it is deliberately the only file in the app that is hard to test.
//
// ── THE CARRIED CHARACTER IS LOADED BEFORE ANYTHING CONNECTS (ruling 8) ────────────────────────
//
// On launch the vault is read FIRST, and `character` and `status` are put into state before the
// socket is even attempted. So the Character tab is already correct on a phone in a queue with no
// signal, and a frame that arrives later replaces it rather than filling it in.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import { VIEW_SUBPROTOCOL } from '@/constants'
import { createRelay, type Relay, type RelayStatus } from '@/phone/relay'
import { vault } from '@/phone/native-store'
import type { Pairing } from '@/phone/pair-link'
import { CARRIED, type CarriedName } from '@/phone/store'
import { DEFAULT_PREFS, parsePrefs, serializePrefs, type Prefs } from '@/settings/prefs'
import { NO_PUSH, type PushState } from '@/notifications/push'
import type { PhoneChannel } from '@shared/phone/types'
import { File, Paths } from 'expo-file-system'

const PREFS_FILE = 'eqzera-prefs.json'

export type Channels = Partial<Record<PhoneChannel, unknown>>

export interface Session {
  /** false until the vault has been read once — the router waits on it rather than flashing Pair */
  ready: boolean
  pairing: Pairing | null
  channels: Channels
  status: RelayStatus
  prefs: Prefs
  push: PushState
  pair: (next: Pairing) => Promise<void>
  forget: () => Promise<void>
  setPrefs: (next: Prefs) => void
  setPush: (next: PushState) => void
}

const SessionContext = createContext<Session | null>(null)

/** The platform socket, wrapped to the three callbacks `relay.ts` asks for. */
function openSocket(
  url: string,
  protocols: string[],
  handlers: { onOpen: () => void; onMessage: (data: string) => void; onClose: () => void }
): { close: () => void } {
  const socket = new WebSocket(url, protocols)
  socket.onopen = () => {
    handlers.onOpen()
  }
  socket.onmessage = (event: { data: unknown }) => {
    if (typeof event.data === 'string') handlers.onMessage(event.data)
  }
  socket.onclose = () => {
    handlers.onClose()
  }
  socket.onerror = () => {
    try {
      socket.close()
    } catch {
      /* already gone */
    }
  }
  return {
    close: () => {
      try {
        socket.close()
      } catch {
        /* already gone */
      }
    }
  }
}

function readPrefs(): Prefs {
  try {
    const file = new File(Paths.document, PREFS_FILE)
    return parsePrefs(file.exists ? file.textSync() : null)
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

function writePrefs(prefs: Prefs): void {
  try {
    const file = new File(Paths.document, PREFS_FILE)
    if (!file.exists) file.create({ overwrite: true })
    file.write(serializePrefs(prefs))
  } catch {
    /* a preference that will not persist costs one tap next launch */
  }
}

const IDLE: RelayStatus = { open: false, desk: false, lastFrameAt: 0, attempt: 0 }

/**
 * THE THREE IMPURE SEAMS, AT MODULE SCOPE.
 *
 * They are here rather than inside the component for a reason the linter is right about: a
 * `Date.now()` written inside a render body is a call during render, and `react-hooks/purity`
 * flags it whether or not it is inside a lambda that will be invoked later. Hoisting them makes
 * the rule true rather than suppressed — the component body contains no impure call at all.
 */
const REAL_DEPS = {
  socket: openSocket,
  now: () => Date.now(),
  setTimer: (fn: () => void, ms: number) => {
    const handle = setTimeout(fn, ms)
    return () => {
      clearTimeout(handle)
    }
  }
}

export function SessionProvider({ children }: { children: ReactNode }): ReactNode {
  const [ready, setReady] = useState(false)
  const [pairing, setPairing] = useState<Pairing | null>(null)
  const [channels, setChannels] = useState<Channels>({})
  const [status, setStatus] = useState<RelayStatus>(IDLE)
  const [prefs, setPrefsState] = useState<Prefs>(DEFAULT_PREFS)
  const [push, setPush] = useState<PushState>(NO_PUSH)

  // ONE relay for the lifetime of the app. A lazy `useState` initializer rather than a ref that is
  // filled in during render: the value is built exactly once, it never changes, and nothing reads
  // a `.current` while React is rendering.
  const [relay] = useState<Relay>(() =>
    createRelay(REAL_DEPS, {
      onChannel: (channel, payload) => {
        setChannels((held) => ({ ...held, [channel]: payload }))
        // RULING 8: the two carried channels are written through to disk as they arrive, so the
        // app is already correct the next time it opens with no signal.
        if ((CARRIED as readonly string[]).includes(channel)) {
          void vault.saveCarried(channel as CarriedName, payload)
        }
      },
      onStatus: setStatus
    })
  )

  // THE CARRIED CHARACTER FIRST, THEN THE SOCKET.
  useEffect(() => {
    // A BOX RATHER THAN A `let`: the flag is written by the cleanup, in a different closure, and a
    // plain boolean local reads to the compiler as a constant `true` here — which is both a lint
    // error and, more to the point, a lie about what the code does.
    const live = { on: true }
    void (async () => {
      const held = await vault.loadPairing()
      const carried: Channels = {}
      for (const name of CARRIED) {
        const value = await vault.loadCarried(name)
        if (value !== null) carried[name] = value
      }
      if (!live.on) return
      // Anything a frame already delivered WINS over the carried copy: the socket can open before
      // the disk read finishes, and a fresh fight must not be overwritten by a stale character.
      setChannels((arrived) => ({ ...carried, ...arrived }))
      setPrefsState(readPrefs())
      setPairing(held)
      setReady(true)
      if (held) relay.start(held.roomId, held.viewKey)
    })()
    return () => {
      live.on = false
    }
  }, [relay])

  // RULE 2 of relay.ts: the socket follows the foreground.
  useEffect(() => {
    const onChange = (next: AppStateStatus): void => {
      relay.setForeground(next === 'active')
    }
    const subscription = AppState.addEventListener('change', onChange)
    return () => {
      subscription.remove()
    }
  }, [relay])

  const pair = useCallback(
    async (next: Pairing) => {
      await vault.savePairing(next)
      setPairing(next)
      setChannels({})
      relay.start(next.roomId, next.viewKey)
    },
    [relay]
  )

  const forget = useCallback(async () => {
    relay.stop()
    await vault.forget()
    setPairing(null)
    setChannels({})
    setStatus(IDLE)
    setPush(NO_PUSH)
  }, [relay])

  const setPrefs = useCallback((next: Prefs) => {
    setPrefsState(next)
    writePrefs(next)
  }, [])

  const value = useMemo<Session>(
    () => ({ ready, pairing, channels, status, prefs, push, pair, forget, setPrefs, setPush }),
    [ready, pairing, channels, status, prefs, push, pair, forget, setPrefs]
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): Session {
  const session = useContext(SessionContext)
  if (!session) throw new Error('useSession outside SessionProvider')
  return session
}

/** The subprotocol, re-exported so a reader of this file can see what the socket offers. */
export { VIEW_SUBPROTOCOL }
