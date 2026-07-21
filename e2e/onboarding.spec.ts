import { test, expect } from '@playwright/test'
import { launchApp, type LaunchedApp } from './helpers/app'
import { startE2EFixture, type E2EFixture } from './helpers/fixture'

/** First-run guided tour: shows on a fresh profile, walks all steps in order,
 *  and stays dismissed across restarts once finished. */

let fx: E2EFixture
let app: LaunchedApp

test.beforeAll(async () => {
  fx = await startE2EFixture()
})
test.afterAll(async () => {
  await fx.close()
})
test.afterEach(async () => {
  await app?.close()
})

const TITLES = [
  'Welcome to Native!',
  'Sign in to play',
  'Create your first instance',
  'Home — jump back in',
  'Discover content',
  'Your library',
  'Servers',
  'Make it yours',
  "That's it — have fun!"
]

test('tour walks every step and persists dismissal across restarts', async () => {
  test.setTimeout(120_000)
  app = await launchApp({ env: { ...fx.env, NATIVE_FORCE_TOUR: '1' } })
  const { page, dataDir } = app

  await expect(page.getByTestId('tour')).toBeVisible()
  for (let i = 0; i < TITLES.length; i++) {
    await expect(page.getByTestId('tour-title')).toHaveText(TITLES[i])
    await page.getByTestId('tour-next').click()
  }
  await expect(page.getByTestId('tour')).toBeHidden()

  // Finishing persisted onboardingDone — a restart must not re-show it.
  await app.close()
  app = await launchApp({ env: { ...fx.env, NATIVE_FORCE_TOUR: '1' }, dataDir })
  await app.page.waitForTimeout(800)
  await expect(app.page.getByTestId('tour')).toBeHidden()
})

test('skip dismisses immediately and back navigates', async () => {
  app = await launchApp({ env: { ...fx.env, NATIVE_FORCE_TOUR: '1' } })
  const { page } = app

  await expect(page.getByTestId('tour')).toBeVisible()
  await page.getByTestId('tour-next').click()
  await expect(page.getByTestId('tour-title')).toHaveText('Sign in to play')
  await page.getByTestId('tour-back').click()
  await expect(page.getByTestId('tour-title')).toHaveText('Welcome to Native!')
  await page.getByTestId('tour-next').click()
  await page.getByTestId('tour-skip').click()
  await expect(page.getByTestId('tour')).toBeHidden()
})
