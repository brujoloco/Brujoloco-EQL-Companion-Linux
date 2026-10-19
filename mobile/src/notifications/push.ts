// ============================================================================
// notifications/push.ts — THE OPT-IN HALF (docs/plans/phone-native.md, ruling 7 + section 6).
// ============================================================================
//
// THE APP'S HALF OF PUSH IS BUILT; THE RELAY'S AND THE DESKTOP'S ARE NOT. This file gets the OS
// permission, obtains an Expo push token and remembers which kinds the user asked for. The
// registration message (`{"t":"p", …}`), the room's token store and the desk's `{"t":"n"}` are
// specified in full in section 6 of the plan and implemented nowhere — deliberately, in this
// ticket.
//
// ── RULING 7, IN CODE ──────────────────────────────────────────────────────────────────────────
//
//  * OFF BY DEFAULT. There is no token until a switch is turned on, and no OS permission is asked
//    for until then either. A user who never opens the Notifications section is never prompted.
//  * NOTHING IS OBTAINED SPECULATIVELY. `getExpoPushTokenAsync` is the one call in this whole app
//    that reaches a host other than share.eqzera.com, and it happens only after an explicit yes.
//  * TURNING THE LAST SWITCH OFF DEREGISTERS. An empty kind set is not "a token with nothing to
//    say", it is "forget my token" (section 6: an empty `kinds` array deregisters).
//  * THE COPY IS ON THE SCREEN, not in this file's conscience. `NOTIFICATION_PRIVACY` below is
//    rendered above the switches, verbatim, and the Settings screen has no way to hide it.

import Constants from 'expo-constants'
import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import { sanitizeKinds } from '@/settings/prefs'

/**
 * THE SENTENCE THE OWNER RULED MUST BE SAID (ruling 7). It is a constant so that it appears in
 * exactly one place, and so that a test could assert it if the copy ever became load-bearing.
 */
export const NOTIFICATION_PRIVACY =
  'Notifications are the one thing here that isn’t private. Everything else on this screen is ' +
  'encrypted on your PC, and the service can’t read it — but a notification has to be readable to ' +
  'be shown, so its text passes through the relay and through Apple or Google. Keep it to what ' +
  'you’d be happy to see on a lock screen. Off by default, and the app works fully without it.'

export type PermissionState = 'granted' | 'denied' | 'undetermined' | 'unsupported'

/** What Settings draws. `token` is present only once a kind is on AND permission was granted. */
export interface PushState {
  permission: PermissionState
  kinds: string[]
  token: string | null
  /** why there is no token, when there could have been one. Shown as a plain line, never a toast. */
  note: string | null
}

export const NO_PUSH: PushState = { permission: 'undetermined', kinds: [], token: null, note: null }

/** The EAS project id `getExpoPushTokenAsync` needs. Absent until `eas init` has been run. */
export function projectId(): string | null {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: unknown } } | undefined
  const id = extra?.eas?.projectId
  return typeof id === 'string' && id.length > 0 ? id : null
}

function stateOf(status: Notifications.PermissionStatus | undefined): PermissionState {
  if (status === Notifications.PermissionStatus.GRANTED) return 'granted'
  if (status === Notifications.PermissionStatus.DENIED) return 'denied'
  return 'undetermined'
}

export async function currentPermission(): Promise<PermissionState> {
  try {
    const { status } = await Notifications.getPermissionsAsync()
    return stateOf(status)
  } catch {
    return 'unsupported'
  }
}

/**
 * Ask, once, in context. A denial is FINAL as far as this app is concerned — the OS will not ask
 * again, and nagging is what makes people turn an app off entirely — so Settings says where the
 * system setting is instead of asking twice.
 */
export async function requestPermission(): Promise<PermissionState> {
  try {
    const held = await Notifications.getPermissionsAsync()
    if (held.status === Notifications.PermissionStatus.GRANTED) return 'granted'
    const asked = await Notifications.requestPermissionsAsync()
    return stateOf(asked.status)
  } catch {
    return 'unsupported'
  }
}

/** Android needs a channel before anything can be delivered into it. One channel, named plainly. */
export async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return
  try {
    await Notifications.setNotificationChannelAsync('celebrations', {
      name: 'Celebrations',
      importance: Notifications.AndroidImportance.DEFAULT,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
      vibrationPattern: [0, 120],
      lightColor: '#5ee6ff'
    })
  } catch {
    /* an older Android has no channels and needs none */
  }
}

/**
 * The Expo push token — THE ONE CALL IN THIS APP THAT REACHES A HOST OTHER THAN share.eqzera.com,
 * and it happens only after a yes. `null` with a `note` whenever it cannot, which Settings shows
 * as a line rather than an alert.
 */
export async function obtainToken(): Promise<{ token: string | null; note: string | null }> {
  const id = projectId()
  if (id === null) {
    return { token: null, note: 'This build has no EAS project id yet, so a push token cannot be issued.' }
  }
  try {
    await ensureChannel()
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId: id })
    return { token: data, note: null }
  } catch {
    return { token: null, note: 'The push service could not be reached. Notifications stay off until it can.' }
  }
}

/**
 * ONE SWITCH MOVED. The whole state transition, as a pure-ish function of what was there and what
 * was asked for, so the screen has no policy in it.
 *
 * Turning the FIRST kind on asks for the permission; turning the LAST one off drops the token,
 * which is the deregistration (section 6). A denied permission answers with no kinds at all —
 * a switch that looks on while nothing can be delivered is a lie.
 */
export async function applyKinds(held: PushState, wanted: readonly string[]): Promise<PushState> {
  const kinds = sanitizeKinds(wanted)
  if (kinds.length === 0) {
    return { permission: held.permission, kinds: [], token: null, note: null }
  }
  const permission = held.permission === 'granted' ? 'granted' : await requestPermission()
  if (permission !== 'granted') {
    return {
      permission,
      kinds: [],
      token: null,
      note:
        permission === 'denied'
          ? 'Notifications are turned off for EQ Zera in your device settings. Turn them on there first.'
          : 'Notifications are not available on this device.'
    }
  }
  const { token, note } = held.token === null ? await obtainToken() : { token: held.token, note: null }
  return { permission, kinds: token === null ? [] : kinds, token, note }
}
