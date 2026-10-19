// ThemeSetting — Preferences → Appearance → Theme.
//
// The runtime color-theme switcher's UI: a Select listing the 25 palettes (see shared/themes.ts).
// Choosing one calls useTheme.setThemeId, which persists via IPC and applies the swap to the
// renderer's palette + MUI theme immediately (live, no restart). The default "arcane" is the
// original EQ Zera palette; "Parchment & Gold" is the upstream jmoyers look.

import { type JSX } from 'react'
import { Box, MenuItem, Select, Stack, Typography, type SelectChangeEvent } from '@mui/material'
import { useTheme } from '../../theme/useTheme'
import { THEMES } from '@shared/themes'

export function ThemeSetting(): JSX.Element {
  const { themeId, setThemeId } = useTheme()

  return (
    <Stack spacing={0.75}>
      <Select
        size="small"
        value={themeId}
        onChange={(e: SelectChangeEvent) => setThemeId(e.target.value)}
        sx={{ maxWidth: 260 }}
        // A live swatch row beside each name so the picker previews the palette.
        renderValue={(id) => {
          const t = THEMES.find((x) => x.id === id) ?? THEMES[0]
          return (
            <Stack direction="row" spacing={1} alignItems="center">
              <Stack direction="row" spacing={0.25}>
                {[t.palette.accent, t.palette.cyan, t.palette.green, t.palette.amber, t.palette.red].map((c) => (
                  <Box key={c} sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: c, border: `1px solid rgba(255,255,255,0.15)` }} />
                ))}
              </Stack>
              <Typography variant="body2">{t.name}</Typography>
            </Stack>
          )
        }}
      >
        {THEMES.map((t) => (
          <MenuItem key={t.id} value={t.id}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Stack direction="row" spacing={0.25}>
                {[t.palette.accent, t.palette.cyan, t.palette.green, t.palette.amber, t.palette.red].map((c) => (
                  <Box key={c} sx={{ width: 12, height: 12, borderRadius: 0.5, bgcolor: c, border: `1px solid rgba(255,255,255,0.15)` }} />
                ))}
              </Stack>
              <Typography variant="body2">{t.name}</Typography>
            </Stack>
          </MenuItem>
        ))}
      </Select>
      <Typography variant="caption" color="text.secondary">
        Recolours the app immediately. Overlays pick up the new theme the next time you open one.
        Body text stays readable on every theme.
      </Typography>
    </Stack>
  )
}
