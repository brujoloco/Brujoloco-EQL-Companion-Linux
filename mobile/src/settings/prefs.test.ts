// prefs.test.ts — the non-secret preferences, and the closed kind list.

import { DEFAULT_PREFS, parsePrefs, PUSH_KINDS, PUSH_KIND_LABEL, sanitizeKinds, serializePrefs } from './prefs'
import { PHONE_EVENT_KINDS } from '@shared/phone/types'

describe('the prefs file', () => {
  test('a missing file is the defaults, and keep-awake is OFF', () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS)
    expect(DEFAULT_PREFS.keepAwakeByDefault).toBe(false)
  })

  test('it round-trips', () => {
    const prefs = { keepAwakeByDefault: true, lastTab: 'character' }
    expect(parsePrefs(serializePrefs(prefs))).toEqual(prefs)
  })

  test('junk, a newer build’s fields and an unknown tab all read as defaults', () => {
    expect(parsePrefs('not json')).toEqual(DEFAULT_PREFS)
    expect(parsePrefs('{"lastTab":"nonsense"}').lastTab).toBe(DEFAULT_PREFS.lastTab)
    expect(parsePrefs('{"keepAwakeByDefault":"yes"}').keepAwakeByDefault).toBe(false)
    expect(parsePrefs('{"somethingNew":1,"lastTab":"run"}')).toEqual({ keepAwakeByDefault: false, lastTab: 'run' })
  })
})

describe('the notification kinds', () => {
  test('they are the closed celebration list plus the one run fact — and nothing else', () => {
    for (const kind of PHONE_EVENT_KINDS) expect(PUSH_KINDS).toContain(kind)
    expect(PUSH_KINDS).toContain('runFinished')
    expect(PUSH_KINDS).toHaveLength(PHONE_EVENT_KINDS.length + 1)
    // Ruling 5 reaches push too: there is no switch for anything anybody says.
    for (const chat of ['tell', 'say', 'guild', 'auction', 'group', 'shout', 'chat']) {
      expect(PUSH_KINDS).not.toContain(chat)
    }
  })

  test('every kind has a switch label and a plain line under it', () => {
    for (const kind of PUSH_KINDS) {
      expect(PUSH_KIND_LABEL[kind]?.title).toBeTruthy()
      expect(PUSH_KIND_LABEL[kind]?.detail).toBeTruthy()
    }
  })

  test('only kinds with a switch survive a round trip', () => {
    expect(sanitizeKinds(['bossKill', 'tell', 'runFinished', 'nonsense'])).toEqual(['bossKill', 'runFinished'])
    expect(sanitizeKinds([])).toEqual([])
  })
})
