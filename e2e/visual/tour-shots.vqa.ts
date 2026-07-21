import { test, expect } from '@playwright/test'
import { launchApp, type LaunchedApp } from '../helpers/app'
import { startE2EFixture, type E2EFixture } from '../helpers/fixture'

/** Marketing/verification captures of the first-run tour (TOUR_SHOTS=1). */

let fx: E2EFixture
let app: LaunchedApp

test.skip(!process.env.TOUR_SHOTS, 'tour captures only')

test.beforeAll(async () => {
  fx = await startE2EFixture()
})
test.afterAll(async () => {
  await fx.close()
})
test.afterEach(async () => {
  await app?.close()
})

test('capture tour steps', async () => {
  test.setTimeout(120_000)
  app = await launchApp({
    env: {
      ...fx.env,
      NATIVE_FORCE_TOUR: '1',
      NATIVE_WIN_SIZE: '1366x768',
      NATIVE_AVATAR_BASE: 'https://mc-heads.net'
    },
    seed: { settings: { theme: 'oled' } }
  })
  const { page } = app
  await expect(page.getByTestId('tour')).toBeVisible()
  await page.waitForTimeout(700)
  await page.screenshot({ path: 'tour-1-welcome.png' })
  await page.getByTestId('tour-next').click()
  await page.waitForTimeout(700)
  await page.screenshot({ path: 'tour-2-signin.png' })
  await page.getByTestId('tour-next').click()
  await page.getByTestId('tour-next').click()
  await page.waitForTimeout(700)
  await page.screenshot({ path: 'tour-4-home.png' })
})
