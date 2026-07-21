import { expect, test } from '@playwright/test'
import { unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launchApp, type LaunchedApp } from './helpers/app'

/**
 * Differential-update verification (DELTA_UPDATER=1): an old 0.1.0 install
 * (OLD_APPIMAGE env) updates to the live 0.1.1 release on nativelaunch.xyz.
 * Asserts the update reaches ready AND that electron-updater took the
 * differential path (asserted by the caller from the app log file).
 */

const ROOT = join(__dirname, '..')
const DEV_CFG = join(ROOT, 'out', 'dev-app-update-delta.yml')

let app: LaunchedApp

test.skip(!process.env.DELTA_UPDATER || !process.env.OLD_APPIMAGE, 'delta updater check only')

test.beforeAll(() => {
  writeFileSync(DEV_CFG, 'provider: generic\nurl: https://nativelaunch.xyz/updates\n')
})
test.afterAll(async () => {
  try {
    unlinkSync(DEV_CFG)
  } catch {
    /* already gone */
  }
  await app?.close()
})

test('differential update from live feed reaches ready', async () => {
  test.setTimeout(300_000)
  app = await launchApp({
    env: {
      NATIVE_UPDATER_DEV: DEV_CFG,
      APPIMAGE: process.env.OLD_APPIMAGE!,
      NATIVE_E2E: ''
    },
    seed: { settings: { onboardingDone: true } }
  })
  const { page, dataDir } = app
  console.log('DATA_DIR=' + dataDir)

  const toast = page.getByTestId('update-toast')
  await expect(toast).toBeVisible({ timeout: 120_000 })
  await expect(toast).toContainText('0.1.1')
  await expect(toast.getByText('ready to install')).toBeVisible({ timeout: 240_000 })
})
