#!/usr/bin/env node
/**
 * Deploy the staged Native Ranked mod jar to the ranked server's artifact
 * directory, so every client auto-downloads the latest mod on its next ranked
 * launch (the launcher fetches `<ranked>/artifacts/native-ranked.jar` before
 * falling back to its bundled copy).
 *
 * Run on the ranked host with write access to the artifact dir, e.g.:
 *   sudo env NATIVE_RANKED_ARTIFACT_DIR=/var/lib/native-ranked/artifacts \
 *     PATH="$PATH" node scripts/deploy-ranked-mod.mjs
 *
 * Or, from CI, over SSH to the host. Reuses the same artifact-dir env var the
 * server reads (falling back to the same default), so source and server agree.
 */
import { createHash } from 'node:crypto'
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = process.env.NATIVE_RANKED_MOD_JAR ?? join(root, 'resources', 'native-ranked.jar')
const artifactDir = process.env.NATIVE_RANKED_ARTIFACT_DIR ?? '/var/lib/native-ranked/artifacts'

if (!existsSync(source)) {
  console.error(`✗ Mod jar not found at ${source}\n  Build it first: npm run build:ranked`)
  process.exit(1)
}

const target = join(artifactDir, 'native-ranked.jar')
try {
  mkdirSync(artifactDir, { recursive: true })
  copyFileSync(source, target)
  chmodSync(target, 0o644)
} catch (error) {
  console.error(`✗ Could not write ${target}: ${error instanceof Error ? error.message : error}`)
  console.error('  The artifact dir is owned by the service user — run with sudo.')
  process.exit(1)
}

const hash = createHash('sha256').update(readFileSync(target)).digest('hex')
console.log(`✓ Deployed native-ranked.jar → ${target}`)
console.log(`  ${statSync(target).size} bytes · sha256 ${hash.slice(0, 16)}…`)
console.log('  Clients will pick it up on their next ranked launch.')
