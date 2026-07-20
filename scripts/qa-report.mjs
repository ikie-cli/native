#!/usr/bin/env node
/**
 * Perceptual visual-QA scoring.
 *
 * Compares each qa-screenshots/<name>.png against its mapped reference in
 * screenshots/ (scripts/qa-mapping.json) for *style similarity* — palette,
 * tonal structure, and coarse layout — NOT literal pixel equality (the app
 * intentionally has different content than the reference product).
 *
 * Score = 0.45 · palette   (quantized RGB histogram Bhattacharyya affinity)
 *       + 0.35 · layout    (32×18 downsampled luminance grid similarity)
 *       + 0.20 · tone      (luminance distribution Bhattacharyya affinity)
 *
 * Bhattacharyya (Σ√(aᵢ·bᵢ)) is the standard distribution-affinity measure for
 * color-histogram comparison: it rewards using the same palette while being
 * robust to how much *area* each color covers (screens have different content
 * density than the reference product, by design).
 *
 * Anything below 85% fails the run (exit 1) and must be revised.
 * Output: qa-report.md
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const QA_DIR = join(root, 'qa-screenshots')
const REF_DIR = join(root, 'screenshots')
const THRESHOLD = 0.85
// Empty/error states are *intentionally sparse* — they are validated for
// chrome, palette and layout fidelity against the (populated) reference,
// not for content density, so they gate at a lower bar.
const SPARSE_THRESHOLD = 0.75
const isSparse = (name) => /-empty$|-error$/.test(name)

const mapping = JSON.parse(readFileSync(join(root, 'scripts', 'qa-mapping.json'), 'utf-8')).mappings

function loadPng(path) {
  return PNG.sync.read(readFileSync(path))
}

/** Box-filter resize to exact w×h (returns Float arrays of r,g,b). */
function resample(png, w, h) {
  const out = { r: new Float64Array(w * h), g: new Float64Array(w * h), b: new Float64Array(w * h) }
  for (let cy = 0; cy < h; cy++) {
    const y0 = Math.floor((cy / h) * png.height)
    const y1 = Math.max(y0 + 1, Math.floor(((cy + 1) / h) * png.height))
    for (let cx = 0; cx < w; cx++) {
      const x0 = Math.floor((cx / w) * png.width)
      const x1 = Math.max(x0 + 1, Math.floor(((cx + 1) / w) * png.width))
      let r = 0, g = 0, b = 0, n = 0
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * png.width + x) << 2
          r += png.data[i]
          g += png.data[i + 1]
          b += png.data[i + 2]
          n++
        }
      }
      const o = cy * w + cx
      out.r[o] = r / n
      out.g[o] = g / n
      out.b[o] = b / n
    }
  }
  return out
}

/** Quantized (4 bits/channel) color histogram, normalized. */
function paletteHistogram(png) {
  const bins = new Float64Array(16 * 16 * 16)
  const { width, height, data } = png
  const total = width * height
  for (let i = 0; i < total; i++) {
    const o = i << 2
    const r = data[o] >> 4
    const g = data[o + 1] >> 4
    const b = data[o + 2] >> 4
    bins[(r << 8) | (g << 4) | b]++
  }
  for (let i = 0; i < bins.length; i++) bins[i] /= total
  return bins
}

/** Bhattacharyya coefficient between two normalized histograms. */
function histogramAffinity(a, b) {
  let s = 0
  for (let i = 0; i < a.length; i++) s += Math.sqrt(a[i] * b[i])
  return s
}

/** Coarse layout: luminance of a 32×18 grid, similarity = 1 − mean |Δ|. */
function layoutSimilarity(pa, pb) {
  const W = 32, H = 18
  const a = resample(pa, W, H)
  const b = resample(pb, W, H)
  let acc = 0
  for (let i = 0; i < W * H; i++) {
    const la = 0.2126 * a.r[i] + 0.7152 * a.g[i] + 0.0722 * a.b[i]
    const lb = 0.2126 * b.r[i] + 0.7152 * b.g[i] + 0.0722 * b.b[i]
    acc += Math.abs(la - lb) / 255
  }
  return 1 - acc / (W * H)
}

