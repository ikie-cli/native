import { expect, test } from '@playwright/test'
import { access, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { defaultSeed, launchApp, type LaunchedApp } from './helpers/app'
import { startE2EFixture, type E2EFixture } from './helpers/fixture'

let fixture: E2EFixture
let launched: LaunchedApp

test.beforeAll(async () => {
  fixture = await startE2EFixture()
})

test.afterEach(async () => {
  await launched?.close()
})

test.afterAll(async () => {
  await fixture.close()
})

test('one-click installs the standalone Native Ranked mod into a managed instance', async () => {
  launched = await launchApp({ env: fixture.env, seed: defaultSeed() })
  const { page, dataDir } = launched

  // The Home screen surfaces the Native Ranked install card.
  await expect(page.getByTestId('native-ranked')).toBeVisible()
  await page.getByTestId('ranked-install').click()

  // Install provisions a 1.16.1 Fabric instance and drops the bundled jar in.
  await expect
    .poll(
      async () => {
        const ids = await readdir(join(dataDir, 'instances'))
        return ids.some((id) => !id.startsWith('seed-'))
      },
      { timeout: 20_000 }
    )
    .toBe(true)

  const ids = await readdir(join(dataDir, 'instances'))
  const rankedId = ids.find((id) => !id.startsWith('seed-'))
  expect(rankedId).toBeTruthy()
  // The standalone mod jar is present; the mod self-authenticates in-game
  // (no launcher-written token/config file anymore).
  await access(join(dataDir, 'instances', rankedId!, 'minecraft', 'mods', 'native-ranked.jar'))
  // The custom Native Ranked instance icon is installed.
  await access(join(dataDir, 'icons', 'native-ranked-icon.png'))

  // The banner ad disappears from Home once Native Ranked is installed.
  await page.getByLabel('Home').first().click()
  await expect(page.getByTestId('screen-home')).toBeVisible()
  await expect(page.getByTestId('native-ranked')).toHaveCount(0)
})
