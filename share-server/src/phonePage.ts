// ============================================================================
// phonePage.ts — the phone app, as ONE self-contained document (plus a manifest and a worker).
// ============================================================================
//
// docs/plans/phone-link.md section 5 is the contract. Three files leave this module and they are
// the whole of the "app" a phone installs:
//
//   `/phone/`                       one HTML document: inline CSS, one nonce'd inline script
//   `/phone/manifest.webmanifest`   what makes "Add to Home Screen" open it standalone
//   `/phone/sw.js`                  a service worker that caches THE SHELL ONLY
//
// ── THE SERVICE WORKER NEVER TOUCHES A FRAME ───────────────────────────────────────────────────
//
// Frames arrive over a WebSocket and are the one thing on this page that must never be replayed
// from a cache: a second screen showing last Tuesday's fight because a cache answered first is
// worse than a second screen showing nothing. So the worker caches three URLs by name, serves them
// cache-first, and has no `fetch` opinion about anything else at all.
//
// ── THE CSP IS page.ts's, PLUS EXACTLY WHAT A PWA WITH ONE SOCKET NEEDS ────────────────────────
//
// `default-src 'none'` still. `connect-src` names this origin and the one wss origin; `manifest-src`
// and `worker-src` are `'self'`. Nothing else is added, and in particular there is no `unsafe-inline`
// on `style-src` — which is why the meter bars are sized from script through the CSSOM rather than
// with a `style=` attribute (render.ts's header).
//
// EVERY VALUE ON THIS PAGE IS THE VIEWER'S OWN. Unlike `page.ts`, this document renders NOTHING
// from a stranger: there is no id in it, no profile, no interpolated text. The only untrusted bytes
// it will ever hold arrive later, encrypted, over the socket, and are escaped by `render.ts`'s
// `esc()` on the way into the DOM.

import { newNonce } from './codec'
import { PHONE_APP } from './phonePage/app'
import { PHONE_RENDER } from './phonePage/render'
import { PHONE_STYLE } from './phonePage/style'

/** The ground colour, from `pageStyle.ts`'s palette - the theme colour and the splash background. */
const THEME = '#0c0a1f'

/** The five tabs, in the order the bar draws them. */
const TABS: readonly [string, string][] = [
  ['live', 'Live'],
  ['run', 'Run'],
  ['timers', 'Timers'],
  ['character', 'Character'],
  ['events', 'Events']
]

/** What somebody sees who opened `/phone/` with no pairing - the only copy on the whole page. */
function firstRun(): string {
  return (
    `<div id="first" class="first hide">` +
    `<h1>EQ Zera</h1>` +
    `<p class="muted">This page is a second screen for EQ Zera on your PC. It needs to be paired once.</p>` +
    `<ol><li>Open EQ Zera on your PC.</li>` +
    `<li>Go to Preferences, then Sharing.</li>` +
    `<li>Turn on <b>Send live data to my phone</b>.</li>` +
    `<li>Press <b>Pair a phone</b> and scan the code.</li></ol>` +
    `<p class="muted">Everything is encrypted on your PC. The service that relays it cannot read it.</p>` +
    `</div>`
  )
}

function shell(): string {
  const tabs = TABS.map(
    ([id, label]) =>
      `<button type="button" data-tab="${id}" role="tab" aria-selected="${String(id === 'live')}">${label}</button>`
  ).join('')
  return (
    `<div id="app" class="hide">` +
    `<header class="top"><span id="who" class="who">EQ Zera</span>` +
    `<span id="pill" class="pill">Connecting</span>` +
    `<span id="sub" class="sub"></span></header>` +
    `<main><div id="body"></div>` +
    `<div class="row"><button id="wake" type="button" class="btn ghost">Keep screen on</button>` +
    `<button id="forget" type="button" class="btn ghost">Forget this PC</button></div></main>` +
    `<nav class="tabs" role="tablist">${tabs}</nav>` +
    `</div>`
  )
}

