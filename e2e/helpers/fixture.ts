import { PNG } from 'pngjs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  startFixtureServer,
  type Fixture
} from '../../tests/integration/helpers/fixture-server'
import { buildFakeClientJar } from '../../tests/integration/helpers/fake-mc'

export const FAKE_MC_VERSION = '1.99.0'
export const FAKE_LOADER_VERSION = '0.16.9'
export const FABRIC_PROFILE_ID = `fabric-loader-${FAKE_LOADER_VERSION}-${FAKE_MC_VERSION}`

export interface E2EFixture {
  fx: Fixture
  env: Record<string, string>
  close: () => Promise<void>
}

function json(fx: Fixture, path: string, body: unknown): { sha1: string; size: number } {
  return fx.add(path, JSON.stringify(body), { contentType: 'application/json' })
}

/** Solid-color PNG for deterministic imagery. */
export function solidPng(w: number, h: number, rgb: [number, number, number]): Buffer {
  const png = new PNG({ width: w, height: h })
  for (let i = 0; i < w * h; i++) {
    png.data[i * 4] = rgb[0]
    png.data[i * 4 + 1] = rgb[1]
    png.data[i * 4 + 2] = rgb[2]
    png.data[i * 4 + 3] = 255
  }
  return PNG.sync.write(png)
}

/** Two-tone diagonal gradient PNG — photo-like tonal spread for news banners. */
export function gradientBanner(
  w: number,
  h: number,
  from: [number, number, number],
  to: [number, number, number]
): Buffer {
  const png = new PNG({ width: w, height: h })
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = (x / w + y / h) / 2
      const i = (y * w + x) * 4
      png.data[i] = Math.round(from[0] + (to[0] - from[0]) * t)
      png.data[i + 1] = Math.round(from[1] + (to[1] - from[1]) * t)
      png.data[i + 2] = Math.round(from[2] + (to[2] - from[2]) * t)
      png.data[i + 3] = 255
    }
  }
  return PNG.sync.write(png)
}

/**
 * Boot a hermetic upstream: Mojang manifest + version json + client jar,
 * empty assets, Fabric meta + profile (mainClass = FakeClient so the loader
 * path actually launches), a Modrinth catalog with an installable mod, and
 * a Minecraft news feed with generated imagery.
 */
