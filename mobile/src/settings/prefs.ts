// settings/prefs.ts — the handful of choices that are not secrets.
//
// Two of them, and they are apart from the vault deliberately: a preference is not a credential,
// it does not belong in a keystore, and losing it costs a tap. They live as plain JSON in the
// app's private document directory.
//
// THE NOTIFICATION KINDS ARE *NOT* HERE. They travel with the push token, in the keystore, because
// the pair (token, kinds) is what a registration message is (docs/plans/phone-native.md, section
// 6) and splitting it across two stores is how the two halves drift.

import { PHONE_EVENT_KINDS } from '@shared/phone/types'

/** The extra push kind this app has that the `events` channel does not: a run finishing. */
export const RUN_FINISHED = 'runFinished'

/** Every kind a notification switch exists for. The closed list, plus the one run fact. */
export const PUSH_KINDS: readonly string[] = [...PHONE_EVENT_KINDS, RUN_FINISHED]

/** What each switch is called, and the one line under it. */
export const PUSH_KIND_LABEL: Record<string, { title: string; detail: string }> = {
  bossKill: { title: 'Boss kills', detail: 'When a named or raid target goes down.' },
  levelUp: { title: 'Level ups', detail: 'When you gain a level.' },
  wishDrop: { title: 'Wish list drops', detail: 'When something on your wish list drops.' },
  questItem: { title: 'Quest items', detail: 'When a quest item you need drops.' },
  skyQuestComplete: { title: 'Quests completed', detail: 'When a Plane of Sky quest step completes.' },
  death: { title: 'Deaths', detail: 'When you die.' },
  [RUN_FINISHED]: { title: 'Runs finished', detail: 'When an instance run ends.' }
}

export interface Prefs {
  /** Whether the Live tab turns the screen-on toggle on by itself when it opens. OFF by default. */
  keepAwakeByDefault: boolean
  /** The tab the app opens on, so it reopens where it was left. */
  lastTab: string
}

export const DEFAULT_PREFS: Prefs = { keepAwakeByDefault: false, lastTab: 'live' }

const TABS = ['live', 'run', 'timers', 'character', 'events']

/**
 * A prefs file as it comes off disk. Field by field, defaults for everything missing — a file from
 * an older or newer build reads as "the parts I understand", never as a crash on launch.
 */
export function parsePrefs(text: string | null): Prefs {
  if (text === null) return { ...DEFAULT_PREFS }
  try {
    const raw = JSON.parse(text) as Record<string, unknown>
    return {
      keepAwakeByDefault: raw.keepAwakeByDefault === true,
      lastTab: typeof raw.lastTab === 'string' && TABS.includes(raw.lastTab) ? raw.lastTab : DEFAULT_PREFS.lastTab
    }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

export function serializePrefs(prefs: Prefs): string {
  return JSON.stringify({ keepAwakeByDefault: prefs.keepAwakeByDefault, lastTab: prefs.lastTab })
}

/** Only kinds this app has a switch for survive a round trip. Nothing else may be registered. */
export function sanitizeKinds(raw: readonly string[]): string[] {
  return PUSH_KINDS.filter((kind) => raw.includes(kind))
}
