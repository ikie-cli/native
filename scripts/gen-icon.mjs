#!/usr/bin/env node
/**
 * Generates build/icon.png (512×512): the Native mark — brand-green rounded
 * square with the dark "N" glyph, matching the in-app wordmark SVG.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SIZE = 512
const png = new PNG({ width: SIZE, height: SIZE })

const GREEN = [0x1b, 0xd9, 0x6a]
const DARK = [0x03, 0x15, 0x0a]
const R = 118 // corner radius ≈ 23% (matches the 6/26 ratio of the wordmark)

function inRoundedRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false
  const cx = x < x0 + r ? x0 + r : x > x1 - r ? x1 - r : x
  const cy = y < y0 + r ? y0 + r : y > y1 - r ? y1 - r : y
  if ((x < x0 + r || x > x1 - r) && (y < y0 + r || y > y1 - r)) {
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
  }
  return true
}

/** Distance from point p to segment a-b. */
function segDist(px, py, ax, ay, bx, by) {
  const abx = bx - ax
  const aby = by - ay
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / (abx * abx + aby * aby)))
  const qx = ax + t * abx
  const qy = ay + t * aby
  return Math.hypot(px - qx, py - qy)
}

// The "N": two verticals + diagonal, stroke ≈ 44px, in the 512 box.
const STROKE = 46
const L = 168 // left x
const RGT = 344 // right x
const TOP = 158
const BOT = 354

function inGlyph(x, y) {
  const d1 = segDist(x, y, L, BOT, L, TOP + 14)
  const d2 = segDist(x, y, L + 8, TOP + 8, RGT - 8, BOT - 8)
  const d3 = segDist(x, y, RGT, BOT - 14, RGT, TOP)
  return Math.min(d1, d2, d3) <= STROKE / 2
}

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const i = (y * SIZE + x) << 2
    // supersample 2×2 for smooth edges
    let bgCov = 0
    let glyphCov = 0
    for (const [dx, dy] of [
      [0.25, 0.25],
      [0.75, 0.25],
      [0.25, 0.75],
      [0.75, 0.75]
    ]) {
      const sx = x + dx
      const sy = y + dy
      if (inRoundedRect(sx, sy, 16, 16, SIZE - 16, SIZE - 16, R)) {
        bgCov++
        if (inGlyph(sx, sy)) glyphCov++
      }
    }
    bgCov /= 4
    glyphCov /= 4
    const r = GREEN[0] * (bgCov - glyphCov) + DARK[0] * glyphCov
    const g = GREEN[1] * (bgCov - glyphCov) + DARK[1] * glyphCov
    const b = GREEN[2] * (bgCov - glyphCov) + DARK[2] * glyphCov
    png.data[i] = Math.round(r)
    png.data[i + 1] = Math.round(g)
    png.data[i + 2] = Math.round(b)
    png.data[i + 3] = Math.round(bgCov * 255)
  }
}

mkdirSync(join(root, 'build'), { recursive: true })
writeFileSync(join(root, 'build', 'icon.png'), PNG.sync.write(png))
console.log('build/icon.png written (512×512)')
