// theme.ts — the design tokens, and the only place a colour or a spacing number is written.
//
// The palette is the product's, not this app's invention: the same ground/panel/line/ink/cyan/pink
// that `share-server/src/pageStyle.ts` and `share-server/src/phonePage/style.ts` draw the share
// page and the phone page with, which in turn mirror `website/additional.css`. A person who
// scanned the QR on their PC and a person who installed this app are looking at one product.
//
// `src/shared/palette.ts` is the DESKTOP APP's palette (a slightly bluer ground, `#0b0f1a`, and a
// violet accent) and is deliberately NOT the source here: this app is the phone page's successor,
// and matching the thing it replaces beats matching the thing it watches.
//
// DARK ONLY. There is no light theme and `app.json` says `userInterfaceStyle: "dark"`, because
// the one place this app is read is a dim room at 1am with a game running on the other screen.

export const COLORS = {
  ground: '#0c0a1f',
  ground2: '#13102c',
  panel: '#1a1638',
  line: '#2d2757',
  ink: '#efeaff',
  ink2: '#b8b0d9',
  ink3: '#7d75a6',
  cyan: '#5ee6ff',
  pink: '#ff5fb8',
  violet: '#a98fe0',
  sun: '#c7a2ff',
  good: '#6ee7a8'
} as const

/** A 4-point grid. Every margin and padding in the app is one of these. */
export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const

export const RADIUS = { sm: 6, md: 8, lg: 12, pill: 999 } as const

/**
 * THE SMALLEST TAPPABLE THING IS 44 POINTS. Apple's HIG minimum and Android's 48dp guidance meet
 * at 44-48; every button, switch row and list row in this app clears it, and this constant is how.
 */
export const HIT = 44

/**
 * Type. Sizes are BASE sizes: nothing is locked against the OS text-size setting, so a person
 * running large type gets large type. `mono` is the console readout — timers, damage, ids — and
 * the family names fall back on each platform's own rather than bundling a face.
 */
export const TYPE = {
  mono: { fontFamily: 'monospace' as const },
  h1: { fontSize: 22, fontWeight: '700' as const, color: COLORS.ink },
  /** A section heading: small, spaced, upper, pink — the share page's `h2`. */
  section: {
    fontSize: 12,
    fontWeight: '700' as const,
    letterSpacing: 1.6,
    textTransform: 'uppercase' as const,
    color: COLORS.pink
  },
  body: { fontSize: 15, color: COLORS.ink },
  label: { fontSize: 13, color: COLORS.ink3 },
  value: { fontSize: 14, fontFamily: 'monospace' as const, color: COLORS.cyan },
  muted: { fontSize: 14, color: COLORS.ink3 }
} as const

/** The four connection states, and the colour each pill wears. Words too — never colour alone. */
export const PILL = {
  live: { bg: COLORS.good, fg: COLORS.ground, label: 'Live' },
  waiting: { bg: COLORS.sun, fg: COLORS.ground, label: 'Reconnecting' },
  offline: { bg: 'transparent', fg: COLORS.ink, label: 'Desk offline' },
  idle: { bg: 'transparent', fg: COLORS.ink3, label: 'Not connected' }
} as const
