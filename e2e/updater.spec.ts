import { expect, test } from '@playwright/test'
import { createHash } from 'node:crypto'
import { createReadStream, existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { launchApp, type LaunchedApp } from './helpers/app'

/**
 * Auto-updater end-to-end against a local release feed:
 * running app (0.1.0) → detects 99.9.9 → downloads with progress → "ready".
 * The final quitAndInstall swap is electron-updater stock behavior that would
 * replace the app under test, so the E2E asserts through the ready state.
 *
 * Uses electron-updater's dev config (dev-app-update.yml) + a generic
 * provider served from this test.
 */

const ROOT = join(__dirname, '..')
// Any packaged AppImage works as the "installed old version". Note: a prior
// run may have auto-installed the fake 99.9.9 on quit (that IS the full
// update cycle completing) — so match by pattern, not exact version.
const APPIMAGE = (() => {
  const dist = join(ROOT, 'dist')
  if (!existsSync(dist)) return null
  const hit = readdirSync(dist).find((f) => /^Native-.*\.AppImage$/.test(f))
  return hit ? join(dist, hit) : null
})()
const DEV_CFG = join(ROOT, 'out', 'dev-app-update.yml')

function sha512b64(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash('sha512')
    createReadStream(path)
      .on('data', (d) => h.update(d))
      .on('end', () => resolve(h.digest('base64')))
      .on('error', reject)
  })
}

let server: Server
let app: LaunchedApp

test.skip(!APPIMAGE, 'requires a packaged AppImage (npm run package:linux)')

test.beforeAll(async () => {
  const bytes = readFileSync(APPIMAGE!)
  const sha = await sha512b64(APPIMAGE!)
  const fileName = 'Native-99.9.9-arm64.AppImage'
  const yml = [
    'version: 99.9.9',
    'files:',
    `  - url: ${fileName}`,
    `    sha512: ${sha}`,
    `    size: ${bytes.length}`,
    `path: ${fileName}`,
    `sha512: ${sha}`,
    `releaseDate: '2026-07-20T00:00:00.000Z'`,
    "releaseNotes: 'Faster downloads, new servers screen polish, bug fixes.'"
  ].join('\n')

  server = createServer((req, res) => {
    const url = (req.url ?? '/').split('?')[0]
    if (url.endsWith('.yml')) {
      res.setHeader('content-type', 'text/yaml')
      res.end(yml)
      return
    }
    if (url.endsWith('.AppImage')) {
      res.setHeader('content-length', bytes.length)
      res.end(bytes)
      return
    }
    res.statusCode = 404
    res.end()
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const { port } = server.address() as AddressInfo
  writeFileSync(DEV_CFG, `provider: generic\nurl: http://127.0.0.1:${port}\nchannel: latest\n`)
})

test.afterAll(async () => {
  server?.close()
  try {
    unlinkSync(DEV_CFG)
  } catch {
    /* already gone */
  }
  await app?.close()
})

test('detects update, downloads it, and reaches ready-to-install', async () => {
  test.setTimeout(180_000)
  app = await launchApp({
    env: {
      NATIVE_UPDATER_DEV: DEV_CFG,
      APPIMAGE: APPIMAGE!,
      // updater check fires 8s after init; autoDownload defaults on
      NATIVE_E2E: '' // allow the updater (NATIVE_E2E disables auto-check)
    }
  })
  const { page } = app

  // Update toast: available → downloading → ready (autoDownload on).
  const toast = page.getByTestId('update-toast')
  await expect(toast).toBeVisible({ timeout: 90_000 })
  await expect(toast).toContainText('99.9.9')

  // Ready state offers restart-to-apply.
  await expect(toast.getByText('ready to install')).toBeVisible({ timeout: 90_000 })
  await expect(toast.getByRole('button', { name: 'Restart now' })).toBeVisible()

  // Settings shows the same state through the updater status panel.
  await page.getByLabel('Settings').click()
  await page.getByRole('button', { name: 'Updates' }).click()
  await expect(page.getByTestId('update-status')).toContainText(/9\.9\.9|ready/i)
})
