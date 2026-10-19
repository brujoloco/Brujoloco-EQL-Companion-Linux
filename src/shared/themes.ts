/**
 * THE THEME LIBRARY — 25 contrast-safe palettes for the runtime theme switcher.
 *
 * Each entry maps ALL 12 PALETTE fields. Text-on-background contrast is the load-bearing
 * constraint (the user asked for "letters need to be visible"): every theme keeps `text`
 * at WCAG AA (≥4.5:1) on both `bg` and `paper`, and `accent` at ≥4.5:1 on `paper` so chips
 * and links stay readable. Dark themes use bright tokens on dark ground; light themes
 * (paper-white, solarized-light, vintage-cream, the three Windows-95 greys) use dark tokens
 * on light ground. The default `arcane` is byte-identical to the original EQ Zera palette —
 * `tests/palette.test.mts` pins it and keeps passing unchanged.
 *
 * RELATIVE IMPORTS ONLY — same rule as palette.ts (node-run tests resolve no alias).
 */

/** The 12-field palette shape every consumer paints from. Mirrors the original PALETTE. */
export interface ThemePalette {
  bg: string
  paper: string
  ink: string
  text: string
  accent: string
  accentHi: string
  cyan: string
  cyanDim: string
  green: string
  amber: string
  red: string
  magenta: string
}

/** A catalog entry: a stable id, a human name, and the palette itself. */
export interface ThemeDef {
  id: string
  name: string
  palette: ThemePalette
}

/** The default theme id — the original EQ Zera "Midnight & arcane" palette, byte-identical. */
export const DEFAULT_THEME_ID = 'arcane'

