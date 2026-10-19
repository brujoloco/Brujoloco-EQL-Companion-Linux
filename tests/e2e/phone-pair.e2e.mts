/**
 * EQ ZERA ON YOUR PHONE (docs/plans/phone-link.md) — the Preferences half, in the real app.
 *
 * What is asserted HERE is the PRODUCT: that the Sharing section carries a Phone card, that its
 * switch is OFF on a fresh install, that a build with no relay SAYS SO rather than offering a
 * button that cannot work, and that the pairing dialog really draws a scannable code and a link of
 * the exact shape the phone page parses. The protocol, the cipher and the scheduler are unit-tested
 * (phoneCrypto / phoneDesk / phoneViewModels / sharePhone); this is what a person sees.
 *
 * ---------------------------------------------------------------------------
 * NOTHING CONNECTS, AND THAT IS A STRUCTURE RATHER THAN A HOPE
 * ---------------------------------------------------------------------------
 * `EQ_E2E` builds compile NO share origin (src/main/share/net.ts: `SHARE_ORIGIN` is the empty
 * string under the flag), and `wsOriginFor('')` is '' with it — so `phoneDeskSocketUrl` answers ''
 * and there is nothing for a socket to address. The SECOND launch below sets `EQ_PHONE_E2E=1`,
 * which moves exactly two things (src/main/phone/index.ts states them): the card's `available`
 * flag and the TEXT of the pair link. It does not create a room and it cannot open a socket.
 *
 * TWO LAUNCHES, because the two states are mutually exclusive: a dark build is one whose card says
 * it cannot do this, and the seam's whole job is to be the other one.
 *
 * Run: `npm run test:e2e -- phone-pair`
 */
import type { Page } from 'playwright-core'
import {
  buildIfStale,
  check,
  countOf,
  dumpArtifacts,
  failures,
  note,
  reportRun,
  settleCount,
  settleGone
} from './appHarness.mjs'
import { mainWindow } from './appWindow.mjs'
import { launchOnFixture } from './logFixture.mjs'

const NAV_PREFS = '[data-testid="nav-preferences"]'
const RAIL_SHARING = '[data-testid="prefs-rail-sharing"]'
const SWITCH = '[data-testid="pref-phone-enabled"] input'
const PAIR = '[data-testid="pref-phone-pair"]'
const UNPAIR = '[data-testid="pref-phone-unpair"]'
const DARK = '[data-testid="pref-phone-dark"]'
const QR = '[data-testid="pref-phone-qr"]'
const LINK = '[data-testid="pref-phone-link"]'
const COPY = '[data-testid="pref-phone-link-copy"]'
const VIEWERS = '[data-testid="pref-phone-viewers"]'
const DONE = '[data-testid="pref-phone-pair-done"]'

/** The exact shape the phone page parses out of its own fragment. */
const PAIR_URL = /^https:\/\/share\.eqzera\.com\/phone\/#r=[A-Za-z0-9_-]{22}&k=[A-Za-z0-9_-]{43}$/

function textOf(page: Page, sel: string): Promise<string> {
  return page.evaluate((s) => (document.querySelector(s) as HTMLElement | null)?.innerText ?? '', sel)
}

function valueOf(page: Page, sel: string): Promise<string> {
  return page.evaluate((s) => (document.querySelector(s) as HTMLInputElement | null)?.value ?? '', sel)
}

function disabledOf(page: Page, sel: string): Promise<boolean> {
  return page.evaluate((s) => {
    const el = document.querySelector(s)
    if (el instanceof HTMLButtonElement || el instanceof HTMLInputElement) return el.disabled
    return true
  }, sel)
}

/** How many `<rect>` modules the drawn code has. A code is a grid; an empty `<svg>` is not one. */
function modulesOf(page: Page, sel: string): Promise<number> {
  return page.evaluate((s) => document.querySelectorAll(`${s} rect`).length, sel)
}

async function answerNotice(page: Page): Promise<void> {
  const notice = '[data-testid="telemetry-notice"]'
  if ((await countOf(page, notice)) === 0) return
  await page.click('[data-testid="telemetry-notice-off"]')
  check('the analytics first-run notice can be answered out of the way', await settleGone(page, notice, { timeoutMs: 8_000 }))
}

async function openSharing(page: Page): Promise<boolean> {
  await page.click(NAV_PREFS, { timeout: 60_000 })
  const railUp = await page.waitForSelector(RAIL_SHARING, { timeout: 30_000 }).then(() => true, () => false)
  if (!check('Preferences has a Sharing section', railUp)) return false
  await page.click(RAIL_SHARING, { timeout: 15_000 })
  const up = (await settleCount(page, SWITCH, 1, { timeoutMs: 20_000 })) === 1
  return check('…and the Phone card is on it', up)
}

/** LAUNCH ONE: the shipped state. Off, and honest about why the buttons are grey. */
async function stepDark(page: Page): Promise<void> {
  check('the switch is OFF on a fresh install', !(await page.isChecked(SWITCH)))
  check('the card offers Pair a phone', (await countOf(page, PAIR)) === 1)
  check('…and Unpair all phones', (await countOf(page, UNPAIR)) === 1)
  check('…and no pairing code is on screen before anybody asked for one', (await countOf(page, QR)) === 0)

  const up = (await settleCount(page, DARK, 1, { timeoutMs: 20_000 })) === 1
  if (!check('under a build with no phone relay the card says so', up)) return
  const said = await textOf(page, DARK)
  check('…in words', said === 'This build cannot send data to a phone.', said)
  check('…and the switch is disabled rather than mysteriously inert', await disabledOf(page, SWITCH))
  check('…as is Pair a phone', await disabledOf(page, PAIR))

  // Pressing it anyway must not produce a dialog, a code or - the point - a connection.
  await page.click(PAIR, { force: true, timeout: 5_000 }).catch(() => undefined)
  check('…and pressing it produces no pairing code', (await countOf(page, QR)) === 0)
}