/** The whole document. Nothing in it comes from a request. */
export function phonePageHtml(nonce: string): string {
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">` +
    `<meta name="theme-color" content="${THEME}">` +
    `<meta name="mobile-web-app-capable" content="yes">` +
    `<meta name="apple-mobile-web-app-capable" content="yes">` +
    `<meta name="apple-mobile-web-app-title" content="EQ Zera">` +
    `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">` +
    `<meta name="robots" content="noindex">` +
    `<link rel="manifest" href="/phone/manifest.webmanifest">` +
    `<link rel="icon" href="/logo.png">` +
    `<link rel="apple-touch-icon" href="/logo.png">` +
    `<title>EQ Zera</title>` +
    `<style nonce="${nonce}">${PHONE_STYLE}</style>` +
    `</head><body>` +
    firstRun() +
    shell() +
    `<script nonce="${nonce}">${PHONE_RENDER}${PHONE_APP}</script>` +
    `</body></html>`
  )
}

/**
 * The headers the page needs, which are `htmlResponse`'s plus a socket and a manifest.
 *
 * The socket origin is DERIVED FROM THE ONE ORIGIN THIS SERVICE HANDS OUT (`PUBLIC_ORIGIN`), never
 * from the request's Host: the same rule share-links.md states about every URL here, and it is what
 * stops a page served under some other name from being told it may connect there.
 */
function phoneCsp(nonce: string, origin: string): string {
  const socket = origin.startsWith('https://')
    ? `wss://${origin.slice(8)}`
    : origin.startsWith('http://')
      ? `ws://${origin.slice(7)}`
      : ''
  return [
    "default-src 'none'",
    "img-src 'self'",
    `style-src 'nonce-${nonce}'`,
    `script-src 'nonce-${nonce}'`,
    `connect-src 'self'${socket === '' ? '' : ` ${socket}`}`,
    "manifest-src 'self'",
    "worker-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'"
  ].join('; ')
}

export function phonePage(origin: string): Response {
  const nonce = newNonce()
  return new Response(phonePageHtml(nonce), {
    status: 200,
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': phoneCsp(nonce, origin),
      // Revalidate every time: the shell is a few kilobytes and the service worker is what makes
      // an installed copy fast, so a stale document is all cost and no benefit.
      'Cache-Control': 'no-cache'
    }
  })
}

/**
 * The manifest. ONE icon size, and that is deliberate: `/logo.png` is the 256x256 mark this service
 * already serves (logo.ts), and declaring sizes it cannot produce would make an installer fetch
 * 404s. `purpose: "any maskable"` lets Android inset it rather than framing it in a white box.
 */
export function phoneManifest(): Response {
  const body = {
    name: 'EQ Zera',
    short_name: 'EQ Zera',
    description: 'Your live EverQuest Legends meters, timers and character, on your phone.',
    start_url: '/phone/',
    scope: '/phone/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: THEME,
    theme_color: THEME,
    icons: [{ src: '/logo.png', sizes: '256x256', type: 'image/png', purpose: 'any maskable' }]
  }
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600'
    }
  })
}

/** Bumped by hand when the shell changes; an old cache is dropped on the next activate. */
const SHELL_VERSION = 'eqzera-phone-v1'

/**
 * The service worker: three URLs, cache-first, and no opinion about anything else.
 *
 * It is what makes the app open on a phone with no signal (to its empty state, honestly labelled)
 * and what makes "Add to Home Screen" feel installed. It deliberately does not cache `/logo.png`
 * from a wildcard or intercept the socket — see the module header.
 */
export function phoneServiceWorker(): Response {
  const source =
    `const CACHE='${SHELL_VERSION}';` +
    `const SHELL=['/phone/','/phone/manifest.webmanifest','/logo.png'];` +
    `self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});` +
    `self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});` +
    `self.addEventListener('fetch',e=>{const u=new URL(e.request.url);` +
    `if(e.request.method!=='GET'||u.origin!==location.origin||!SHELL.includes(u.pathname))return;` +
    `e.respondWith(caches.match(u.pathname).then(hit=>hit||fetch(e.request)))});`
  return new Response(source, {
    status: 200,
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'Content-Type': 'text/javascript; charset=utf-8',
      'Cache-Control': 'no-cache'
    }
  })
}
