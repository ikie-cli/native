import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export interface LaunchedApp {
  app: ElectronApplication
  page: Page
  dataDir: string
  close: () => Promise<void>
}

export interface LaunchOpts {
  seed?: unknown
  env?: Record<string, string>
  dataDir?: string
}

/**
 * Launch the built app (out/main/index.js) with an isolated data dir.
 * `seed` is written to a JSON file and applied by src/main/seed.ts.
 */
export async function launchApp(opts: LaunchOpts = {}): Promise<LaunchedApp> {
  const dataDir = opts.dataDir ?? mkdtempSync(join(tmpdir(), 'native-e2e-'))
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    NATIVE_DATA_DIR: dataDir,
    NATIVE_E2E: '1',
    // Point avatars at an unreachable host so fetches fail instantly and the
    // deterministic FallbackHead renders — keeps hermetic runs offline-safe.
    NATIVE_AVATAR_BASE: 'http://127.0.0.1:1',
    ...opts.env
  }
  if (opts.seed) {
    const seedFile = join(dataDir, 'seed.json')
    writeFileSync(seedFile, JSON.stringify(opts.seed))
    env.NATIVE_SEED = seedFile
  }

  const app = await electron.launch({
    // --no-sandbox: required when CI runs as root; harmless otherwise.
    args: [join(__dirname, '../../out/main/index.js'), '--no-sandbox', '--disable-gpu-sandbox'],
    env,
    timeout: 30_000
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  // App shell paints the Home screen once stores hydrate.
  await page.waitForSelector('[data-testid="screen-home"]', { timeout: 20_000 })
  return {
    app,
    page,
    dataDir,
    close: async () => {
      await app.close().catch(() => undefined)
    }
  }
}

/** Standard populated seed used by most specs. */
export function defaultSeed(): unknown {
  return {
    settings: { theme: 'mono' },
    accounts: [
      { id: 'off-1', type: 'offline', username: 'TestPlayer', uuid: 'e5af59f4-0000-3000-8000-000000000001', active: true }
    ],
    instances: [
      {
        id: 'seed-fabric',
        name: 'Fabulously Optimized',
        icon: 'builtin:cube',
        mcVersion: '1.21.4',
        loader: 'fabric',
        loaderVersion: '0.16.9',
        installed: true,
        lastPlayedAt: Date.now() - 49_000,
        totalPlayMs: 2 * 3600_000
      },
      {
        id: 'seed-vanilla',
        name: 'Hoplite',
        icon: 'builtin:sword',
        mcVersion: '1.21.1',
        loader: 'vanilla',
        installed: true,
        lastPlayedAt: Date.now() - 3 * 3600_000,
        totalPlayMs: 45 * 60_000
      },
      {
        id: 'seed-neo',
        name: 'Create: Above & Beyond',
        icon: 'builtin:zap',
        mcVersion: '1.21.1',
        loader: 'neoforge',
        loaderVersion: '21.1.80',
        installed: true,
        lastPlayedAt: Date.now() - 3600_000,
        totalPlayMs: 26 * 3600_000
      },
      {
        id: 'seed-quilt',
        name: 'Skyblock Isles',
        icon: 'builtin:tree',
        mcVersion: '1.21.4',
        loader: 'quilt',
        loaderVersion: '0.27.1',
        installed: true,
        lastPlayedAt: Date.now() - 26 * 3600_000,
        totalPlayMs: 12 * 3600_000
      },
      {
        id: 'seed-forge',
        name: 'RLCraft Revival',
        icon: 'builtin:gem',
        mcVersion: '1.20.1',
        loader: 'forge',
        loaderVersion: '47.3.0',
        installed: true,
        lastPlayedAt: Date.now() - 3 * 86_400_000,
        totalPlayMs: 58 * 3600_000
      }
    ],
    servers: [
      { id: 'srv-1', name: 'Hypixel', address: 'mc.hypixel.net' },
      { id: 'srv-2', name: 'BananaSMP', address: 'play.banana.example' },
      { id: 'srv-3', name: 'Local Test', address: '127.0.0.1:25599' }
    ]
  }
}
