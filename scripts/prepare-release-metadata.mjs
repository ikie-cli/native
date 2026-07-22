#!/usr/bin/env node

import { createRequire } from 'node:module'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const { load, dump } = require('js-yaml')

const [distDir = 'dist', tag] = process.argv.slice(2)
if (!tag) throw new Error('Usage: node scripts/prepare-release-metadata.mjs <dist> <tag>')

const version = tag.replace(/^v/, '')
const channel = version.includes('-nightly.') ? 'nightly' : version.includes('-beta.') ? 'beta' : 'latest'
if (version.includes('-') && channel === 'latest') {
  throw new Error(`Unsupported prerelease channel in ${tag}; expected -beta.N or -nightly.N`)
}

const staged = (platform, arch) => join(distDir, `release-meta-${platform}-${arch}.yml`)
const read = (platform, arch) => {
  const path = staged(platform, arch)
  if (!existsSync(path)) throw new Error(`Missing staged metadata: ${path}`)
  const value = load(readFileSync(path, 'utf8'))
  if (!value || typeof value !== 'object' || value.version !== version || !Array.isArray(value.files)) {
    throw new Error(`Invalid ${platform}-${arch} metadata or version mismatch in ${path}`)
  }
  return value
}

const docs = {
  windows: { x64: read('windows', 'x64'), arm64: read('windows', 'arm64') },
  linux: { x64: read('linux', 'x64'), arm64: read('linux', 'arm64') },
  mac: { x64: read('mac', 'x64'), arm64: read('mac', 'arm64') }
}

const filesFor = (doc, pattern) => doc.files.filter((file) => pattern.test(String(file.url)))
const uniqueFiles = (files) => [
  ...new Map(files.map((file) => [String(file.url), file])).values()
]
const requireMatch = (files, pattern, label) => {
  if (!files.some((file) => pattern.test(String(file.url)))) {
    throw new Error(`Release metadata is missing ${label}`)
  }
}
const write = (name, base, files, preferred) => {
  const selected = uniqueFiles(files)
  requireMatch(selected, preferred, `${name} preferred update payload`)
  const primary = selected.find((file) => preferred.test(String(file.url)))
  const output = {
    ...base,
    files: selected,
    path: primary.url,
    sha512: primary.sha512,
    releaseDate: base.releaseDate ?? new Date().toISOString()
  }
  writeFileSync(join(distDir, name), dump(output, { lineWidth: -1, noRefs: true, quotingType: "'" }))
  console.log(`[release-meta] wrote ${name}: ${selected.map((file) => file.url).join(', ')}`)
}

const windowsFiles = uniqueFiles([
  ...filesFor(docs.windows.x64, /\.exe$/i),
  ...filesFor(docs.windows.arm64, /\.exe$/i)
])
requireMatch(windowsFiles, /-x64\.exe$/i, 'Windows x64 installer')
requireMatch(windowsFiles, /-arm64\.exe$/i, 'Windows ARM64 installer')
write(`${channel}.yml`, docs.windows.x64, windowsFiles, /-x64\.exe$/i)

for (const arch of ['x64', 'arm64']) {
  const name = `${channel}-linux${arch === 'x64' ? '' : '-arm64'}.yml`
  const pattern = arch === 'x64' ? /-x86_64\.AppImage$/ : /-arm64\.AppImage$/
  write(name, docs.linux[arch], docs.linux[arch].files, pattern)
}

const macFiles = uniqueFiles([...docs.mac.x64.files, ...docs.mac.arm64.files])
requireMatch(macFiles, /-x64\.zip$/i, 'macOS x64 ZIP')
requireMatch(macFiles, /-arm64\.zip$/i, 'macOS ARM64 ZIP')
write(`${channel}-mac.yml`, docs.mac.x64, macFiles, /-x64\.zip$/i)

for (const platform of ['windows', 'linux', 'mac']) {
  for (const arch of ['x64', 'arm64']) unlinkSync(staged(platform, arch))
}
