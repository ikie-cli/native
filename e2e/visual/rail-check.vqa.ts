import { test, expect } from '@playwright/test'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import { launchApp, defaultSeed, type LaunchedApp } from '../helpers/app'
import { startE2EFixture, type E2EFixture } from '../helpers/fixture'

/** Diagnostic captures (RAIL_CHECK=1): pinned-instance strip must never clip
 *  icons — builtin or custom image — in any state (idle, active ring, hover,
 *  active+hover). Not part of the qa:visual gate. */

let fx: E2EFixture
let app: LaunchedApp

test.skip(!process.env.RAIL_CHECK, 'rail diagnostic only')

test.beforeAll(async () => {
  fx = await startE2EFixture()
})
test.afterAll(async () => {
  await fx.close()
})
test.afterEach(async () => {
  await app?.close()
})

/** Deliberately non-square art (wide banner) — the letterbox + no-crop case. */
function bannerPng(): Buffer {
  const png = new PNG({ width: 64, height: 32 })
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 64; x++) {
      const i = (y * 64 + x) * 4
      const stripe = Math.floor(x / 8) % 2 === 0
      png.data[i] = stripe ? 255 : 255
      png.data[i + 1] = stripe ? 163 : 255
      png.data[i + 2] = stripe ? 71 : 255
      png.data[i + 3] = 255
    }
  }
  return PNG.sync.write(png)
}

test('rail: every icon state unclipped (builtin + custom image)', async () => {
  test.setTimeout(120_000)
  // Pre-stage a custom image in the data dir so the seed can reference it.
  const dataDir = mkdtempSync(join(tmpdir(), 'native-rail-'))
  mkdirSync(join(dataDir, 'icons'), { recursive: true })
  writeFileSync(join(dataDir, 'icons', 'custom.png'), bannerPng())
  // Portrait art too — the case from the user's report (vertical letterbox).
  const tall = new PNG({ width: 32, height: 64 })
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 32; x++) {
      const i = (y * 32 + x) * 4
      const on = Math.floor(y / 8) % 2 === 0
      tall.data[i] = on ? 91 : 27
      tall.data[i + 1] = on ? 157 : 217
      tall.data[i + 2] = on ? 255 : 106
      tall.data[i + 3] = 255
    }
  writeFileSync(join(dataDir, 'icons', 'tall.png'), PNG.sync.write(tall))

  const base = defaultSeed() as {
    settings: Record<string, unknown>
    instances: { icon: string }[]
  }
  base.settings = { theme: 'oled' }
  base.instances[0].icon = 'image:custom.png'
  base.instances[1].icon = 'image:tall.png'

  app = await launchApp({
    dataDir,
    env: { ...fx.env, NATIVE_WIN_SIZE: '1000x640', NATIVE_AVATAR_BASE: 'https://mc-heads.net' },
    seed: base
  })
  const { page } = app
  const rail = { x: 0, y: 48, width: 64, height: 592 }

  // 1 — idle strip (custom image first, builtins after)
  await page.waitForTimeout(700)
  await page.screenshot({ path: 'diag-1-idle.png', clip: rail })

  // 2 — custom-image instance ACTIVE (ring) without hover
  await page.getByLabel('Fabulously Optimized').click()
  await expect(page.getByTestId('screen-instance')).toBeVisible()
  await page.mouse.move(500, 300) // park cursor away
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'diag-2-active.png', clip: rail })

  // 3 — custom-image instance ACTIVE + HOVER (ring + scale together)
  await page.getByLabel('Fabulously Optimized').hover()
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'diag-3-active-hover.png', clip: rail })

  // 4 — builtin instance ACTIVE + HOVER
  await page.getByLabel('Create: Above & Beyond').click()
  await expect(page.getByTestId('screen-instance').first()).toBeVisible()
  await page.getByLabel('Create: Above & Beyond').hover()
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'diag-4-builtin-active-hover.png', clip: rail })

  // Geometry dump for the custom tile — exact rects beat squinting at pixels.
  const geo = await page.evaluate(() => {
    const btn = document.querySelector('button[aria-label="Fabulously Optimized"]')!
    const tile = btn.querySelector('div')!
    const img = btn.querySelector('img')
    const strip = btn.closest('.scrollbar-none')!
    const r = (el: Element | null) => {
      if (!el) return null
      const { x, y, width, height } = el.getBoundingClientRect()
      return { x, y, width, height }
    }
    return {
      button: r(btn),
      tile: r(tile),
      tileStyle: {
        overflow: getComputedStyle(tile).overflow,
        borderRadius: getComputedStyle(tile).borderRadius
      },
      img: img
        ? {
            rect: r(img),
            objectFit: getComputedStyle(img).objectFit,
            natural: { w: (img as HTMLImageElement).naturalWidth, h: (img as HTMLImageElement).naturalHeight }
          }
        : null,
      strip: { rect: r(strip), scrollHeight: (strip as HTMLElement).scrollHeight, clientHeight: (strip as HTMLElement).clientHeight }
    }
  })
  console.log('GEOMETRY', JSON.stringify(geo, null, 1))

  // 5 — home rows with the custom image (no-crop check at larger sizes)
  await page.getByRole('complementary').getByLabel('Home').click()
  await expect(page.getByTestId('screen-home')).toBeVisible()
  await page.waitForTimeout(600)
  await page.screenshot({ path: 'diag-5-home.png' })
})
