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

function patch(file, needle, replacement, label) {
  if (!existsSync(file)) {
    console.log(`[patch-nsis] ${label}: file missing — skipping`)
    return
  }
  const src = readFileSync(file, 'utf-8')
  if (src.includes(replacement)) {
    console.log(`[patch-nsis] ${label}: already patched`)
  } else if (src.includes(needle)) {
    writeFileSync(file, src.replace(needle, replacement))
    console.log(`[patch-nsis] ${label}: applied`)
  } else {
    console.warn(`[patch-nsis] ${label}: anchor not found — skipped`)
  }
}

// 1. Allow the pure-JS uninstaller extractor off-macOS (no wine needed).
patch(
  join(root, 'node_modules/app-builder-lib/out/targets/nsis/NsisTarget.js'),
  'if ((0, macosVersion_1.isMacOsCatalina)()) {',
  'if ((0, macosVersion_1.isMacOsCatalina)() || process.env.NSIS_UNINSTALLER_READER === "true") {',
  'uninstaller extractor'
)

// 2. UninstallerReader: accept mingw-built stubs (.idata/.bss/.ndata carry
//    raw data in Debian's NSIS 3.05) — any raw section extends the PE end.
patch(
  join(root, 'node_modules/app-builder-lib/out/targets/nsis/nsisUtil.js'),
  `            switch (name) {
                case ".text":
                case ".rdata":
                case ".data":
                case ".rsrc": {
                    nsisOffset = Math.max(rawPointer + rawSize, nsisOffset);
                    break;
                }
                default: {
                    if (rawPointer !== 0 && rawSize !== 0) {
                        throw new Error("Unsupported section '" + name + "'.");
                    }
                    break;
                }
            }`,
  `            // Patched (Native): any section with raw data extends the PE end;
            // non-MSVC stubs (mingw builds: .idata/.bss/.ndata with data) are fine.
            if (rawPointer !== 0 && rawSize !== 0) {
                nsisOffset = Math.max(rawPointer + rawSize, nsisOffset);
            }`,
  'section reader'
)
