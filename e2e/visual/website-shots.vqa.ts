import { test, expect } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launchApp, defaultSeed, type LaunchedApp } from '../helpers/app'
import { solidPng, startE2EFixture, type E2EFixture } from '../helpers/fixture'

/**
 * Marketing captures for website/ — runs only with WEBSITE_SHOTS=1 so the
 * qa:visual gate (scored against the reference set) is unaffected.
 *
 * Shots are taken in the classic OLED palette (green accent on pure black)
 * with live mc-heads avatars, sized 1366x768 for the site's device frames.
 */

const OUT = join(__dirname, '../../website/assets')

let fx: E2EFixture
let app: LaunchedApp

test.skip(!process.env.WEBSITE_SHOTS, 'website marketing captures only')

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

async function shoot(page: LaunchedApp['page'], name: string): Promise<void> {
  await page.waitForTimeout(600) // entrance animations + image decodes
  await page.screenshot({ path: join(OUT, `${name}.png`) })
}

test('capture website marketing shots (classic oled)', async () => {
  test.setTimeout(240_000)
  const seed = { ...(defaultSeed() as Record<string, unknown>), settings: { theme: 'oled' } }
  app = await launchApp({
    env: {
      ...fx.env,
      NATIVE_WIN_SIZE: '1366x768',
      // Marketing shots want the real skin-head service, not the E2E stub.
      NATIVE_AVATAR_BASE: 'https://mc-heads.net'
    },
    seed
  })
  const { page, dataDir } = app

  // A world + screenshots so the instance screen looks lived-in.
  const gameDir = join(dataDir, 'instances', 'seed-fabric', 'minecraft')
  const worldDir = join(gameDir, 'saves', 'New World')
  mkdirSync(worldDir, { recursive: true })
  writeFileSync(join(worldDir, 'level.dat'), Buffer.from([0x0a, 0x00, 0x00]))
  writeFileSync(join(worldDir, 'icon.png'), solidPng(64, 64, [80, 160, 90]))

  await expect(page.getByText('The Garden Awakens — new update out now')).toBeVisible({
    timeout: 15_000
  })
  await shoot(page, 'shot-home')

  await page.getByLabel('Library').click()
  await expect(page.getByTestId('screen-library')).toBeVisible()
  await shoot(page, 'shot-library')

  await page.getByLabel('Discover content').click()
  await expect(page.getByText('Sodium')).toBeVisible({ timeout: 15_000 })
  await shoot(page, 'shot-discover')

  await page.getByTestId('install-AANobbMI').click()
  await expect(page.getByTestId('install-AANobbMI')).toContainText('Installed', { timeout: 30_000 })
  await page.getByLabel('Library').click()
  await page.getByText('Fabulously Optimized').first().click()
  await expect(page.getByTestId('screen-instance')).toBeVisible()
  await expect(page.getByText('sodium-fabric-0.6.0.jar')).toBeVisible({ timeout: 15_000 })
  for (const t of await page.getByLabel('Dismiss').all()) await t.click().catch(() => undefined)
  await shoot(page, 'shot-instance')

  await page.getByLabel('Home').first().click()
  await expect(page.getByTestId('screen-home')).toBeVisible()
  await page.getByLabel('Create instance').click()
  await expect(page.getByTestId('create-name')).toBeVisible()
  await page.waitForTimeout(600)
  await shoot(page, 'shot-create')
  await page.keyboard.press('Escape')
})

test('rail layout diagnostic at minimum window size', async () => {
  test.setTimeout(120_000)
  const seed = { ...(defaultSeed() as Record<string, unknown>), settings: { theme: 'oled' } }
  app = await launchApp({
    env: { ...fx.env, NATIVE_WIN_SIZE: '1000x640', NATIVE_AVATAR_BASE: 'https://mc-heads.net' },
    seed
  })
  const { page } = app
  await page.waitForTimeout(800)
  await page.screenshot({ path: join(OUT, '..', '..', 'diag-rail-640.png') })
  // Active instance ring: make one instance active to check ring clipping.
  await page.getByLabel('Fabulously Optimized').click()
  await page.waitForTimeout(600)
  await page.screenshot({ path: join(OUT, '..', '..', 'diag-rail-active.png') })
})
