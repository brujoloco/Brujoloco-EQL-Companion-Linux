// present/events.ts — the Events tab, as rows.
//
// The `events` channel is a CLOSED list of celebration kinds (docs/plans/phone-link.md, ruling 5),
// and the gate that enforces it is `phoneEvents` on the desktop: an unknown kind is DROPPED before
// it is ever sealed, so no tell, say, guild line or auction has a path onto this wire. This file
// therefore does not re-gate — it LABELS, and an unrecognised kind falls back to its own name
// rather than being hidden, because a kind this app has not heard of means the desktop is newer
// than the phone, which is a thing to show rather than to swallow.

import { PHONE_EVENT_KINDS, type PhoneEvent, type PhoneEventKind } from '@shared/phone/types'
import { ago } from './format'

/** The six kinds, in English. Exhaustive over `PHONE_EVENT_KINDS` — the compiler holds it so. */
export const EVENT_LABEL: Record<PhoneEventKind, string> = {
  levelUp: 'Level up',
  bossKill: 'Boss',
  skyQuestComplete: 'Quest',
  questItem: 'Quest item',
  wishDrop: 'Wish list',
  death: 'Death'
}

export interface EventRow {
  key: string
  kind: string
  label: string
  title: string
  subtitle: string
  when: string
}

export interface EventsView {
  rows: EventRow[]
  empty: string | null
}

export function eventLabel(kind: string): string {
  return (PHONE_EVENT_KINDS as readonly string[]).includes(kind)
    ? EVENT_LABEL[kind as PhoneEventKind]
    : kind
}

export function eventsView(events: PhoneEvent[] | null, now: number): EventsView {
  const rows = (events ?? []).map((event, index) => ({
    key: `${String(index)}:${event.id}`,
    kind: event.kind,
    label: eventLabel(event.kind),
    title: event.title,
    subtitle: event.subtitle ?? '',
    when: ago(event.at, now)
  }))
  return { rows, empty: rows.length === 0 ? 'Nothing to celebrate yet.' : null }
}

/**
 * THE NEWEST EVENT'S IDENTITY, for the haptic tick.
 *
 * The list arrives newest-first and whole, so "is there something new?" is "did the head change?".
 * It is the ID rather than the length, because the list is capped at 30 — at the cap, a new event
 * pushes an old one off and the length does not move.
 */
export function newestEventId(events: PhoneEvent[] | null): string | null {
  return events?.[0]?.id ?? null
}