export async function startE2EFixture(opts: { sleepClient?: boolean } = {}): Promise<E2EFixture> {
  const fx = await startFixtureServer()
  const work = mkdtempSync(join(tmpdir(), 'native-e2e-fx-'))

  // ---- client jar + version json ----
  const clientJar = await buildFakeClientJar(work)
  const clientMeta = fx.add('/client.jar', clientJar)
  const assetMeta = json(fx, '/assets.json', { objects: {} })
  const gameArgs = ['--gameDir', '${game_directory}', '--username', '${auth_player_name}']
  if (opts.sleepClient !== false) gameArgs.push('--sleep')

  // The seeded QA instances use real-looking version ids — register the fake
  // ecosystem for each so every seeded instance is fully launchable.
  const ALL_VERSIONS = [FAKE_MC_VERSION, '1.21.4', '1.21.1']
  for (const v of ALL_VERSIONS) {
    json(fx, `/version/${v}.json`, {
      id: v,
      type: 'release',
      mainClass: 'FakeClient',
      javaVersion: { component: 'jre-legacy', majorVersion: 11 },
      assetIndex: {
        id: `${v}-assets`,
        sha1: assetMeta.sha1,
        size: assetMeta.size,
        url: `${fx.baseUrl}/assets.json`
      },
      downloads: {
        client: { url: `${fx.baseUrl}/client.jar`, sha1: clientMeta.sha1, size: clientMeta.size }
      },
      libraries: [],
      arguments: { jvm: ['-cp', '${classpath}'], game: gameArgs },
      releaseTime: '2026-06-01T00:00:00+00:00'
    })
  }

  // ---- Mojang manifest ----
  json(fx, '/manifest.json', {
    latest: { release: FAKE_MC_VERSION, snapshot: FAKE_MC_VERSION },
    versions: ALL_VERSIONS.map((v) => ({
      id: v,
      type: 'release',
      url: `${fx.baseUrl}/version/${v}.json`,
      releaseTime: '2026-06-01T00:00:00+00:00'
    }))
  })

  // ---- Fabric meta: loader lists + launchable profiles ----
  const fakeLibBytes = Buffer.from('PKfake-fabric-loader')
  fx.add(`/maven/net/fabricmc/fabric-loader/${FAKE_LOADER_VERSION}/fabric-loader-${FAKE_LOADER_VERSION}.jar`, fakeLibBytes)
  for (const v of ALL_VERSIONS) {
    json(fx, `/v2/versions/loader/${v}`, [
      { loader: { version: FAKE_LOADER_VERSION, stable: true } },
      { loader: { version: '0.15.0', stable: true } }
    ])
    json(fx, `/v2/versions/loader/${v}/${FAKE_LOADER_VERSION}/profile/json`, {
      id: `fabric-loader-${FAKE_LOADER_VERSION}-${v}`,
      inheritsFrom: v,
      type: 'release',
      // FakeClient again so launching the modded profile actually spawns.
      mainClass: 'FakeClient',
      arguments: { jvm: [], game: [] },
      libraries: [
        { name: `net.fabricmc:fabric-loader:${FAKE_LOADER_VERSION}`, url: `${fx.baseUrl}/maven/` }
      ]
    })
  }

  // ---- Modrinth: search + versions + file ----
  const modJar = Buffer.from('PKfake-sodium-mod-bytes')
  const modMeta = fx.add('/files/sodium-fabric.jar', modJar)
  json(fx, '/v2/search', {
    hits: [
      {
        project_id: 'AANobbMI',
        slug: 'sodium',
        title: 'Sodium',
        author: 'CaffeineMC',
        description:
          'A high-performance rendering engine replacement for Minecraft, which greatly improves frame rates and reduces micro-stutter.',
        icon_url: null,
        downloads: 189_170_000,
        follows: 38_900,
        date_modified: '2026-07-01T00:00:00Z',
        categories: ['optimization'],
        project_type: 'mod'
      },
      {
        project_id: 'P7dR8mSH',
        slug: 'fabric-api',
        title: 'Fabric API',
        author: 'modmuss50',
        description:
          'Lightweight and modular API providing common hooks and intercompatibility measures utilized by mods using the Fabric toolchain.',
        icon_url: null,
        downloads: 210_230_000,
        follows: 34_200,
        date_modified: '2026-07-10T00:00:00Z',
        categories: ['library'],
        project_type: 'mod'
      }
    ],
    total_hits: 2
  })
  fx.add('/img/pack1.png', gradientBanner(128, 128, [45, 120, 70], [150, 225, 120]), {
    contentType: 'image/png'
  })
  fx.add('/img/pack2.png', gradientBanner(128, 128, [58, 76, 150], [130, 180, 235]), {
    contentType: 'image/png'
  })
  fx.add('/img/pack3.png', gradientBanner(128, 128, [130, 70, 38], [230, 170, 80]), {
    contentType: 'image/png'
  })
  const packSearch = new URLSearchParams({
    query: '',
    facets: JSON.stringify([['project_type:modpack']]),
    index: 'downloads',
    offset: '0',
    limit: '3'
  })
  json(fx, `/v2/search?${packSearch}`, {
    hits: [
      {
        project_id: 'pack-fabulously-optimized',
        slug: 'fabulously-optimized',
        title: 'Fabulously Optimized',
        author: 'Fabulously Optimized',
        description: 'A fast, open-source Fabric pack focused on performance and quality-of-life improvements.',
        icon_url: `${fx.baseUrl}/img/pack1.png`,
        downloads: 12_800_000,
        follows: 48_000,
        date_modified: '2026-07-18T00:00:00Z',
        categories: ['optimization'],
        project_type: 'modpack'
      },
      {
        project_id: 'pack-better-mc',
        slug: 'better-mc',
        title: 'Better MC',
        author: 'LunaPixelStudios',
        description: 'A feature-rich adventure pack that expands Minecraft while keeping its familiar feel.',
        icon_url: `${fx.baseUrl}/img/pack2.png`,
        downloads: 9_600_000,
        follows: 31_000,
        date_modified: '2026-07-16T00:00:00Z',
        categories: ['adventure'],
        project_type: 'modpack'
      },
      {
        project_id: 'pack-prominence',
        slug: 'prominence-ii',
        title: 'Prominence II',
        author: 'LunaPixelStudios',
        description: 'Explore a progression-focused RPG world packed with quests, bosses, and new gear.',
        icon_url: `${fx.baseUrl}/img/pack3.png`,
        downloads: 7_400_000,
        follows: 27_000,
        date_modified: '2026-07-14T00:00:00Z',
        categories: ['adventure', 'magic'],
        project_type: 'modpack'
      }
    ],
    total_hits: 3
  })
  json(fx, '/v2/project/AANobbMI/version', [
    {
      id: 'ver-sodium-1',
      project_id: 'AANobbMI',
      name: 'Sodium 0.6.0',
      version_number: '0.6.0',
      game_versions: [FAKE_MC_VERSION],
      loaders: ['fabric'],
      date_published: '2026-07-01T00:00:00Z',
      downloads: 1000,
      files: [
        {
          url: `${fx.baseUrl}/files/sodium-fabric.jar`,
          filename: 'sodium-fabric-0.6.0.jar',
          primary: true,
          size: modMeta.size,
          hashes: { sha1: modMeta.sha1 }
        }
      ],
      dependencies: []
    }
  ])
  json(fx, '/v2/project/P7dR8mSH/version', [])

  // ---- Minecraft news with generated images ----
  fx.add('/img/news1.png', gradientBanner(640, 360, [14, 90, 44], [120, 224, 143]))
  fx.add('/img/news2.png', gradientBanner(640, 360, [26, 46, 94], [140, 180, 255]))
  fx.add('/img/news3.png', gradientBanner(640, 360, [88, 46, 130], [230, 170, 120]))
  json(fx, '/v2/news.json', {
    entries: [
      {
        id: 'n1',
        title: 'The Garden Awakens — new update out now',
        category: 'Minecraft: Java Edition',
        date: '2026-07-12T10:00:00Z',
        text: 'Creaking woods and pale gardens arrive.',
        newsPageImage: { url: `${fx.baseUrl}/img/news1.png` },
        readMoreLink: 'https://www.minecraft.net',
        newsType: ['Java']
      },
      {
        id: 'n2',
        title: 'Minecraft Live announced for September',
        category: 'News',
        date: '2026-07-08T10:00:00Z',
        text: 'Tune in for the next mob vote.',
        newsPageImage: { url: `${fx.baseUrl}/img/news2.png` },
        readMoreLink: 'https://www.minecraft.net',
        newsType: ['Java']
      },
      {
        id: 'n3',
        title: 'Trails & Tales retrospective',
        category: 'Deep dive',
        date: '2026-07-01T10:00:00Z',
        text: 'A look back at archaeology.',
        newsPageImage: { url: `${fx.baseUrl}/img/news3.png` },
        readMoreLink: 'https://www.minecraft.net',
        newsType: ['Java']
      }
    ]
  })

  const env: Record<string, string> = {
    NATIVE_URL_VERSION_MANIFEST: `${fx.baseUrl}/manifest.json`,
    NATIVE_URL_RESOURCES: `${fx.baseUrl}/resources`,
    NATIVE_URL_FABRIC_META: fx.baseUrl,
    NATIVE_URL_MODRINTH: fx.baseUrl,
    NATIVE_URL_LAUNCHER_CONTENT: fx.baseUrl
  }
  return { fx, env, close: () => fx.close() }
}
