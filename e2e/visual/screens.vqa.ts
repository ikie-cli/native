import { test, expect } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import { launchApp, defaultSeed, type LaunchedApp } from '../helpers/app'
import { solidPng, startE2EFixture, type E2EFixture } from '../helpers/fixture'

/**
 * Visual QA pass: screenshot every major screen into ./qa-screenshots/.
 * scripts/qa-report.mjs then scores each against its mapped reference in
 * ./screenshots/ (mapping in scripts/qa-mapping.json).
 */

const OUT = join(__dirname, '../../qa-screenshots')

let fx: E2EFixture
let app: LaunchedApp

/** Gameplay-looking thumbnails: sky/terrain splits in biome palettes. */
function gameplayPng(w: number, h: number, seed: number): Buffer {
  const scenes: [number, number, number][][] = [
    [
      [116, 173, 255],
      [86, 125, 70]
    ], // plains: sky + grass
    [
      [255, 170, 94],
      [60, 42, 34]
    ], // sunset + dirt
    [
      [26, 26, 38],
      [58, 58, 74]
    ], // night + stone
    [
      [92, 158, 224],
      [194, 178, 128]
    ], // beach
    [
      [120, 30, 30],
      [56, 12, 12]
    ], // nether
    [
      [212, 190, 150],
      [176, 142, 92]
    ], // desert
    [
      [170, 200, 230],
      [120, 96, 68]
    ] // taiga
  ]
  const [sky, ground] = scenes[seed % scenes.length]
  const horizon = 0.45 + (seed % 3) * 0.08
  const png = new PNG({ width: w, height: h })
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const base = y / h < horizon ? sky : ground
      // cheap dithered texture so it reads as terrain, not flat fill;
      // 0.45 exposure keeps thumbnails in the muted range of real captures
      const n = ((x * 7 + y * 13 + seed * 31) % 17) - 8
      png.data[i] = Math.max(0, Math.min(255, base[0] * 0.45 + n))
      png.data[i + 1] = Math.max(0, Math.min(255, base[1] * 0.45 + n))
      png.data[i + 2] = Math.max(0, Math.min(255, base[2] * 0.45 + n))
      png.data[i + 3] = 255
    }
  }
  return PNG.sync.write(png)
}

async function shoot(page: LaunchedApp['page'], name: string): Promise<void> {
  // Let entrance animations finish (all ≤ 260ms) before capturing.
  await page.waitForTimeout(450)
  await page.screenshot({ path: join(OUT, `${name}.png`) })
}

test.beforeAll(async () => {
  mkdirSync(OUT, { recursive: true })
  fx = await startE2EFixture()
})
test.afterAll(async () => {
  await fx.close()
})
test.afterEach(async () => {
  await app?.close()
})

