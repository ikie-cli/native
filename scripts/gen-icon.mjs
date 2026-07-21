#!/usr/bin/env node
/**
 * Native logo generator — draws the brand mark at any size with 4×4
 * supersampling:
 *
 *   • Squircle app tile with a vertical brand-green gradient + subtle
 *     inner top highlight.
 *   • The "N" glyph built from three pixel-column bars (Minecraft voxel
 *     motif): two verticals + a stepped diagonal of stacked blocks, in
 *     near-black green (#03150a) with a 1px darker drop step.
 *
 * Outputs:
 *   build/icon.png            512  (electron-builder Linux/deb/AppImage)
 *   build/icons/{16..1024}    png ladder (NSIS + freedesktop)
 *   resources/logo.svg        vector master (renderer/docs)
 */
import { mkdirSync, writeFileSync, readFileSync, copyFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// ---- palette ----
const GREEN_TOP = [0x24, 0xe7, 0x76]
const GREEN_BOT = [0x12, 0xb8, 0x59]
const INK = [0x03, 0x15, 0x0a]
const INK_SHADOW = [0x02, 0x0d, 0x06]

/** Superellipse (squircle) hit test, exponent 4 → Apple-ish tile. */
function inSquircle(x, y, cx, cy, r) {
  const dx = Math.abs(x - cx) / r
  const dy = Math.abs(y - cy) / r
  return dx ** 4 + dy ** 4 <= 1
}

/**
 * The N as voxel columns on a 10×10 glyph grid (row 0 = top):
 * col 1-2 full height, diagonal blocks stepping down, col 7-8 full height.
 */
const GRID = 10
const CELLS = new Set()
for (let r = 0; r < GRID; r++) {
  CELLS.add(`${1},${r}`)
  CELLS.add(`${2},${r}`)
  CELLS.add(`${7},${r}`)
  CELLS.add(`${8},${r}`)
}
// stepped diagonal: block pairs marching from top-left to bottom-right
for (const [c, r] of [
  [3, 2],
  [3, 3],
  [4, 3],
  [4, 4],
  [4, 5],
  [5, 4],
  [5, 5],
  [5, 6],
  [6, 6],
  [6, 7]
]) {
  CELLS.add(`${c},${r}`)
}

function inGlyph(u, v) {
  // u,v in 0..1 across the glyph box
  const c = Math.floor(u * GRID)
  const r = Math.floor(v * GRID)
  return CELLS.has(`${c},${r}`)
}

function renderTile(size) {
  const png = new PNG({ width: size, height: size })
  const margin = size * 0.03
  const cx = size / 2
  const cy = size / 2
  const radius = size / 2 - margin
  // glyph box: centered, 62% of tile
  const gSize = size * 0.62
  const gx = (size - gSize) / 2
  const gy = (size - gSize) / 2
  const shadowOff = Math.max(1, size * 0.012)

  const SS = 4
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let tile = 0
      let glyph = 0
      let shadow = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS
          const py = y + (sy + 0.5) / SS
          if (!inSquircle(px, py, cx, cy, radius)) continue
          tile++
          const u = (px - gx) / gSize
          const v = (py - gy) / gSize
          if (u >= 0 && u < 1 && v >= 0 && v < 1 && inGlyph(u, v)) glyph++
          else {
            const us = (px - gx - shadowOff) / gSize
            const vs = (py - gy - shadowOff) / gSize
            if (us >= 0 && us < 1 && vs >= 0 && vs < 1 && inGlyph(us, vs)) shadow++
          }
        }
      }
      const n = SS * SS
      const tileCov = tile / n
      const glyphCov = glyph / n
      const shadowCov = shadow / n
      const bgCov = Math.max(0, tileCov - glyphCov - shadowCov)

      const t = y / size
      const bg = [
        GREEN_TOP[0] + (GREEN_BOT[0] - GREEN_TOP[0]) * t,
        GREEN_TOP[1] + (GREEN_BOT[1] - GREEN_TOP[1]) * t,
        GREEN_TOP[2] + (GREEN_BOT[2] - GREEN_TOP[2]) * t
      ]
      // top inner highlight
      if (t < 0.18) {
        const h = (0.18 - t) / 0.18
        bg[0] = Math.min(255, bg[0] + 26 * h)
        bg[1] = Math.min(255, bg[1] + 26 * h)
        bg[2] = Math.min(255, bg[2] + 26 * h)
      }

      const i = (y * size + x) << 2
      png.data[i] = Math.round(bg[0] * bgCov + INK[0] * glyphCov + INK_SHADOW[0] * shadowCov)
      png.data[i + 1] = Math.round(bg[1] * bgCov + INK[1] * glyphCov + INK_SHADOW[1] * shadowCov)
      png.data[i + 2] = Math.round(bg[2] * bgCov + INK[2] * glyphCov + INK_SHADOW[2] * shadowCov)
      png.data[i + 3] = Math.round(tileCov * 255)
    }
  }
  return PNG.sync.write(png)
}

