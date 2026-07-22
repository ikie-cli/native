#!/usr/bin/env node
/**
 * Pure-JS Windows exe branding — stamps the real Native icon and version info
 * into the built Native.exe using the `resedit` package (v1 API). This replaces
 * the rcedit/wine step, which is unavailable on this arm64 host.
 *
 * Usage: node scripts/brand-win-exe.mjs [path-to-exe]
 *   default path: dist/win-unpacked/Native.exe
 */
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { NtExecutable, NtExecutableResource, Data, Resource } = require('resedit')

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const LANG = 1033 // en-US
const CODEPAGE = 1200 // UTF-16

function main() {
  const exePath = resolve(process.argv[2] ?? join(root, 'dist', 'win-unpacked', 'Native.exe'))
  const icoPath = join(root, 'build', 'icon.ico')
  const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const [major, minor, patch] = version.split(/[.-]/).slice(0, 3).map(Number)

  if (!existsSync(exePath)) {
    throw new Error(`exe not found: ${exePath} — build it first (e.g. electron-builder --dir)`)
  }
  if (!existsSync(icoPath)) {
    throw new Error(`icon not found: ${icoPath} — run "node scripts/gen-icon.mjs" first`)
  }

  const inputBuffer = readFileSync(exePath)
  const beforeSize = inputBuffer.length

  // Parse the PE. ignoreCert avoids choking on any embedded signature block.
  const exe = NtExecutable.from(inputBuffer, { ignoreCert: true })
  const res = NtExecutableResource.from(exe)

  // ---- icons ----
  const iconFile = Data.IconFile.from(readFileSync(icoPath))
  Resource.IconGroupEntry.replaceIconsForResource(
    res.entries,
    1, // icon group id (matches the primary group electron-builder emits)
    LANG,
    iconFile.icons.map((i) => i.data)
  )

  // ---- version info ----
  const vi = Resource.VersionInfo.createEmpty()
  vi.setFileVersion(major, minor, patch, 0, LANG)
  vi.setProductVersion(major, minor, patch, 0, LANG)
  vi.setStringValues(
    { lang: LANG, codepage: CODEPAGE },
    {
      ProductName: 'Native',
      FileDescription: 'Native — a fast, beautiful Minecraft launcher',
      CompanyName: 'Native Labs',
      LegalCopyright: '© 2026 Native Labs',
      OriginalFilename: 'Native.exe',
      InternalName: 'Native',
      FileVersion: version,
      ProductVersion: version
    }
  )
  vi.outputToResourceEntries(res.entries)

  // ---- write back ----
  res.outputResource(exe)
  const outputBuffer = Buffer.from(exe.generate())
  writeFileSync(exePath, outputBuffer)

  console.log(`branded ${exePath}`)
  console.log(`  size: ${beforeSize} -> ${outputBuffer.length} bytes`)
}

try {
  main()
} catch (err) {
  console.error('brand-win-exe failed:', err instanceof Error ? err.message : err)
  process.exitCode = 1
}