/** The 25 themes, indexed by id for O(1) lookup. Order = picker order. */
export const THEMES: ThemeDef[] = [
  {
    id: 'arcane',
    name: 'Arcane (default)',
    palette: {
      bg: '#0b0f1a', paper: '#131a2b', ink: '#0b0f1a', text: '#e5e9f5',
      accent: '#a78bfa', accentHi: '#c4b5fd', cyan: '#38bdf8', cyanDim: '#3a86ad',
      green: '#4ade80', amber: '#fbbf24', red: '#f87171', magenta: '#f472b6'
    }
  },
  {
    id: 'parchment-gold',
    name: 'Parchment & Gold',
    palette: {
      bg: '#0f1115', paper: '#171a21', ink: '#0f1115', text: '#e8e2d0',
      accent: '#d9b25f', accentHi: '#e8c97a', cyan: '#6fb3d2', cyanDim: '#4a7d96',
      green: '#5fbf72', amber: '#e0a94a', red: '#d9706f', magenta: '#c9a0e0'
    }
  },
  {
    id: 'crt-green',
    name: 'CRT Green',
    palette: {
      bg: '#000000', paper: '#021a0a', ink: '#000000', text: '#33ff66',
      accent: '#33ff66', accentHi: '#88ffaa', cyan: '#22cc55', cyanDim: '#1a8844',
      green: '#aaffaa', amber: '#aaff33', red: '#ff5555', magenta: '#88ff66'
    }
  },
  {
    id: 'crt-amber',
    name: 'CRT Amber',
    palette: {
      bg: '#0a0500', paper: '#1a0c00', ink: '#0a0500', text: '#ffb000',
      accent: '#ffb000', accentHi: '#ffcc55', cyan: '#cc7700', cyanDim: '#995500',
      green: '#ccaa00', amber: '#ffd866', red: '#ff6644', magenta: '#cc8800'
    }
  },
  {
    id: 'crt-orange',
    name: 'CRT Orange',
    palette: {
      bg: '#0a0a00', paper: '#16140a', ink: '#0a0a00', text: '#ff9933',
      accent: '#ff9933', accentHi: '#ffbb66', cyan: '#88cc33', cyanDim: '#557a22',
      green: '#aacc44', amber: '#ffaa22', red: '#ff5544', magenta: '#cc7733'
    }
  },
  {
    id: 'monochrome',
    name: 'Monochrome',
    palette: {
      bg: '#000000', paper: '#1a1a1a', ink: '#000000', text: '#ffffff',
      accent: '#cccccc', accentHi: '#ffffff', cyan: '#999999', cyanDim: '#666666',
      green: '#dddddd', amber: '#bbbbbb', red: '#aaaaaa', magenta: '#888888'
    }
  },
  {
    id: 'paper-white',
    name: 'Paper White',
    palette: {
      bg: '#ffffff', paper: '#f4f4f0', ink: '#ffffff', text: '#1a1a1a',
      accent: '#2a5db0', accentHi: '#3a6dc0', cyan: '#0e7c7b', cyanDim: '#5a9a9a',
      green: '#2a7d32', amber: '#b8702a', red: '#c62828', magenta: '#8e3fa8'
    }
  },
  {
    id: 'win95-grey',
    name: 'Windows 95',
    palette: {
      bg: '#c0c0c0', paper: '#d4d0c8', ink: '#ffffff', text: '#000000',
      accent: '#000080', accentHi: '#0000a0', cyan: '#008080', cyanDim: '#005555',
      green: '#008000', amber: '#808000', red: '#800000', magenta: '#800080'
    }
  },
  {
    id: 'win95-olive',
    name: 'Windows 95 Olive',
    palette: {
      bg: '#808000', paper: '#a0a068', ink: '#ffffff', text: '#000000',
      accent: '#2a2a00', accentHi: '#3a3a10', cyan: '#2a5a5a', cyanDim: '#1a3a3a',
      green: '#2a4a00', amber: '#6a5a00', red: '#6a2a2a', magenta: '#5a2a5a'
    }
  },
  {
    id: 'win95-rose',
    name: 'Windows 95 Rose',
    palette: {
      bg: '#c080a0', paper: '#d4a0b8', ink: '#ffffff', text: '#1a000a',
      accent: '#5a002a', accentHi: '#7a003a', cyan: '#2a5a5a', cyanDim: '#1a3a3a',
      green: '#2a5a2a', amber: '#6a5a2a', red: '#8a002a', magenta: '#6a002a'
    }
  },
  {
    id: 'synthwave',
    name: 'Synthwave 80s',
    palette: {
      bg: '#1a0b2e', paper: '#231733', ink: '#1a0b2e', text: '#f0f0ff',
      accent: '#ff2a6d', accentHi: '#ff5a8d', cyan: '#05d9e8', cyanDim: '#048a9a',
      green: '#39ff14', amber: '#ffd319', red: '#ff2a6d', magenta: '#d300c5'
    }
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk',
    palette: {
      bg: '#0a0a0f', paper: '#15151f', ink: '#0a0a0f', text: '#f0f0ff',
      accent: '#fcee0a', accentHi: '#fff680', cyan: '#0ff0fc', cyanDim: '#0a9aa0',
      green: '#a6ff00', amber: '#ff7b00', red: '#ff003c', magenta: '#ff00a0'
    }
  },
  {
    id: 'vaporwave',
    name: 'Vaporwave',
    palette: {
      bg: '#1e0033', paper: '#2e0a4a', ink: '#1e0033', text: '#ffe0f7',
      accent: '#ff71ce', accentHi: '#ff9ae0', cyan: '#01cdfe', cyanDim: '#018a9a',
      green: '#a8ff80', amber: '#ffca5a', red: '#ff5a7a', magenta: '#b967ff'
    }
  },
  {
    id: 'retrofuturistic',
    name: 'Retrofuturistic',
    palette: {
      bg: '#0d0221', paper: '#1a0a3a', ink: '#0d0221', text: '#e0e0ff',
      accent: '#a06aff', accentHi: '#c08aff', cyan: '#00f0ff', cyanDim: '#0099aa',
      green: '#00ff9f', amber: '#ffaa00', red: '#ff0055', magenta: '#ff00aa'
    }
  },
  {
    id: 'vintage-sepia',
    name: 'Vintage Sepia',
    palette: {
      bg: '#2b1d10', paper: '#3a2a18', ink: '#2b1d10', text: '#e8d5b0',
      accent: '#c8a06a', accentHi: '#dab88a', cyan: '#8a9a7a', cyanDim: '#5a6a4a',
      green: '#9aa070', amber: '#d4a050', red: '#b06a5a', magenta: '#a08070'
    }
  },
  {
    id: 'vintage-cream',
    name: 'Vintage Cream',
    palette: {
      bg: '#f4ecd8', paper: '#e8dec0', ink: '#f4ecd8', text: '#3a2a1a',
      accent: '#7a4a1a', accentHi: '#9a6a3a', cyan: '#3a6a6a', cyanDim: '#5a8a8a',
      green: '#4a6a2a', amber: '#a0702a', red: '#9a3a2a', magenta: '#7a3a5a'
    }
  },
  {
    id: 'solarized-dark',
    name: 'Solarized Dark',
    palette: {
      bg: '#002b36', paper: '#073642', ink: '#002b36', text: '#93a1a1',
      accent: '#61b3ff', accentHi: '#8ac8ff', cyan: '#2aa198', cyanDim: '#1a6a66',
      green: '#859900', amber: '#b58900', red: '#dc322f', magenta: '#d33682'
    }
  },
  {
    id: 'solarized-light',
    name: 'Solarized Light',
    palette: {
      bg: '#fdf6e3', paper: '#eee8d5', ink: '#fdf6e3', text: '#073642',
      accent: '#1a5fa8', accentHi: '#2a6fb8', cyan: '#2aa198', cyanDim: '#1a6a66',
      green: '#719e00', amber: '#b58900', red: '#dc322f', magenta: '#d33682'
    }
  },
  {
    id: 'dracula',
    name: 'Dracula',
    palette: {
      bg: '#282a36', paper: '#383a4a', ink: '#282a36', text: '#f8f8f2',
      accent: '#bd93f9', accentHi: '#d4b5ff', cyan: '#8be9fd', cyanDim: '#5a9aaa',
      green: '#50fa7b', amber: '#f1fa8c', red: '#ff5555', magenta: '#ff79c6'
    }
  },
  {
    id: 'nord',
    name: 'Nord',
    palette: {
      bg: '#2e3440', paper: '#3b4252', ink: '#2e3440', text: '#e5e9f0',
      accent: '#88c0d0', accentHi: '#a8d0e0', cyan: '#81a1c1', cyanDim: '#5a708a',
      green: '#a3be8c', amber: '#ebcb8b', red: '#bf616a', magenta: '#b48ead'
    }
  },
  {
    id: 'gruvbox',
    name: 'Gruvbox',
    palette: {
      bg: '#282828', paper: '#3c3836', ink: '#282828', text: '#ebdbb2',
      accent: '#fabd2f', accentHi: '#ffd75a', cyan: '#83a598', cyanDim: '#5a7a66',
      green: '#b8bb26', amber: '#fe8019', red: '#fb4934', magenta: '#d3869b'
    }
  },
  {
    id: 'tokyo-night',
    name: 'Tokyo Night',
    palette: {
      bg: '#1a1b26', paper: '#24283b', ink: '#1a1b26', text: '#c0caf5',
      accent: '#7aa2f7', accentHi: '#9ab5ff', cyan: '#7dcfff', cyanDim: '#5a8aaa',
      green: '#9ece6a', amber: '#e0af68', red: '#f7768e', magenta: '#bb9af7'
    }
  },
  {
    id: 'catppuccin-mocha',
    name: 'Catppuccin Mocha',
    palette: {
      bg: '#1e1e2e', paper: '#313244', ink: '#1e1e2e', text: '#cdd6f4',
      accent: '#cba6f7', accentHi: '#dcc5ff', cyan: '#89dceb', cyanDim: '#5a9aaa',
      green: '#a6e3a1', amber: '#f9e2af', red: '#f38ba8', magenta: '#f5c2e7'
    }
  },
  {
    id: 'one-dark',
    name: 'One Dark',
    palette: {
      bg: '#282c34', paper: '#353b45', ink: '#282c34', text: '#abb2bf',
      accent: '#61afef', accentHi: '#82c5ff', cyan: '#56b6c2', cyanDim: '#3a7a82',
      green: '#98c379', amber: '#e5c07b', red: '#e06c75', magenta: '#c678dd'
    }
  },
  {
    id: 'brujoloco',
    name: 'Brujoloco',
    palette: {
      bg: '#0a0e1a', paper: '#142033', ink: '#0a0e1a', text: '#e8f0ff',
      accent: '#ff9e3d', accentHi: '#ffb866', cyan: '#3df0d0', cyanDim: '#2aa090',
      green: '#7dff8a', amber: '#ffd23d', red: '#ff5a7a', magenta: '#c08aff'
    }
  }
]

/** O(1) id → palette. Falls back to the default theme if the id is unknown. */
const BY_ID = new Map<string, ThemeDef>(THEMES.map((t) => [t.id, t]))

/** Look up a theme by id; unknown ids return the default (Arcane), never null. */
export function themeById(id: string): ThemeDef {
  return BY_ID.get(id) ?? BY_ID.get(DEFAULT_THEME_ID)!
}

/** The default theme's palette — the byte-identical Arcane palette. */
export const DEFAULT_PALETTE: ThemePalette = themeById(DEFAULT_THEME_ID).palette

/** All theme ids in picker order, for the dropdown. */
export const THEME_IDS: string[] = THEMES.map((t) => t.id)
