#!/usr/bin/env node

import { copyFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const [distDir = 'dist', platform, arch, channel = 'latest'] = process.argv.slice(2)
if (!platform || !arch || !['windows', 'linux', 'mac'].includes(platform)) {
  throw new Error(
    'Usage: node scripts/stage-release-metadata.mjs <dist> <windows|linux|mac> <x64|arm64> <channel>'
  )
}

const suffix = platform === 'windows' ? '' : platform === 'mac' ? '-mac' : `-linux${arch === 'x64' ? '' : `-${arch}`}`
const source = join(distDir, `${channel}${suffix}.yml`)
const destination = join(distDir, `release-meta-${platform}-${arch}.yml`)

if (!existsSync(source)) {
  throw new Error(`Expected electron-builder metadata is missing: ${source}`)
}

copyFileSync(source, destination)
console.log(`[release-meta] staged ${source} -> ${destination}`)
