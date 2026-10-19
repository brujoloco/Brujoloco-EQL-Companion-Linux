// PhoneSetting — EQ ZERA ON YOUR PHONE (owner, 2026-09-19; docs/plans/phone-link.md).
//
// Its own file for the reason SharingSetting.tsx and SyncSetting.tsx are: PreferencesView.tsx is
// the settings TABLE, and a section's actual UI lives beside it rather than inside it.
//
// WHAT THE USER DOES: switch it on, press Pair a phone, point their camera at the code. The phone
// opens a page that shows their meters, run tracker, timers, recent events and character, and it
// installs to the home screen like an app.
//
// NO SECRET IS DRAWN HERE EXCEPT THE PAIR LINK, ON PURPOSE. The link contains the view key - that
// is what a pair link is - and it is shown only inside this dialog, held only in `usePhone`'s state,
// and dropped the moment the dialog closes. The desk token never reaches the renderer at all. The
// card that is always on screen holds three booleans and a count.
//
// THE QR IS DRAWN, NOT INJECTED. `qrMatrix` (src/shared/qr.ts) answers a grid of booleans and this
// file renders one `<rect>` per dark module as ordinary React elements - no `dangerouslySetInnerHTML`
// and no string of markup anywhere in the path.

import { type JSX, useMemo } from 'react'
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Switch, TextField, Typography } from '@mui/material'

import { qrMatrix } from '@shared/qr'
import { usePhone, type PhoneCardState } from './usePhone'
import type { PrefSection } from './PreferencesView'

/** The one line of help under the switch, which is the whole promise written out. */
const HELP =
  'Your phone shows your meters, run tracker, timers and character. Data is encrypted on this PC; the service cannot read it.'

/** …and what a build with no relay compiled in says instead. */
const DARK = 'This build cannot send data to a phone.'

/** The quiet zone, in modules. It is part of the specification, not padding - a code drawn edge to
 *  edge does not scan. */
const QUIET = 4

/** The code, as `<rect>` elements. White on dark: a camera wants the light square, always. */
function QrCode({ text }: { text: string }): JSX.Element | null {
  const matrix = useMemo(() => qrMatrix(text), [text])
  if (!matrix) return null
  const span = matrix.length + QUIET * 2
  const rects: JSX.Element[] = []
  matrix.forEach((row, r) => {
    row.forEach((dark, c) => {
      if (dark) {
        rects.push(<rect key={`${String(r)}-${String(c)}`} x={c + QUIET} y={r + QUIET} width={1} height={1} />)
      }
    })
  })
  return (
    <svg
      data-testid="pref-phone-qr"
      role="img"
      aria-label="Pairing code"
      viewBox={`0 0 ${String(span)} ${String(span)}`}
      shapeRendering="crispEdges"
      width={240}
      height={240}
    >
      <rect width={span} height={span} fill="#ffffff" />
      <g fill="#0c0a1f">{rects}</g>
    </svg>
  )
}

/** The pairing dialog: the code, the link, Copy, and how many phones are watching right now. */
function PairDialog({ state }: { state: PhoneCardState }): JSX.Element {
  return (
    <Dialog open={state.pairOpen} onClose={state.closePair} maxWidth="xs" fullWidth>
      <DialogTitle>Pair a phone</DialogTitle>
      <DialogContent>
        <Stack spacing={2} alignItems="center">
          {state.pairUrl === '' ? (
            <Typography variant="body2" color="text.secondary">
              Making a pairing code…
            </Typography>
          ) : (
            <QrCode text={state.pairUrl} />
          )}
          <Typography variant="body2" color="text.secondary" textAlign="center">
            Point your phone camera at the code, then add the page to your home screen.
          </Typography>
          <TextField
            fullWidth
            size="small"
            label="Pairing link"
            value={state.pairUrl}
            slotProps={{ htmlInput: { readOnly: true, spellCheck: false, 'data-testid': 'pref-phone-link' } }}
          />
          <Button
            size="small"
            variant="outlined"
            data-testid="pref-phone-link-copy"
            disabled={state.pairUrl === ''}
            onClick={state.copyLink}
          >
            Copy link
          </Button>
          <Typography variant="body2" data-testid="pref-phone-viewers">
            Phones connected: {state.view.viewers}
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button size="small" color="inherit" data-testid="pref-phone-pair-done" onClick={state.closePair}>
          Done
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export function PhoneSetting(): JSX.Element {
  const state = usePhone()
  const dark = !state.view.available
  return (
    <Stack spacing={1}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Switch
          size="small"
          data-testid="pref-phone-enabled"
          checked={state.view.enabled}
          disabled={dark || state.busy}
          onChange={(e) => {
            state.setEnabled(e.target.checked)
          }}
        />
        <Typography variant="body2">Send live data to my phone</Typography>
      </Stack>
      <Typography variant="caption" color="text.secondary">
        {HELP}
      </Typography>
      {dark && (
        <Typography variant="body2" color="text.secondary" data-testid="pref-phone-dark">
          {DARK}
        </Typography>
      )}
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }} useFlexGap>
        <Button
          size="small"
          variant="contained"
          data-testid="pref-phone-pair"
          disabled={dark || state.busy || !state.view.enabled}
          onClick={state.openPair}
        >
          Pair a phone
        </Button>
        <Button
          size="small"
          color="inherit"
          data-testid="pref-phone-unpair"
          disabled={dark || state.busy || !state.view.paired}
          onClick={state.unpair}
        >
          Unpair all phones
        </Button>
      </Stack>
      {state.view.enabled && !state.pairOpen && (
        <Typography variant="body2" color="text.secondary" data-testid="pref-phone-viewers">
          Phones connected: {state.view.viewers}
        </Typography>
      )}
      {state.status.text !== '' && (
        <Typography
          variant="body2"
          color={state.status.bad ? 'error' : 'success.main'}
          data-testid="pref-phone-status"
        >
          {state.status.text}
        </Typography>
      )}
      <PairDialog state={state} />
    </Stack>
  )
}

/** The Sharing section's third item - see `sharingSection()` in ./SharingSetting.tsx. */
export function phoneItem(): PrefSection['items'][number] {
  return {
    id: 'phone-link',
    label: 'Send live data to my phone',
    keywords:
      'phone mobile second screen qr code pair pairing meter overlay timers character remote app pwa install encrypted',
    content: <PhoneSetting />
  }
}
