// gen-assets.mts — the app icon, the adaptive icon, the splash mark and the notification
// silhouette, all derived from ONE source: `build/icon.png`, the desktop app's own mark.
//
// Run from the repo root (the root's tsx is the one that resolves `node:zlib` types):
//
//   npx tsx mobile/scripts/gen-assets.mts
//
// ZERO DEPENDENCIES, for `scripts/gen-icon.mts`'s reason exactly: an icon pipeline that needs a
// native image library is an icon pipeline that breaks on somebody else's machine. The source is
// 256x256 RGBA and every output is an INTEGER multiple or divisor of it, so the scale is a block
// replication with no resampling and no blur - which is the right answer for a mark whose whole
// silhouette is chamfers and hard neon edges.
//
// WHY FOUR FILES AND NOT ONE:
//   icon.png              1024, OPAQUE. iOS refuses an icon with an alpha channel, so the mark is
//                         flattened onto the app's ground colour rather than left transparent.
//   adaptive-icon.png     1024, transparent, mark inset to the central 66% - Android crops an
//                         adaptive foreground to a shape it chooses, and the corners are not safe.
//   splash-icon.png       512, transparent. expo-splash-screen lays it on `backgroundColor`.
//   notification-icon.png 128, WHITE on transparent. Android draws a notification small icon as a
//                         mask: every non-transparent pixel becomes the system tint, so colour in
//                         it is thrown away and any anti-aliased edge becomes a grey halo.

import { deflateSync, inflateSync } from 'node:zlib'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The app's ground colour — `src/shared/palette.ts` PALETTE.bg, and the phone page's `--ground`. */
const GROUND: [number, number, number] = [0x0c, 0x0a, 0x1f]

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..')
const outDir = join(here, '..', 'assets')

interface Image {
  w: number
  h: number
  /** RGBA, row-major, 4 bytes per pixel. */
  px: Uint8Array
}

// ------------------------------------------------------------------------------------ decode

/** Every IDAT chunk's payload, concatenated. A PNG may split the stream at any byte. */
function idat(png: Buffer): Buffer {
  const parts: Buffer[] = []
  let at = 8
  while (at + 8 <= png.length) {
    const len = png.readUInt32BE(at)
    const kind = png.toString('ascii', at + 4, at + 8)
    if (kind === 'IDAT') parts.push(png.subarray(at + 8, at + 8 + len))
    if (kind === 'IEND') break
    at += 12 + len
  }
  return Buffer.concat(parts)
}

/** One scanline's filter undone, in place. The five types of the PNG spec, and nothing else. */
function unfilter(type: number, line: Uint8Array, prev: Uint8Array, bpp: number): void {
  for (let i = 0; i < line.length; i++) {
    const a = i >= bpp ? line[i - bpp] : 0
    const b = prev[i] ?? 0
    const c = i >= bpp ? (prev[i - bpp] ?? 0) : 0
    let add = 0
    if (type === 1) add = a
    else if (type === 2) add = b
    else if (type === 3) add = (a + b) >> 1
    else if (type === 4) {
      const p = a + b - c
      const pa = Math.abs(p - a)
      const pb = Math.abs(p - b)
      const pc = Math.abs(p - c)
      add = pa <= pb && pa <= pc ? a : pb <= pc ? b : c
    }
    line[i] = (line[i] + add) & 0xff
  }
}

/** An 8-bit RGBA, non-interlaced PNG. Anything else throws rather than guessing. */
function decodePng(png: Buffer): Image {
  const w = png.readUInt32BE(16)
  const h = png.readUInt32BE(20)
  if (png[24] !== 8 || png[25] !== 6 || png[28] !== 0) {
    throw new Error('gen-assets: the source must be an 8-bit RGBA, non-interlaced PNG')
  }
  const raw = inflateSync(idat(png))
  const stride = w * 4
  const px = new Uint8Array(w * h * 4)
  let prev = new Uint8Array(stride)
  for (let y = 0; y < h; y++) {
    const at = y * (stride + 1)
    const line = raw.subarray(at + 1, at + 1 + stride)
    unfilter(raw[at], line, prev, 4)
    px.set(line, y * stride)
    prev = line
  }
  return { w, h, px }
}

// ------------------------------------------------------------------------------------ encode

function chunk(kind: string, body: Buffer): Buffer {
  const out = Buffer.alloc(body.length + 12)
  out.writeUInt32BE(body.length, 0)
  out.write(kind, 4, 'ascii')
  body.copy(out, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length)
  return out
}

