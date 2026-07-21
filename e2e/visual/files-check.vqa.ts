import { test, expect } from '@playwright/test'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchApp, defaultSeed, type LaunchedApp } from '../helpers/app'
import { startE2EFixture, type E2EFixture } from '../helpers/fixture'

/** Diagnostic captures (FILES_CHECK=1): the instance Files tab — root listing,
 *  entering a subfolder via breadcrumb/double-click, and the inline text
 *  preview panel. Not part of the qa:visual gate. */

let fx: E2EFixture
let app: LaunchedApp

test.skip(!process.env.FILES_CHECK, 'files tab diagnostic only')

test.beforeAll(async () => {
  fx = await startE2EFixture()
})
test.afterAll(async () => {
  await fx.close()
})
test.afterEach(async () => {
  await app?.close()
})

test('files tab: listing, folder navigation, text preview', async () => {
  test.setTimeout(120_000)
  // Pre-stage files inside the seeded instance's minecraft dir.
  const dataDir = mkdtempSync(join(tmpdir(), 'native-files-'))
  const game = join(dataDir, 'instances', 'seed-fabric', 'minecraft')
  mkdirSync(join(game, 'config'), { recursive: true })
  mkdirSync(join(game, 'saves', 'New World'), { recursive: true })
  mkdirSync(join(game, 'mods'), { recursive: true })
  writeFileSync(
    join(game, 'options.txt'),
    ['version:4189', 'autoJump:false', 'renderDistance:12', 'fov:0.0', 'gamma:0.5', 'guiScale:2']
      .join('\n')
  )
  writeFileSync(
    join(game, 'config', 'foo.toml'),
    ['[general]', 'enabled = true', 'maxItems = 64', '', '[client]', 'showParticles = false'].join(
      '\n'
    )
  )
  writeFileSync(join(game, 'config', 'sodium-options.json'), '{\n  "quality": "high"\n}\n')
  writeFileSync(join(game, 'servers.dat'), Buffer.from([0x0a, 0x00, 0x00]))
  writeFileSync(join(game, 'mods', 'fabric-api-0.110.0.jar'), Buffer.alloc(4096))

  app = await launchApp({ dataDir, env: fx.env, seed: defaultSeed() })
  const { page } = app

  // Open the seeded instance and its Files tab.
  await page.getByLabel('Fabulously Optimized').click()
  await expect(page.getByTestId('screen-instance')).toBeVisible()
  await page.getByRole('tab', { name: 'Files' }).click()
  await expect(page.getByTestId('files-tab')).toBeVisible()
  await expect(page.getByText('options.txt')).toBeVisible()
  await page.mouse.move(640, 120) // park cursor away from rows
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'files-1.png' })

  // Enter the config dir by double-click.
  await page.getByText('config', { exact: true }).dblclick()
  await expect(page.getByText('foo.toml')).toBeVisible()
  await page.mouse.move(640, 120)
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'files-2.png' })

  // Back to root via breadcrumb, then open the options.txt preview.
  await page.getByTestId('files-tab').getByRole('button', { name: 'Fabulously Optimized' }).click()
  await expect(page.getByText('options.txt')).toBeVisible()
  await page.getByText('options.txt').click()
  await expect(page.getByTestId('files-preview')).toBeVisible()
  await expect(page.getByTestId('files-preview')).toContainText('renderDistance:12')
  await page.mouse.move(640, 120)
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'files-3.png' })
})