/** LAUNCH TWO: the seam. A real pairing, a real code, and still no socket. */
async function stepPair(page: Page): Promise<void> {
  // WAIT FOR THE CONDITION, NEVER FOR THE CLOCK. "Is there a relay in this build" is one IPC round
  // trip, and the card draws its dark state until that answers — so the sentence GOING AWAY is the
  // event, and every assertion below only means anything once it has.
  check(
    'with a relay the card stops drawing the dark sentence',
    await settleGone(page, DARK, { timeoutMs: 20_000 })
  )
  check('…and the switch is live', !(await disabledOf(page, SWITCH)))
  check('…and still OFF until somebody turns it on', !(await page.isChecked(SWITCH)))
  check('…with Pair a phone disabled while it is off', await disabledOf(page, PAIR))

  await page.click(SWITCH, { timeout: 15_000 })
  const on = (await settleCount(page, VIEWERS, 1, { timeoutMs: 20_000 })) === 1
  if (!check('turning it on says how many phones are connected', on)) return
  check('…which is none of them yet', (await textOf(page, VIEWERS)).includes('0'))

  await page.click(PAIR, { timeout: 15_000 })
  const shown = (await settleCount(page, QR, 1, { timeoutMs: 20_000 })) === 1
  if (!check('Pair a phone opens a dialog with a code in it', shown)) return

  const modules = await modulesOf(page, QR)
  check('…and the code is a real grid of modules, not an empty box', modules > 100, `rects: ${String(modules)}`)

  const link = await valueOf(page, LINK)
  check('…beside the link a phone can be handed instead', PAIR_URL.test(link), link)
  check('…with a Copy button on it', (await countOf(page, COPY)) === 1)
  check('…and the dialog says how many phones are watching', (await countOf(page, VIEWERS)) === 1)

  // CLOSING THE DIALOG DROPS THE KEY. The pair URL is the one value in this feature the renderer
  // ever holds, and its lifetime is this dialog's (docs/plans/phone-link.md, ruling 6).
  await page.click(DONE, { timeout: 15_000 })
  check('closing the dialog takes the link off screen with it', await settleGone(page, LINK, { timeoutMs: 15_000 }))

  // UNPAIR ROTATES BOTH IDS (ruling 3), which is the whole of "every link already out there is
  // dead": re-opening the dialog draws a different code, and it is still a valid pair link.
  await page.click(UNPAIR, { timeout: 15_000 })
  await page.click(PAIR, { timeout: 15_000 })
  const changed = await page
    .waitForFunction(
      (sel: { link: string; was: string }) => {
        const value = (document.querySelector(sel.link) as HTMLInputElement | null)?.value
        return value !== undefined && value !== '' && value !== sel.was
      },
      { link: LINK, was: link },
      { timeout: 20_000 }
    )
    .then(() => true, () => false)
  if (!check('Unpair all phones replaces the link', changed)) return
  const next = await valueOf(page, LINK)
  check('…with another one of the same shape', PAIR_URL.test(next), next)
  const room = /#r=([A-Za-z0-9_-]{22})/.exec(link)?.[1]
  const nextRoom = /#r=([A-Za-z0-9_-]{22})/.exec(next)?.[1]
  check('…on a different room id', room !== undefined && nextRoom !== undefined && room !== nextRoom)
  const key = /&k=([A-Za-z0-9_-]{43})/.exec(link)?.[1]
  const nextKey = /&k=([A-Za-z0-9_-]{43})/.exec(next)?.[1]
  check('…with a different key, so the old code opens nothing', key !== nextKey)
}

/** One launch, one step. Both launches drive the same navigation, so it lives here once. */
async function run(step: (page: Page) => Promise<void>, env?: Record<string, string>): Promise<void> {
  const { app, close } = await launchOnFixture('e2e-copy.log', env === undefined ? {} : { env })
  let page: Page | null = null
  try {
    page = await mainWindow(app)
    const consoleErrors: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text())
    })
    page.on('pageerror', (e) => consoleErrors.push(String(e)))

    await page.waitForSelector('[data-testid="nav-overview"]', { timeout: 60_000 })
    await answerNotice(page)
    if (await openSharing(page)) await step(page)

    check('no renderer console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))
    if (failures.length) await dumpArtifacts(page, 'phone-pair-FAIL')
  } finally {
    await close()
  }
}

async function main(): Promise<void> {
  buildIfStale()

  console.log('launch 1: the shipped state - no relay compiled in…')
  await run(stepDark)

  console.log('launch 2: the pairing seam - a real code, and still no socket…')
  await run(stepPair, { EQ_PHONE_E2E: '1' })

  reportRun()
}

main().catch((err: unknown) => {
  console.error('e2e: harness error -', err)
  note('the phone-pair spec did not complete')
  process.exitCode = 1
})
