// AboutBuildSetting — the Preferences section that names this build (Brujoloco EQL
// Companion, Linux Edition) and the human reason it exists. Its own file for the same
// reason every other section's UI does: PreferencesView.tsx is the section table, and a
// section's actual UI lives beside it rather than inside it.
//
// This section sits directly above the Thanks section in the rail — it is the build's own
// credit rather than a third-party credit, so it belongs beside the one that already names
// what the app ships from.

import { type JSX } from 'react'
import { Box, Stack, Typography } from '@mui/material'
import FavoriteIcon from '@mui/icons-material/Favorite'
import { PALETTE, NEON } from '@shared/palette'
import type { PrefSection } from './PreferencesView'

/** The build date baked into the About copy. Bumped with each substantive release. */
const ABOUT_BUILD_DATE = 'October 19, 2026'

export function AboutBuildSetting(): JSX.Element {
  return (
    <Stack spacing={2} sx={{ maxWidth: 560 }}>
      <Box
        aria-hidden
        sx={{
          height: 2,
          width: '100%',
          borderRadius: 1,
          backgroundImage: NEON,
          opacity: 0.8
        }}
      />
      <Typography variant="h6" sx={{ fontWeight: 700, letterSpacing: '0.04em' }}>
        Brujoloco EQL Companion - Linux Edition
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ letterSpacing: '0.08em' }}>
        Build date: {ABOUT_BUILD_DATE}
      </Typography>

      <Typography variant="body2">
        This is a full rework of the old EQ Zera version into{' '}
        <strong>Brujoloco EQL Companion</strong>, keeping almost every change EQ Zera
        introduced and adding new ones - like the theme section you are reading this in.
      </Typography>

      <Typography variant="body2">
        It was rebuilt because I don&rsquo;t use Windows. I wanted the EQL companion on my own
        Linux distro, running beside the game in a Wine bottle, reading the same log it has
        always read. It was coded for personal use, one hundred percent.
      </Typography>

      <Typography variant="body2">
        It will only receive updates when EQ Zera has new ones worth porting across, and when
        my own time permits. As it stands, the app is complete and excellent at what it does,
        and it should be considered a final delivered product for Linux.
      </Typography>

      <Typography
        variant="body2"
        sx={{
          mt: 0.5,
          pl: 1.5,
          py: 1,
          borderLeft: `2px solid ${PALETTE.accent}`,
          fontStyle: 'italic'
        }}
      >
        EverQuest has been my home for a long, long time. Norrath is where I&rsquo;ve spent more
        evenings than I can count - raiding with friends I still talk to, watching the sun rise
        over the Karanas, losing myself in a zone I already knew by heart and somehow finding
        one more thing I&rsquo;d missed. This app is a love letter to that. It doesn&rsquo;t
        play the game for me; it just watches the log the game already writes and turns it into
        the numbers and the cards I want to see while I&rsquo;m playing. May your pulls be
        clean and your loot be kind. - Brujoloco
      </Typography>

      <Box
        sx={{
          mt: 1.5,
          p: 1.5,
          border: `1px solid ${PALETTE.accent}`,
          borderRadius: 1,
          bgcolor: 'transparent'
        }}
      >
        <Typography variant="caption" sx={{ fontWeight: 700, letterSpacing: '0.08em', display: 'block', mb: 0.75 }}>
          LICENSE &mdash; OPEN, FINAL, FREE TO MODIFY
        </Typography>
        <Typography variant="body2" sx={{ fontSize: 13 }}>
          This build is declared <strong>final</strong> as a delivered product for Linux.
          Everyone is free to use, copy, modify, fork, and redistribute it under the open license
          below &mdash; change it as you see fit.
        </Typography>
        <Typography variant="body2" sx={{ fontSize: 13, mt: 0.75 }}>
          The upstream code (EverQuest Companion by Josh Moyers, and the EQ Zera additions by Jack
          Thomas) is licensed under the <strong>Functional Source License 1.1, MIT future license
          (FSL-1.1-MIT)</strong>: free for any non-competing use, and it converts to plain MIT two
          years after each release.
        </Typography>
        <Typography variant="body2" sx={{ fontSize: 13, mt: 0.75 }}>
          The Brujoloco Linux Edition additions since October 2026 &mdash; the AppImage packaging,
          the theme system, the adaptive light/dark mode, the in-app rebrand, and this About
          section &mdash; are released under the <strong>MIT License</strong>, copyright
          &copy; 2026 Brujoloco. You may do anything with them, commercial or not, provided you
          keep this notice and the upstream attributions in LICENSE and NOTICE.
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
          See LICENSE for the full FSL-1.1-MIT terms and NOTICE for the third-party and bundled-asset
          attributions. This is not legal advice; the license text controls.
        </Typography>
      </Box>
    </Stack>
  )
}

/** The section: an About card naming this build, placed directly above the Thanks section. */
export function aboutBuildSection(): PrefSection {
  return {
    id: 'about-build',
    label: 'About this build',
    icon: <FavoriteIcon fontSize="small" />,
    items: [
      {
        id: 'about-brujoloco',
        label: 'Brujoloco EQL Companion, Linux Edition',
        keywords: 'about build brujoloco eql companion linux edition rework fork version date credits',
        content: <AboutBuildSetting />
      }
    ]
  }
}
