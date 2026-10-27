// useSettingsSync — the offline sync card's state (0.2.34). Two verbs: EXPORT an
// encrypted one-line transfer (copy it, save it as a file), IMPORT one back (open a
// file or paste the line, preview, apply). No network anywhere in it.

import { useCallback, useState } from 'react'
import type { SharePreview } from '@shared/profiles'
import { copyText } from '../../lib/clipboard'
import { readUiPrefs, writeUiPrefs } from '../../lib/uiPrefs'

export interface SyncStatus {
  text: string
  bad: boolean
}
const NONE: SyncStatus = { text: '', bad: false }
const WORKING: SyncStatus = { text: 'Working…', bad: false }
const LOST = 'That did not work. Try again.'

export interface SettingsSyncState {
  busy: boolean
  status: SyncStatus
  includeDiscord: boolean
  setIncludeDiscord: (on: boolean) => void
  /** the transfer line, once there is one */
  transfer: string
  exportSettings: () => void
  copyTransfer: () => void
  saveTransfer: () => void
  typed: string
  setTyped: (text: string) => void
  openTransfer: () => void
  readTransfer: () => void
  /** what the transfer would add, or null while there is nothing to look at */
  preview: SharePreview | null
  /** how many Discord channels rode along with it */
  incoming: number
  takeDiscord: boolean
  setTakeDiscord: (on: boolean) => void
  apply: () => void
  cancel: () => void
}

function importedText(channels: number): string {
  if (channels === 0) return 'Settings imported'
  return `Settings imported. ${String(channels)} Discord channel${channels === 1 ? '' : 's'} added`
}

export function useSettingsSync(): SettingsSyncState {
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<SyncStatus>(NONE)
  const [includeDiscord, setIncludeDiscord] = useState(false)
  const [transfer, setTransfer] = useState('')
  const [typed, setTyped] = useState('')
  const [preview, setPreview] = useState<SharePreview | null>(null)
  const [incoming, setIncoming] = useState(0)
  const [takeDiscord, setTakeDiscord] = useState(false)

  const say = useCallback((s: SyncStatus): void => setStatus(s), [])

  const exportSettings = useCallback((): void => {
    setBusy(true)
    say(WORKING)
    setTransfer('')
    void (async () => {
      try {
        const res = await window.eq.buildSettingsTransfer(readUiPrefs(), includeDiscord)
        if (res.ok) {
          setTransfer(res.text)
          say(NONE)
        } else {
          say({ text: res.error, bad: true })
        }
      } catch {
        say({ text: LOST, bad: true })
      } finally {
        setBusy(false)
      }
    })()
  }, [includeDiscord, say])

  const copyTransfer = useCallback((): void => {
    if (transfer === '') return
    void (async () => {
      const ok = await copyText(transfer)
      say(ok ? { text: 'Transfer copied - paste it anywhere', bad: false } : { text: 'Could not reach the clipboard.', bad: true })
    })()
  }, [transfer, say])

  const saveTransfer = useCallback((): void => {
    if (transfer === '') return
    setBusy(true)
    void (async () => {
      try {
        const res = await window.eq.saveSettingsTransfer(transfer)
        if (!res.ok) say({ text: res.error, bad: true })
        else if (res.ok) say({ text: 'Transfer saved', bad: false })
      } catch {
        say({ text: LOST, bad: true })
      } finally {
        setBusy(false)
      }
    })()
  }, [transfer, say])

  const clearPreview = useCallback((): void => {
    setPreview(null)
    setIncoming(0)
    setTakeDiscord(false)
  }, [])

  const readTransfer = useCallback((): void => {
    setBusy(true)
    say(WORKING)
    clearPreview()
    void (async () => {
      try {
        const res = await window.eq.readSettingsTransfer(typed, readUiPrefs())
        if (res.ok) {
          setPreview(res.preview)
          setIncoming(res.discordChannels ?? 0)
          say(NONE)
        } else {
          say({ text: res.error, bad: true })
        }
      } catch {
        say({ text: LOST, bad: true })
      } finally {
        setBusy(false)
      }
    })()
  }, [typed, say, clearPreview])

  const openTransfer = useCallback((): void => {
    setBusy(true)
    void (async () => {
      try {
        const res = await window.eq.openSettingsTransfer()
        if (res.ok && res.text !== '') {
          setTyped(res.text)
          say(NONE)
        } else if (!res.ok) {
          say({ text: res.error, bad: true })
        }
      } catch {
        say({ text: LOST, bad: true })
      } finally {
        setBusy(false)
      }
    })()
  }, [say])

  const apply = useCallback((): void => {
    setBusy(true)
    say(WORKING)
    void (async () => {
      try {
        const res = await window.eq.applySettingsTransfer(readUiPrefs(), takeDiscord)
        if (res.ok) {
          writeUiPrefs(res.ui)
          setTyped('')
          clearPreview()
          say({ text: importedText(res.channelsAdded), bad: false })
        } else {
          say({ text: res.error, bad: true })
        }
      } catch {
        say({ text: LOST, bad: true })
      } finally {
        setBusy(false)
      }
    })()
  }, [takeDiscord, say, clearPreview])

  const cancel = useCallback((): void => {
    setTyped('')
    clearPreview()
    say(NONE)
  }, [clearPreview, say])

  return {
    busy,
    status,
    includeDiscord,
    setIncludeDiscord,
    transfer,
    exportSettings,
    copyTransfer,
    saveTransfer,
    typed,
    setTyped,
    openTransfer,
    readTransfer,
    preview,
    incoming,
    takeDiscord,
    setTakeDiscord,
    apply,
    cancel
  }
}
