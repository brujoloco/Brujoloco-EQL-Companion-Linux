// SyncSetting — carry your settings to another PC of your own, with NO network (0.2.34).
//
// Its own file for the reason SharingSetting.tsx and UpdateSetting.tsx are: PreferencesView.tsx is
// the settings TABLE, and a section's actual UI lives beside it rather than inside it.
//
// WHAT THE USER DOES. On the machine that has the settings: press Create transfer, and one
// encrypted line appears - copy it, or save it as a .txt file. On the other machine: open the
// file (or paste the line), press Read, look at what it would add, press Apply. How the file
// travels - email to yourself, a USB stick, your own cloud drive - is the user's business;
// the app opens no socket for any of it.

import { Button, Box, Checkbox, FormControlLabel, Stack, TextField, Typography } from '@mui/material'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import SaveAltIcon from '@mui/icons-material/SaveAlt'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import SyncAltIcon from '@mui/icons-material/SyncAlt'
import type { SharePreview } from '@shared/profiles'
import { SYNC_DISCORD_NOTICE, SYNC_FILE_NOTICE } from '@shared/settingsSync'
import type { PrefSection } from './PreferencesView'
import { useSettingsSync } from './useSettingsSync'

/** The card's own sentence: what the Export button makes, in five words. */
const HELP = 'Your settings are encrypted here into one transfer line. Save it as a file or copy it, and read it back on the other PC.'

/** How many rows a preview would actually add, said the way the import dialog says it. */
function previewSummary(preview: SharePreview, channels: number): string {
  const bits: string[] = []
  const alerts = preview.alerts.filter((a) => a.action !== 'skip').length
  if (alerts > 0) bits.push(`${String(alerts)} alert${alerts === 1 ? '' : 's'}`)
  const scalars = preview.scalars.length
  if (scalars > 0) bits.push(`${String(scalars)} setting${scalars === 1 ? '' : 's'}`)
  if (channels > 0) bits.push(`${String(channels)} Discord channel${channels === 1 ? '' : 's'}`)
  return bits.length === 0 ? 'Nothing new - you already have it all.' : `This transfer carries ${bits.join(', ')}.`
}

export function SyncSetting(): JSX.Element {
  const state = useSettingsSync()
  const preview = state.preview

  return (
    <Stack spacing={1.5} data-testid="pref-sync">
      <Typography variant="body2">{HELP}</Typography>

      {/* ---- EXPORT: one line, copy it or save it ---- */}
      <Stack direction="row" spacing={1} alignItems="center">
        <Button
          size="small"
          variant="contained"
          disabled={state.busy}
          data-testid="pref-sync-export"
          onClick={state.exportSettings}
        >
          Create transfer
        </Button>
        <FormControlLabel
          sx={{ ml: 1 }}
          control={
            <Checkbox
              size="small"
              sx={{ p: 0.5 }}
              data-testid="pref-sync-include-discord"
              checked={state.includeDiscord}
              onChange={(e) => state.setIncludeDiscord(e.target.checked)}
            />
          }
          label={<Typography variant="body2">Include Discord channels</Typography>}
        />
      </Stack>
      <Typography variant="caption" color="text.secondary">
        {SYNC_DISCORD_NOTICE}
      </Typography>

      {state.transfer !== '' && (
        <Stack spacing={1} data-testid="pref-sync-export-result">
          <Box
            data-testid="pref-sync-transfer-text"
            sx={{
              fontFamily: 'monospace',
              fontSize: 13,
              px: 1,
              py: 0.5,
              borderRadius: 1,
              border: 1,
              borderColor: 'divider',
              bgcolor: 'action.hover',
              wordBreak: 'break-all',
              maxHeight: 96,
              overflow: 'auto'
            }}
          >
            {state.transfer}
          </Box>
          <Stack direction="row" spacing={1}>
            <Button
              size="small"
              variant="outlined"
              startIcon={<ContentCopyIcon />}
              data-testid="pref-sync-copy"
              onClick={state.copyTransfer}
            >
              Copy
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={<SaveAltIcon />}
              data-testid="pref-sync-save"
              onClick={state.saveTransfer}
            >
              Save to file
            </Button>
          </Stack>
          <Typography variant="caption" color="text.secondary">
            {SYNC_FILE_NOTICE}
          </Typography>
        </Stack>
      )}

      {/* ---- IMPORT: open a file or paste the line, read it, apply it ---- */}
      <Stack direction="row" spacing={1} alignItems="center">
        <Button
          size="small"
          variant="outlined"
          startIcon={<FolderOpenIcon />}
          disabled={state.busy}
          data-testid="pref-sync-open"
          onClick={state.openTransfer}
        >
          Open transfer file
        </Button>
        <Button
          size="small"
          variant="outlined"
          disabled={state.busy || state.typed.trim() === ''}
          data-testid="pref-sync-read"
          onClick={state.readTransfer}
        >
          Read pasted transfer
        </Button>
      </Stack>
      <TextField
        size="small"
        multiline
        minRows={2}
        maxRows={4}
        placeholder="…or paste a transfer line here"
        data-testid="pref-sync-paste"
        value={state.typed}
        onChange={(e) => state.setTyped(e.target.value)}
      />

      {preview !== null && (
        <Stack spacing={1} data-testid="pref-sync-preview" sx={{ pl: 1, borderLeft: 2, borderColor: 'divider' }}>
          <Typography variant="body2">{previewSummary(preview, state.incoming)}</Typography>
          {state.incoming > 0 && (
            <FormControlLabel
              sx={{ ml: 0 }}
              control={
                <Checkbox
                  size="small"
                  sx={{ p: 0.5 }}
                  data-testid="pref-sync-take-discord"
                  checked={state.takeDiscord}
                  onChange={(e) => state.setTakeDiscord(e.target.checked)}
                />
              }
              label={<Typography variant="body2">Also add the Discord channels it carries</Typography>}
            />
          )}
          <Stack direction="row" spacing={1}>
            <Button
              size="small"
              variant="contained"
              disabled={state.busy}
              data-testid="pref-sync-apply"
              onClick={state.apply}
            >
              Apply
            </Button>
            <Button size="small" disabled={state.busy} data-testid="pref-sync-cancel" onClick={state.cancel}>
              Cancel
            </Button>
          </Stack>
        </Stack>
      )}

      {state.status.text !== '' && (
        <Typography
          variant="body2"
          color={state.status.bad ? 'warning.main' : 'text.secondary'}
          data-testid="pref-sync-status"
        >
          {state.status.text}
        </Typography>
      )}
    </Stack>
  )
}

export function syncSection(): PrefSection {
  return {
    id: 'sync',
    label: 'Sync',
    icon: <SyncAltIcon fontSize="small" />,
    items: [
      {
        id: 'settings-sync',
        label: 'Carry settings to another PC',
        keywords: 'sync transfer settings export import file code encrypt copy paste offline',
        content: <SyncSetting />
      }
    ]
  }
}
