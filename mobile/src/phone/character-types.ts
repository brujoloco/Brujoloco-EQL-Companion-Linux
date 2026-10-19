// ============================================================================
// phone/character-types.ts — THE `character` PAYLOAD, MIRRORED (phone-native.md, section 2).
// ============================================================================
//
// The `character` channel carries `CharacterProfileShare` v2 — the SAME body a share link carries,
// built by the SAME `buildCharacterShare` (shared/phone/views.ts `phoneCharacter`). Its types live
// in `src/shared/characterShare.ts` and `src/shared/characterShareItem.ts`, and the `@shared/*`
// alias could import them with one line.
//
// IT DOES NOT, and this is the one deliberate exception to "import, never copy":
//
//   `characterShare.ts` imports `characterSheet.ts`, which imports `itemStats`, `itemUpgrade`,
//   `carryAll`, `inventory` … — a transitive closure of **72 shared modules**, every one of which
//   `tsc` would then parse, typecheck and hold in memory on every mobile typecheck, to define
//   eight interfaces. None of that code runs on the phone (the DESK builds the body; a viewer
//   only reads it), and none of it is even reachable — a `type` import emits nothing.
//
// So the eight interfaces are declared here, and `character-types.test.ts` reads the desktop's two
// source files and FAILS WHEN THE FIELD LISTS DIVERGE. The mirror cannot rot silently, which is
// the only property that made the trade worth making. If it ever costs more than it saves, the
// alias already exists and the import is a one-line change.

/** `ShareStatLine` — one stat row, with the value VERBATIM as the item states it. */
export interface ShareStatLine {
  key: string
  label: string
  value: string
}

/** `ShareEffect` — which socket, the spell name, the parenthetical. */
export interface ShareEffect {
  kind: string
  name: string
  detail?: string
}

/** `ShareWeapon` — the three weapon numbers. Ratio is DERIVED (`weaponRatio`), never carried. */
export interface ShareWeapon {
  dmg?: number
  delay?: number
  skill?: string
}

/** `ShareItemFacts` — what the wire says about one worn item beyond its name (body v2). */
export interface ShareItemFacts {
  base?: string
  /** false when the committed item DB had no record — "unknown", never "has no stats". */
  known: boolean
  ac?: number
  hp?: number
  mana?: number
  endurance?: number
  stats?: ShareStatLine[]
  effects?: ShareEffect[]
  flags?: string[]
  weapon?: ShareWeapon
}

/** `ShareCell` — one worn slot. */
export interface ShareCell extends ShareItemFacts {
  slot: string
  label: string
  item: string
  /** the ` +N` the name stated; ABSENT means the name carried none, not tier 0. */
  tier?: number
  iconId?: number
  exaltations: string[]
  ornament?: string
}

export interface ShareStat {
  label: string
  total: number
}

export interface ShareUnsummed {
  label: string
  values: string[]
}

export interface ShareTotals {
  ac: number
  stats: ShareStat[]
  saves: ShareStat[]
  unsummed: ShareUnsummed[]
  counted: number
  unknown: number
}

export interface ShareScores {
  tank: number
  dps: number
  heal: number
  solo: number
}

export interface ShareLook {
  race: string
  sex: string
  face?: number
}

/** `CharacterProfileShare` — the whole body. Optional fields are ABSENT facts, never zeroed ones. */
export interface CharacterProfileShare {
  v: number
  capturedAt: number
  name?: string
  level?: number
  classes: string[]
  look: ShareLook
  cells: ShareCell[]
  totals: ShareTotals
  scores?: ShareScores
}

/**
 * A `character` payload off the wire, checked enough to draw. It is already authenticated by GCM —
 * only the paired desktop could have sealed it — so this is a SHAPE check, not a trust boundary:
 * it exists so a v1 body, or a body from a desktop one version ahead, renders what it can instead
 * of crashing a tab.
 */
function whole(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function rows<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function asTotals(raw: unknown): ShareTotals {
  const totals = (raw ?? {}) as Record<string, unknown>
  return {
    ac: whole(totals.ac),
    stats: rows<ShareStat>(totals.stats),
    saves: rows<ShareStat>(totals.saves),
    unsummed: rows<ShareUnsummed>(totals.unsummed),
    counted: whole(totals.counted),
    unknown: whole(totals.unknown)
  }
}

export function asProfile(raw: unknown): CharacterProfileShare | null {
  if (!raw || typeof raw !== 'object') return null
  const body = raw as Record<string, unknown>
  if (typeof body.v !== 'number' || !Array.isArray(body.cells)) return null
  return {
    v: body.v,
    capturedAt: whole(body.capturedAt),
    ...(typeof body.name === 'string' ? { name: body.name } : {}),
    ...(typeof body.level === 'number' ? { level: body.level } : {}),
    classes: rows<unknown>(body.classes).filter((c): c is string => typeof c === 'string'),
    look: { race: '', sex: 'M' },
    cells: body.cells.filter((c): c is ShareCell => !!c && typeof c === 'object'),
    totals: asTotals(body.totals),
    ...(body.scores && typeof body.scores === 'object' ? { scores: body.scores as ShareScores } : {})
  }
}
