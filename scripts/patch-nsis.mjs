#!/usr/bin/env node
/**
 * Post-install patch: lets electron-builder produce NSIS installers on hosts
 * without a working wine (e.g. arm64 Linux) by extending the pure-JS
 * uninstaller extractor branch (normally macOS-Catalina-only) to fire when
 * NSIS_UNINSTALLER_READER=true. No behavior change unless the env var is set.
 *
 * Pair with a system/native makensis staged into
 * ~/.cache/electron-builder/nsis/nsis-3.0.4.1/linux/makensis
 * (see docs in RELEASE.md — CI's x64 runners need none of this).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const target = join(root, 'node_modules/app-builder-lib/out/targets/nsis/NsisTarget.js')

if (!existsSync(target)) {
  console.log('[patch-nsis] app-builder-lib not present — skipping')
  process.exit(0)
}

const src = readFileSync(target, 'utf-8')
const needle = 'if ((0, macosVersion_1.isMacOsCatalina)()) {'
const patched = 'if ((0, macosVersion_1.isMacOsCatalina)() || process.env.NSIS_UNINSTALLER_READER === "true") {'

if (src.includes(patched)) {
  console.log('[patch-nsis] already patched')
} else if (src.includes(needle)) {
  writeFileSync(target, src.replace(needle, patched))
  console.log('[patch-nsis] applied')
} else {
  console.warn('[patch-nsis] anchor not found — electron-builder layout changed; NSIS-on-arm64 patch skipped')
}