const CRC_TABLE = ((): Uint32Array => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function encodePng(img: Image): Buffer {
  const stride = img.w * 4
  const raw = Buffer.alloc((stride + 1) * img.h)
  for (let y = 0; y < img.h; y++) {
    raw[y * (stride + 1)] = 0
    Buffer.from(img.px.subarray(y * stride, (y + 1) * stride)).copy(raw, y * (stride + 1) + 1)
  }
  const head = Buffer.alloc(13)
  head.writeUInt32BE(img.w, 0)
  head.writeUInt32BE(img.h, 4)
  head[8] = 8
  head[9] = 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', head),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

// ------------------------------------------------------------------------------------ compose

function blank(size: number): Image {
  return { w: size, h: size, px: new Uint8Array(size * size * 4) }
}

/** Block scale by an integer factor, then paste at (x0, y0). No resampling: hard edges stay hard. */
function paste(dst: Image, src: Image, factor: number, x0: number, y0: number): void {
  for (let y = 0; y < src.h * factor; y++) {
    for (let x = 0; x < src.w * factor; x++) {
      const s = (Math.floor(y / factor) * src.w + Math.floor(x / factor)) * 4
      const d = ((y + y0) * dst.w + (x + x0)) * 4
      if (d < 0 || d + 3 >= dst.px.length) continue
      dst.px[d] = src.px[s]
      dst.px[d + 1] = src.px[s + 1]
      dst.px[d + 2] = src.px[s + 2]
      dst.px[d + 3] = src.px[s + 3]
    }
  }
}

/** Box-average down by an integer factor. The only place a pixel is ever mixed with a neighbour. */
function shrink(src: Image, factor: number): Image {
  const out = blank(src.w / factor)
  for (let y = 0; y < out.h; y++) {
    for (let x = 0; x < out.w; x++) {
      const acc = [0, 0, 0, 0]
      for (let dy = 0; dy < factor; dy++) {
        for (let dx = 0; dx < factor; dx++) {
          const s = ((y * factor + dy) * src.w + x * factor + dx) * 4
          for (let c = 0; c < 4; c++) acc[c] += src.px[s + c]
        }
      }
      const d = (y * out.w + x) * 4
      for (let c = 0; c < 4; c++) out.px[d + c] = Math.round(acc[c] / (factor * factor))
    }
  }
  return out
}

/** Flatten onto one opaque colour. iOS refuses an app icon that carries an alpha channel. */
function flatten(img: Image, rgb: readonly [number, number, number]): Image {
  const out = blank(img.w)
  for (let i = 0; i < img.px.length; i += 4) {
    const a = img.px[i + 3] / 255
    for (let c = 0; c < 3; c++) out.px[i + c] = Math.round(img.px[i + c] * a + rgb[c] * (1 - a))
    out.px[i + 3] = 255
  }
  return out
}

/** Every visible pixel becomes opaque white; everything else disappears. Android's icon mask. */
function silhouette(img: Image): Image {
  const out = blank(img.w)
  for (let i = 0; i < img.px.length; i += 4) {
    const on = img.px[i + 3] >= 128
    out.px[i] = 255
    out.px[i + 1] = 255
    out.px[i + 2] = 255
    out.px[i + 3] = on ? 255 : 0
  }
  return out
}

// --------------------------------------------------------------------------------------- run

const source = decodePng(readFileSync(join(repo, 'build', 'icon.png')))
if (source.w !== 256 || source.h !== 256) {
  throw new Error(`gen-assets: expected a 256x256 source, got ${source.w}x${source.h}`)
}
mkdirSync(outDir, { recursive: true })

const full = blank(1024)
paste(full, source, 4, 0, 0)
writeFileSync(join(outDir, 'icon.png'), encodePng(flatten(full, GROUND)))

// The central 66% is the only part of an adaptive foreground every launcher shape keeps.
const adaptive = blank(1024)
paste(adaptive, source, 2, 256, 256)
writeFileSync(join(outDir, 'adaptive-icon.png'), encodePng(adaptive))

const splash = blank(512)
paste(splash, source, 2, 0, 0)
writeFileSync(join(outDir, 'splash-icon.png'), encodePng(splash))

writeFileSync(join(outDir, 'notification-icon.png'), encodePng(silhouette(shrink(full, 8))))

process.stdout.write(
  'gen-assets: wrote icon.png, adaptive-icon.png, splash-icon.png, notification-icon.png\n'
)