// ---- SVG master (same geometry, vector) ----
function svgMaster() {
  const size = 512
  const gSize = size * 0.62
  const gx = (size - gSize) / 2
  const cell = gSize / GRID
  const shadowOff = size * 0.012
  let blocks = ''
  let shadows = ''
  for (const key of CELLS) {
    const [c, r] = key.split(',').map(Number)
    const bx = (gx + c * cell).toFixed(1)
    const by = (gx + r * cell).toFixed(1)
    const s = (cell + 0.35).toFixed(1) // overlap kills hairline seams
    shadows += `<rect x="${(+bx + shadowOff).toFixed(1)}" y="${(+by + shadowOff).toFixed(1)}" width="${s}" height="${s}"/>`
    blocks += `<rect x="${bx}" y="${by}" width="${s}" height="${s}"/>`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#24e776"/>
      <stop offset="1" stop-color="#12b859"/>
    </linearGradient>
  </defs>
  <!-- squircle approximated by a high-radius rounded rect -->
  <rect x="15" y="15" width="482" height="482" rx="132" fill="url(#bg)"/>
  <g fill="#020d06" opacity="0.9">${shadows}</g>
  <g fill="#03150a">${blocks}</g>
</svg>
`
}

// ---- pure-JS ICO writer ----
/**
 * Pack a set of PNG buffers into a single Windows .ico (PNG-embedded entries).
 * ICO layout:
 *   6-byte header: u16 reserved(0), u16 type(1=icon), u16 image count
 *   16-byte dir entry per image: w, h (0 means 256), colorCount(0), reserved(0),
 *     u16 planes(1), u16 bpp(32), u32 byteSize, u32 offset
 *   raw PNG blobs concatenated after the directory
 */
function buildIco(images) {
  const count = images.length
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(count, 4) // image count

  const dir = Buffer.alloc(16 * count)
  let offset = 6 + 16 * count
  images.forEach((img, i) => {
    const base = i * 16
    dir.writeUInt8(img.size >= 256 ? 0 : img.size, base + 0) // width (0 = 256)
    dir.writeUInt8(img.size >= 256 ? 0 : img.size, base + 1) // height (0 = 256)
    dir.writeUInt8(0, base + 2) // color palette count
    dir.writeUInt8(0, base + 3) // reserved
    dir.writeUInt16LE(1, base + 4) // color planes
    dir.writeUInt16LE(32, base + 6) // bits per pixel
    dir.writeUInt32LE(img.data.length, base + 8) // byte size of image
    dir.writeUInt32LE(offset, base + 12) // offset of image data
    offset += img.data.length
  })

  return Buffer.concat([header, dir, ...images.map((img) => img.data)])
}

// ---- write everything ----
mkdirSync(join(root, 'build', 'icons'), { recursive: true })
mkdirSync(join(root, 'resources'), { recursive: true })
mkdirSync(join(root, 'src', 'renderer', 'src', 'assets'), { recursive: true })

writeFileSync(join(root, 'build', 'icon.png'), renderTile(512))
for (const s of [16, 24, 32, 48, 64, 128, 256, 512, 1024]) {
  writeFileSync(join(root, 'build', 'icons', `${s}x${s}.png`), renderTile(s))
}
writeFileSync(join(root, 'resources', 'logo.svg'), svgMaster())

// Windows multi-resolution .ico from the PNG ladder (16..256).
const icoSizes = [16, 24, 32, 48, 64, 128, 256]
const ico = buildIco(
  icoSizes.map((size) => ({ size, data: readFileSync(join(root, 'build', 'icons', `${size}x${size}.png`)) }))
)
writeFileSync(join(root, 'build', 'icon.ico'), ico)

// Runtime assets: window/tray icons + renderer wordmark.
copyFileSync(join(root, 'build', 'icon.png'), join(root, 'resources', 'icon.png'))
copyFileSync(join(root, 'build', 'icons', '32x32.png'), join(root, 'resources', 'tray.png'))
copyFileSync(join(root, 'build', 'icon.png'), join(root, 'src', 'renderer', 'src', 'assets', 'icon.png'))

console.log(
  'logo set written: build/icon.png, build/icons/{16..1024}, build/icon.ico, resources/{logo.svg,icon.png,tray.png}, src/renderer/src/assets/icon.png'
)
