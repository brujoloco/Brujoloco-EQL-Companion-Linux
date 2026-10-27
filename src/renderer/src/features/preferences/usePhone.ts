// usePhone — the Phone card's state, and the ONE rule about the pair link.
//
// THE LINK IS ASKED FOR ONLY WHILE THE DIALOG IS OPEN, AND DROPPED WHEN IT CLOSES. The pair URL
// contains the view key — that is what a pair link is — so it is not part of `phoneGetState`, it is
// never written to localStorage, and it lives in exactly one piece of React state whose lifetime is
// the dialog's (docs/plans/phone-link.md, ruling 6). Closing the dialog clears it; so does
// unpairing, which invalidates it anyway.
//
// EVERYTHING ELSE IS MAIN'S. This hook does not connect, does not encrypt, does not mint anything
// and does not know the room id. It presses five doors and draws what comes back — the same
// division `useDiscordChannels` keeps about a webhook.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { PhoneCardView } from '@shared/phone/types'

/** How often the card re-reads the state while the feature is on - what "Phones connected" needs. */
const POLL_MS = 3000

/** The state before main has answered: nothing on, nothing paired, nothing connected. */
const UNKNOWN: PhoneCardView = {
  available: false,
  enabled: false,
  paired: false,
  connected: false,
  viewers: 0
}

export interface PhoneCardState {
  view: PhoneCardView
  busy: boolean
  status: { text: string; bad: boolean }
  pairOpen: boolean
  /** '' until the dialog asks for it, and '' again the moment the dialog closes. */
  pairUrl: string
  setEnabled: (on: boolean) => void
  openPair: () => void
  closePair: () => void
  copyLink: () => void
  unpair: () => void
}

export function usePhone(): PhoneCardState {
  const [view, setView] = useState<PhoneCardView>(UNKNOWN)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState({ text: '', bad: false })
  const [pairOpen, setPairOpen] = useState(false)
  const [pairUrl, setPairUrl] = useState('')
  const alive = useRef(true)

  const read = useCallback(() => {
    void window.eq.phoneGetState().then((next) => {
      if (alive.current) setView(next)
    })
  }, [])

  useEffect(() => {
    alive.current = true
    read()
    const id = setInterval(read, POLL_MS)
    return () => {
      alive.current = false
      clearInterval(id)
    }
  }, [read])

  /** One action, with the busy flag and the state refresh every one of them needs. */
  const act = useCallback((run: () => Promise<PhoneCardView>) => {
    setBusy(true)
    setStatus({ text: '', bad: false })
    void run()
      .then((next) => {
        if (alive.current) setView(next)
      })
      .finally(() => {
        if (alive.current) setBusy(false)
      })
  }, [])

  const setEnabled = useCallback(
    (on: boolean) => {
      act(() => (on ? window.eq.phoneEnable() : window.eq.phoneDisable()))
      if (!on) {
        setPairOpen(false)
        setPairUrl('')
      }
    },
    [act]
  )

  const openPair = useCallback(() => {
    setPairOpen(true)
    void window.eq.phonePairUrl().then((answer) => {
      if (!alive.current) return
      if (answer.ok) setPairUrl(answer.url)
      else setStatus({ text: answer.error, bad: true })
    })
  }, [])

  const closePair = useCallback(() => {
    setPairOpen(false)
    // THE KEY GOES WITH THE DIALOG. See the header.
    setPairUrl('')
  }, [])

  const copyLink = useCallback(() => {
    if (pairUrl === '') return
    void window.eq.writeClipboard(pairUrl).then((ok) => {
      if (alive.current) setStatus({ text: ok ? 'Link copied' : 'Could not copy that link', bad: !ok })
    })
  }, [pairUrl])

  const unpair = useCallback(() => {
    // The old link dies here, so it is dropped BEFORE the round trip rather than after it - there
    // is no moment at which this card is showing a code that no longer works.
    setPairUrl('')
    act(() =>
      window.eq.phoneUnpairAll().then((next) => {
        if (!alive.current) return next
        setStatus({ text: 'Every phone link is now dead', bad: false })
        // A dialog that is still open needs the NEW code, or the person standing there with a
        // phone has nothing to scan.
        if (pairOpen) {
          void window.eq.phonePairUrl().then((answer) => {
            if (alive.current && answer.ok) setPairUrl(answer.url)
          })
        }
        return next
      })
    )
  }, [act, pairOpen])

  return { view, busy, status, pairOpen, pairUrl, setEnabled, openPair, closePair, copyLink, unpair }
}
