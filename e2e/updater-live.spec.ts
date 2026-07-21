import { expect, test } from '@playwright/test'
import { existsSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launchApp, type LaunchedApp } from './helpers/app'

/**
 * LIVE-DOMAIN updater verification (LIVE_UPDATER=1): points the app at
 * https://nativelaunch.xyz/updates-test (a staged fake 99.9.9 release on the
 * real production server, through Cloudflare) and asserts the full pipeline:
 * check → detect → download with progress → ready-to-install.
 */

const ROOT = join(__dirname, '..')
const APPIMAGE = (() => {
  const dist = join(ROOT, 'dist')
  if (!existsSync(dist)) return null
  const hit = readdirSync(dist).find((f) => /^Native-.*\.AppImage$/.test(f))
  return hit ? join(dist, hit) : null
})()
const DEV_CFG = join(ROOT, 'out', 'dev-app-update-live.yml')

let app: LaunchedApp

test.skip(!process.env.LIVE_UPDATER || !APPIMAGE, 'live updater check only')

test.beforeAll(() => {
  // No channel override: electron-updater resolves latest-linux-arm64.yml
  // itself on this platform — exactly what a packaged install requests.
  writeFileSync(DEV_CFG, 'provider: generic\nurl: https://nativelaunch.xyz/updates-test\n')
})
test.afterAll(async () => {
  try {
    unlinkSync(DEV_CFG)
  } catch {
    /* already gone */
  }
  await app?.close()
})

test('updates flow end-to-end from nativelaunch.xyz', async () => {
  test.setTimeout(300_000)
  app = await launchApp({
    env: {
      NATIVE_UPDATER_DEV: DEV_CFG,
      APPIMAGE: APPIMAGE!,
      NATIVE_E2E: '' // allow updater auto-check
    },
    seed: { settings: { onboardingDone: true } }
  })
  const { page } = app

  const toast = page.getByTestId('update-toast')
  await expect(toast).toBeVisible({ timeout: 120_000 })
  await expect(toast).toContainText('99.9.9')
  // Full ~101 MB download from the live domain must verify and reach ready.
  await expect(toast.getByText('ready to install')).toBeVisible({ timeout: 240_000 })
  await page.screenshot({ path: 'live-updater-ready.png' })
})