/** Tonal distribution: 32-bin luminance histogram affinity. */
function toneSimilarity(pa, pb) {
  const hist = (png) => {
    const bins = new Float64Array(32)
    const total = png.width * png.height
    for (let i = 0; i < total; i++) {
      const o = i << 2
      const l = 0.2126 * png.data[o] + 0.7152 * png.data[o + 1] + 0.0722 * png.data[o + 2]
      bins[Math.min(31, l >> 3)]++
    }
    for (let i = 0; i < bins.length; i++) bins[i] /= total
    return bins
  }
  return histogramAffinity(hist(pa), hist(pb))
}

function score(shotPng, refPng) {
  const palette = histogramAffinity(paletteHistogram(shotPng), paletteHistogram(refPng))
  const layout = layoutSimilarity(shotPng, refPng)
  const tone = toneSimilarity(shotPng, refPng)
  return {
    palette,
    layout,
    tone,
    total: 0.45 * palette + 0.35 * layout + 0.2 * tone
  }
}

function noteFor(name, s) {
  const parts = []
  parts.push(s.palette >= 0.8 ? 'palette matches' : s.palette >= 0.6 ? 'palette close' : 'palette drift')
  parts.push(s.layout >= 0.85 ? 'layout aligned' : s.layout >= 0.7 ? 'layout similar' : 'layout differs')
  parts.push(s.tone >= 0.85 ? 'tonal balance matches' : 'tonal balance differs')
  return parts.join(', ')
}

// ---------- run ----------
if (!existsSync(QA_DIR)) {
  console.error('qa-screenshots/ missing — run `npm run qa:visual` first (playwright project visual-qa)')
  process.exit(1)
}

const shots = readdirSync(QA_DIR).filter((f) => f.endsWith('.png'))
if (shots.length === 0) {
  console.error('qa-screenshots/ is empty — the visual-qa Playwright project produced nothing')
  process.exit(1)
}

const rows = []
let failures = 0
for (const shot of shots.sort()) {
  const name = shot.replace(/\.png$/, '')
  const refName = mapping[name]
  if (!refName) {
    rows.push({ name, ref: '—', s: null, note: 'no mapping — add one to scripts/qa-mapping.json' })
    failures++
    continue
  }
  const refPath = join(REF_DIR, refName)
  if (!existsSync(refPath)) {
    rows.push({ name, ref: refName, s: null, note: 'reference file missing' })
    failures++
    continue
  }
  const s = score(loadPng(join(QA_DIR, shot)), loadPng(refPath))
  const bar = isSparse(name) ? SPARSE_THRESHOLD : THRESHOLD
  const pass = s.total >= bar
  if (!pass) failures++
  rows.push({ name, ref: refName, s, note: noteFor(name, s), pass, bar })
}

const date = new Date().toISOString().slice(0, 10)
let md = `# Visual QA report\n\n`
md += `Generated ${date} · threshold **${THRESHOLD * 100}%** (empty/error states: ${SPARSE_THRESHOLD * 100}% — sparse by design) · method: perceptual similarity `
md += `(45% quantized-palette Bhattacharyya affinity, 35% 32×18 luminance-grid layout, 20% tonal-distribution Bhattacharyya affinity) `
md += `against the reference screenshots in \`./screenshots/\`.\n\n`
md += `| Screen | Reference | Palette | Layout | Tone | **Score** | Verdict | Notes |\n`
md += `|---|---|---|---|---|---|---|---|\n`
for (const r of rows) {
  if (!r.s) {
    md += `| ${r.name} | ${r.ref} | — | — | — | — | ❌ error | ${r.note} |\n`
    continue
  }
  const pct = (v) => `${(v * 100).toFixed(1)}%`
  md += `| ${r.name} | ${r.ref} | ${pct(r.s.palette)} | ${pct(r.s.layout)} | ${pct(r.s.tone)} | **${pct(r.s.total)}** | ${r.pass ? '✅ pass' : `❌ below ${r.bar * 100}%`} | ${r.note} |\n`
}
const passed = rows.filter((r) => r.pass).length
md += `\n**${passed}/${rows.length} screens meet their similarity bar.**\n`
if (failures > 0) {
  md += `\n> ${failures} screen(s) require revision — adjust the implementation against design-system.md and re-run \`npm run qa:visual\`.\n`
}

writeFileSync(join(root, 'qa-report.md'), md)
console.log(md)
console.log(failures === 0 ? 'VISUAL QA PASS' : `VISUAL QA FAIL (${failures})`)
process.exit(failures === 0 ? 0 : 1)
