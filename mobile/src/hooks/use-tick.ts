// hooks/use-tick.ts — a clock that moves while nothing is arriving.
//
// The timer tabs count between frames (present/timers.ts's header explains why at length), and the
// connection pill has to be able to say "last update 12s ago" while nothing is landing. Both need
// a re-render on a schedule that is NOT the socket's.
//
// It pauses when the app leaves the foreground: a screen nobody can see does not need a clock, and
// a one-second interval in the background is a battery bug with a UI in front of it.

import { useEffect, useState } from 'react'
import { AppState, type AppStateStatus } from 'react-native'

export function useTick(everyMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    let handle: ReturnType<typeof setInterval> | null = null
    const start = (): void => {
      if (handle !== null) return
      setNow(Date.now())
      handle = setInterval(() => {
        setNow(Date.now())
      }, everyMs)
    }
    const stop = (): void => {
      if (handle === null) return
      clearInterval(handle)
      handle = null
    }
    if (AppState.currentState === 'active') start()
    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') start()
      else stop()
    })
    return () => {
      stop()
      subscription.remove()
    }
  }, [everyMs])

  return now
}
