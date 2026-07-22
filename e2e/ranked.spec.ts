import { expect, test } from '@playwright/test'
import { access, readFile, readdir } from 'node:fs/promises'
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

test('provisions the managed ranked instance for an offline profile', async () => {
  launched = await launchApp({ env: fixture.env, seed: defaultSeed() })
  const { page, dataDir } = launched
  await page.getByLabel('Native Ranked').click()
  await expect(page.getByTestId('ranked-screen')).toBeVisible()
  await expect(page.getByText('Feinberg')).toBeVisible()
  await page.getByTestId('ranked-primary-action').click()
  await expect(page.getByTestId('ranked-primary-action')).toContainText('Launch ranked', {
    timeout: 15_000
  })
  await expect(page.getByTestId('ranked-screen').getByText('TestPlayer', { exact: true })).toBeVisible()

  const ids = await readdir(join(dataDir, 'instances'))
  const rankedId = ids.find((id) => !id.startsWith('seed-'))
  expect(rankedId).toBeTruthy()
  const gameDir = join(dataDir, 'instances', rankedId!, 'minecraft')
  const config = JSON.parse(await readFile(join(gameDir, 'native-ranked.json'), 'utf8'))
  expect(config).toMatchObject({
    endpoint: `${fixture.fx.baseUrl}/ranked`,
    token: 'e2e-ranked-token',
    playerId: 'ranked-test-player',
    username: 'TestPlayer'
  })
  await access(join(gameDir, 'mods', 'native-ranked.jar'))
})