test('capture populated screens', async () => {
  test.setTimeout(240_000)
  // The perceptual gate scores against the green reference shots, so visual QA
  // captures in the classic dark palette. Mono is the shipping default.
  const seed = { ...(defaultSeed() as Record<string, unknown>), settings: { theme: 'dark' } }
  app = await launchApp({ env: { ...fx.env, NATIVE_WIN_SIZE: '1366x728' }, seed })
  const { page, dataDir } = app

  // Enrich the seeded instance with screenshots + a world before visiting.
  const gameDir = join(dataDir, 'instances', 'seed-fabric', 'minecraft')
  mkdirSync(join(gameDir, 'screenshots'), { recursive: true })
  for (let i = 0; i < 6; i++) {
    writeFileSync(join(gameDir, 'screenshots', `2026-07-${String(i + 1).padStart(2, '0')}_12.30.0${i % 10}.png`), gameplayPng(320, 180, i))
  }
  const worldDir = join(gameDir, 'saves', 'New World')
  mkdirSync(worldDir, { recursive: true })
  writeFileSync(join(worldDir, 'level.dat'), Buffer.from([0x0a, 0x00, 0x00]))
  writeFileSync(join(worldDir, 'icon.png'), solidPng(64, 64, [80, 160, 90]))
  const world2 = join(gameDir, 'saves', 'Skyblock Adventure')
  mkdirSync(world2, { recursive: true })
  writeFileSync(join(world2, 'level.dat'), Buffer.from([0x0a, 0x00, 0x00]))

  // Give the news panel time to render its imagery.
  await expect(page.getByText('The Garden Awakens — new update out now')).toBeVisible({
    timeout: 15_000
  })
  await expect(page.getByTestId('best-modpacks')).toContainText('Fabulously Optimized', {
    timeout: 15_000
  })
  await shoot(page, 'home')

  // Library
  await page.getByLabel('Library').click()
  await expect(page.getByTestId('screen-library')).toBeVisible()
  await shoot(page, 'library')

  // Discover (mods search)
  await page.getByLabel('Discover content').click()
  await expect(page.getByText('Sodium')).toBeVisible({ timeout: 15_000 })
  await shoot(page, 'discover')

  // Instance detail — content tab (install a mod first so the list has a row)
  await page.getByTestId('install-AANobbMI').click()
  await expect(page.getByTestId('install-AANobbMI')).toContainText('Installed', { timeout: 30_000 })
  await page.getByLabel('Library').click()
  await page.getByText('Fabulously Optimized').first().click()
  await expect(page.getByTestId('screen-instance')).toBeVisible()
  await expect(page.getByText('sodium-fabric-0.6.0.jar')).toBeVisible({ timeout: 15_000 })
  await shoot(page, 'instance-content')

  // Worlds
  await page.getByRole('tab', { name: 'Worlds' }).click()
  await expect(page.getByText('New World')).toBeVisible({ timeout: 15_000 })
  await shoot(page, 'instance-worlds')

  // Screenshots gallery
  await page.getByRole('tab', { name: 'Screenshots' }).click()
  // clear lingering toasts so they don't sit over the sidebar in captures
  for (const t of await page.getByLabel('Dismiss').all()) await t.click().catch(() => undefined)
  await page.waitForTimeout(800) // thumbnails load over IPC
  await shoot(page, 'instance-screenshots')

  // Logs (idle console)
  await page.getByRole('tab', { name: 'Logs' }).click()
  await expect(page.getByTestId('log-viewer')).toBeVisible()
  await shoot(page, 'instance-logs')

  // Options
  await page.getByRole('tab', { name: 'Options' }).click()
  await expect(page.getByTestId('options-name')).toBeVisible()
  await shoot(page, 'instance-options')

  // Servers
  await page.getByLabel('Servers').click()
  await expect(page.getByTestId('screen-servers')).toBeVisible()
  await page.waitForTimeout(1200) // pings resolve (offline states)
  await shoot(page, 'servers')

  // Native Ranked
  await page.getByLabel('Native Ranked').click()
  await expect(page.getByTestId('ranked-screen')).toBeVisible()
  await expect(page.getByTestId('ranked-primary-action')).toBeVisible()
  await shoot(page, 'ranked')

  // Modals are captured over the dense Home screen (references dim
  // content-rich screens behind every dialog).
  await page.getByLabel('Home').first().click()
  await expect(page.getByTestId('screen-home')).toBeVisible()

  // Create-instance modal
  await page.getByLabel('Create instance').click()
  await expect(page.getByTestId('create-name')).toBeVisible()
  await page.waitForTimeout(600) // loader versions resolve
  await shoot(page, 'create-instance')
  await page.keyboard.press('Escape')

  // Settings modal
  await page.getByLabel('Settings').click()
  await expect(page.getByText('Theme', { exact: true })).toBeVisible()
  await shoot(page, 'settings')
  await page.keyboard.press('Escape')

  // Accounts modal (login surface)
  await page.getByLabel(/Accounts/).click()
  await expect(page.getByTestId('add-msa')).toBeVisible()
  await shoot(page, 'accounts')
  await page.keyboard.press('Escape')

  // Launch console (running game) — the seeded instance actually launches.
  await page.getByLabel('Library').click()
  await page.getByText('Fabulously Optimized').first().click()
  await page.getByTestId('instance-play').click()
  await expect(page.getByLabel('Stop game')).toBeVisible({ timeout: 90_000 })
  await expect(page.getByTestId('log-viewer')).toContainText('FakeClient', { timeout: 20_000 })
  await shoot(page, 'launch-console')
  await page.getByLabel('Stop game').click()
  await expect(page.getByLabel('Stop game')).toBeHidden({ timeout: 30_000 })
})

test('capture empty & error states', async () => {
  test.setTimeout(120_000)
  // Bare app: no seed (fresh install) with news reachable; only the content
  // API is dead so Discover renders its error state.
  app = await launchApp({
    env: {
      ...fx.env,
      NATIVE_WIN_SIZE: '1366x728',
      NATIVE_URL_MODRINTH: 'http://127.0.0.1:9' // closed port → search error
    },
    seed: { settings: { theme: 'dark' } }
  })
  const { page } = app

  await shoot(page, 'home-empty')

  await page.getByLabel('Library').click()
  await expect(page.getByTestId('screen-library')).toBeVisible()
  await shoot(page, 'library-empty')

  await page.getByLabel('Servers').click()
  await expect(page.getByTestId('screen-servers')).toBeVisible()
  await shoot(page, 'servers-empty')

  await page.getByLabel('Discover content').click()
  await expect(page.getByText('Search unavailable')).toBeVisible({ timeout: 20_000 })
  await shoot(page, 'discover-error')
})
