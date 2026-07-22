// Repack Windows update metadata after out-of-band code signing (SignPath).
//
// SignPath signs the .exe on its own HSM *after* electron-builder has already
// written latest.yml and the .blockmap from the UNSIGNED binary. Signing mutates
// the file, so those hashes no longer match and electron-updater rejects every
// update with a sha512 mismatch. This regenerates the blockmap and rewrites
// latest.yml's sha512/size from the signed exe, using electron-builder's own
// buildBlockMap so the output is byte-identical to a native signed build.
//
// Usage: node scripts/repack-signed-win.mjs <dist-dir> <channel>
//   defaults: dist, latest

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { buildBlockMap } = require('app-builder-lib/out/targets/blockmap/blockmap.js')

const distDir = process.argv[2] ?? 'dist'
const channel = process.argv[3] ?? 'latest'
const ymlPath = join(distDir, `${channel}.yml`)

if (!existsSync(ymlPath)) {
  console.error(`[repack] ${ymlPath} not found — nothing to repack`)
  process.exit(1)
}

// Minimal, dependency-free YAML rewrite: electron-updater's latest.yml is a flat
// document with a single files: list, so targeted line edits are safer than a
// full parse/serialize round-trip (which can reorder keys or drop the exact
// quoting electron-updater expects).
const original = readFileSync(ymlPath, 'utf8')
const exeNames = [...original.matchAll(/(?:url|path):\s*(\S+\.exe)/g)].map((m) => m[1])
const uniqueExes = [...new Set(exeNames)]

if (uniqueExes.length === 0) {
  console.error('[repack] no .exe referenced in latest.yml')
  process.exit(1)
}

let text = original

for (const exe of uniqueExes) {
  const exePath = join(distDir, exe)
  if (!existsSync(exePath)) {
    console.error(`[repack] signed artifact missing: ${exePath}`)
    process.exit(1)
  }

  const blockmapPath = `${exePath}.blockmap`
  const { sha512, size } = await buildBlockMap(exePath, 'gzip', blockmapPath)

  // Replace the sha512/size that belong to THIS exe. In latest.yml the file's
  // sha512+size live in the files: block right after its url:, and the top-level
  // sha512 duplicates the (single) installer's hash. Rewriting all occurrences
  // of the old values is correct because they were all derived from this exe.
  const oldSha = matchAfter(original, exe, /sha512:\s*(\S+)/)
  const oldSize = matchAfter(original, exe, /size:\s*(\d+)/)

  if (oldSha) text = text.split(oldSha).join(sha512)
  if (oldSize) text = text.split(oldSize).join(String(size))

  console.log(`[repack] ${exe}`)
  console.log(`         sha512 ${oldSha?.slice(0, 12)}… → ${sha512.slice(0, 12)}…`)
  console.log(`         size   ${oldSize} → ${size}`)
  console.log(`         blockmap → ${blockmapPath}`)
}

writeFileSync(ymlPath, text)
console.log(`[repack] wrote ${ymlPath}`)

// Find the first `pattern` match appearing at or after the line that mentions
// `anchor` (the exe filename), so multi-installer feeds map values to the right
// artifact instead of always grabbing the first block.
function matchAfter(doc, anchor, pattern) {
  const idx = doc.indexOf(anchor)
  const region = idx === -1 ? doc : doc.slice(idx)
  const m = region.match(pattern)
  return m ? m[1] : null
}
