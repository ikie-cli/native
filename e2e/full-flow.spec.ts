import { expect, test } from '@playwright/test'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { launchApp, defaultSeed, type LaunchedApp } from './helpers/app'
import { startE2EFixture, type E2EFixture } from './helpers/fixture'

/**
 * The release-gating E2E:
 * create instance → install (fabric loader) → add mod → launch →
 * verify the game process spawned → stop it → close.
 * Entirely hermetic: all upstream services are local fixtures and the
 * "game" is a compiled FakeClient jar.
 */

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

test('create → install loader → add mod → launch → process spawns → stop', async () => {
  test.setTimeout(180_000)
  // Seed only an account — the instance is created through the UI.
  app = await launchApp({
    env: fx.env,
    seed: {
      accounts: [
        {
          id: 'off-1',
          type: 'offline',
          username: 'TestPlayer',
          uuid: 'e5af59f4-0000-3000-8000-000000000001',
          active: true
        }
      ]
    }
  })
  const { page } = app

  // ---- create instance (fabric on the fake version) ----
  await page.getByTestId('home-create').click()
  await page.getByTestId('create-name').fill('E2E Fabric')
  await page.getByTestId('loader-fabric').click()
  // fake manifest has exactly one version, preselected as latest release
  await expect(page.getByTestId('create-confirm')).toBeEnabled()
  await page.getByTestId('create-confirm').click()

  // Landed on the instance screen; install kicks off automatically.
  await expect(page.getByTestId('screen-instance')).toBeVisible()
  await expect(page.getByText('E2E Fabric').first()).toBeVisible()

  // Wait until the play button reads "Play" (installed=true propagated).
  await expect(page.getByTestId('instance-play')).toContainText('Play', { timeout: 60_000 })
  await expect(page.getByTestId('instance-play')).not.toContainText('Install', { timeout: 60_000 })

  // ---- add a mod from Discover ----
  await page.getByTestId('content-discover').click()
  await expect(page.getByTestId('screen-discover')).toBeVisible()
  await expect(page.getByText('Sodium')).toBeVisible({ timeout: 15_000 })
  await page.getByTestId('install-AANobbMI').click()
  await expect(page.getByTestId('install-AANobbMI')).toContainText('Installed', { timeout: 30_000 })

  // The jar physically exists in the instance mods folder.
  const instancesDir = join(app.dataDir, 'instances')
  const instDirs = readdirSync(instancesDir)
  const created = instDirs.find((d) => {
    const p = join(instancesDir, d, 'minecraft', 'mods', 'sodium-fabric-0.6.0.jar')
    return existsSync(p)
  })
  expect(created).toBeTruthy()

  // Back on the instance content tab the mod is listed.
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page.getByTestId('screen-instance')).toBeVisible()
  await expect(page.getByText('sodium-fabric-0.6.0.jar')).toBeVisible({ timeout: 15_000 })

  // ---- launch ----
  await page.getByTestId('instance-play').click()
  // Running chip appears in the titlebar; play button flips to Stop.
  await expect(page.getByLabel('Stop game')).toBeVisible({ timeout: 90_000 })

  // The FakeClient wrote its argv — the process really spawned. Poll for the
  // CONTENT, not mere existence: the file is created a beat before its write
  // lands, and an empty read here was a recurring flake.
  await expect
    .poll(
      () => {
        const p = join(instancesDir, created!, 'minecraft', 'launched.txt')
        return existsSync(p) ? readFileSync(p, 'utf-8') : ''
      },
      { timeout: 30_000 }
    )
    .toContain('--username')
  const argv = readFileSync(join(instancesDir, created!, 'minecraft', 'launched.txt'), 'utf-8')
  expect(argv).toContain('TestPlayer')

  // Live logs stream into the console view.
  await expect(page.getByTestId('log-viewer')).toContainText('FakeClient', { timeout: 20_000 })

  // ---- stop ----
  await page.getByLabel('Stop game').click()
  await expect(page.getByLabel('Stop game')).toBeHidden({ timeout: 30_000 })
})

test('seeded library renders and playtime/kebab actions work', async () => {
  app = await launchApp({ env: fx.env, seed: defaultSeed() })
  const { page } = app

  // Home shows seeded instances in Jump back in (capped at 5 recents).
  await expect(page.getByTestId('jump-back-row')).toHaveCount(5)
  await expect(page.getByText('Fabulously Optimized')).toBeVisible()

  // Library shows cards; search filters.
  await page.getByLabel('Library').click()
  await expect(page.getByTestId('screen-library')).toBeVisible()
  await expect(page.getByTestId('instance-card')).toHaveCount(5)
  await page.getByTestId('library-search').fill('Hoplite')
  await expect(page.getByTestId('instance-card')).toHaveCount(1)
  await page.getByTestId('library-search').fill('')
  await expect(page.getByTestId('instance-card')).toHaveCount(5)
})

test('instance options edit + RAM validation persists', async () => {
  app = await launchApp({ env: fx.env, seed: defaultSeed() })
  const { page } = app

  await page.getByText('Fabulously Optimized').first().click()
  await expect(page.getByTestId('screen-instance')).toBeVisible()
  await page.getByRole('tab', { name: 'Options' }).click()

  await page.getByTestId('options-name').fill('FO Renamed')
  await page.getByTestId('options-jvm').fill('-XX:+UseG1GC')
  await page.getByTestId('options-save').click()

  // Persisted across restart.
  const dataDir = app.dataDir
  await app.close()
  app = await launchApp({ env: fx.env, dataDir })
  await expect(app.page.getByText('FO Renamed')).toBeVisible({ timeout: 15_000 })
})

test('servers screen: add, ping states, remove', async () => {
  app = await launchApp({ env: fx.env, seed: defaultSeed() })
  const { page } = app

  await page.getByLabel('Servers').click()
  await expect(page.getByTestId('screen-servers')).toBeVisible()
  // Two seeded servers render (both offline in the sandbox — that's fine).
  await expect(page.getByText('Hypixel', { exact: true })).toBeVisible()
  await expect(page.getByText('Local Test', { exact: true })).toBeVisible()

  // Add another.
  await page.getByTestId('servers-add').click()
  await page.getByTestId('server-address').fill('play.example.org:25565')
  await page.getByTestId('server-add-confirm').click()
  await expect(page.getByText('play.example.org:25565').first()).toBeVisible()
})

test('accounts modal: add offline profile and switch', async () => {
  app = await launchApp({ env: fx.env })
  const { page } = app

  await page.getByLabel('Sign in', { exact: true }).click()
  await page.getByTestId('add-offline').click()
  await page.getByTestId('offline-name').fill('SecondUser')
  await page.getByTestId('offline-confirm').click()
  // Scope to the dialog: the name also appears in the toast + sidebar.
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('SecondUser', { exact: true })).toBeVisible()
  await expect(dialog.getByText('Active', { exact: true })).toBeVisible()
})

test('settings modal opens; theme switch flips tokens', async () => {
  app = await launchApp({ env: fx.env, seed: defaultSeed() })
  const { page } = app

  await page.getByLabel('Settings').click()
  await expect(page.getByText('Theme', { exact: true })).toBeVisible()

  const before = await page.evaluate(() => document.documentElement.dataset.theme)
  expect(before).toBe('mono')
})
