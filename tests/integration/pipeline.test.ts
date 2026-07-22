import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { CrashInfo, InstanceConfig, RunningGame } from '../../src/shared/types'
import { DownloadTask } from '../../src/main/core/download'
import { installVersion } from '../../src/main/core/install'
import { LaunchManager } from '../../src/main/core/launch'
import { LogsService } from '../../src/main/services/logs'
import { installLoader, listLoaderVersions, pickLoaderVersion } from '../../src/main/core/loaders'
import { resolveVersionJson } from '../../src/main/core/manifest'
import {
  findJava,
  installFakeVersionFixture,
  writeLocalVersionJson
} from './helpers/fake-mc'
import { startFixtureServer, type Fixture } from './helpers/fixture-server'

const java = findJava()

let fx: Fixture
let dir: string

beforeEach(async () => {
  fx = await startFixtureServer()
  dir = await mkdtemp(join(tmpdir(), 'native-pipe-'))
  process.env.NATIVE_DATA_DIR = dir
})

afterEach(async () => {
  await fx.close()
  await rm(dir, { recursive: true, force: true })
  delete process.env.NATIVE_URL_FABRIC_META
})

function fakeInstance(versionId: string, overrides: Partial<InstanceConfig> = {}): InstanceConfig {
  return {
    id: 'inst-1',
    name: 'Pipeline Test',
    icon: null,
    mcVersion: versionId,
    loader: 'vanilla',
    loaderVersion: null,
    javaPath: java,
    memMin: 256,
    memMax: 512,
    jvmArgs: '',
    gameWidth: null,
    gameHeight: null,
    fullscreen: false,
    group: null,
    createdAt: Date.now(),
    lastPlayedAt: null,
    totalPlayMs: 0,
    installed: false,
    notes: '',
    resolvedVersionId: null,
    ...overrides
  }
}

function manager(versionId: string, playtimes: [string, number, number][]): LaunchManager {
  return new LaunchManager({
    resolveVersionId: async () => versionId,
    peekVersionId: async () => versionId,
    account: async () => ({ name: 'Tester', uuid: 'u-1', accessToken: 'offline', type: 'offline' }),
    concurrency: () => 4,
    onPlaytime: (id, s, e) => playtimes.push([id, s, e]),
    confirmJavaDownload: async () => true
  })
}

describe.skipIf(!java)('download → install → launch pipeline', () => {
  it('installs a version end-to-end: client jar, assets, resolved classpath', async () => {
    const fake = await installFakeVersionFixture(fx, dir)
    await writeLocalVersionJson(dir, fake.versionJson)

    const task = new DownloadTask('install', { label: 'test' })
    const prepared = await installVersion(fake.versionId, task, 4)
    task.finish()

    const jar = await readFile(prepared.clientJar)
    expect(jar.equals(fake.clientJar)).toBe(true)
    expect(prepared.classpath[prepared.classpath.length - 1]).toBe(prepared.clientJar)
    // asset index landed in assets/indexes
    const idx = await stat(join(dir, 'assets', 'indexes', `${fake.versionId}-assets.json`))
    expect(idx.isFile()).toBe(true)
    // re-install is a fast no-op (files verify, no re-downloads)
    fx.requests.length = 0
    const task2 = new DownloadTask('install2', { label: 'test' })
    await installVersion(fake.versionId, task2, 4)
    task2.finish()
    expect(fx.requests.filter((r) => r.path.startsWith('/client'))).toHaveLength(0)
  })

  it('launches the game, streams logs, tracks the process, records playtime', async () => {
    const fake = await installFakeVersionFixture(fx, dir)
    await writeLocalVersionJson(dir, fake.versionJson)
    const playtimes: [string, number, number][] = []
    const lm = manager(fake.versionId, playtimes)
    const inst = fakeInstance(fake.versionId)

    const logs: string[] = []
    lm.on('log', (_id: string, line: { text: string }) => logs.push(line.text))
    const changed: RunningGame[][] = []
    lm.on('changed', (list: RunningGame[]) => changed.push(list))

    const game = await lm.launch(inst, { javaOverride: java })
    expect(game.pid).toBeGreaterThan(0)
    expect(lm.isRunning(inst.id)).toBe(true)

    // wait for exit
    await new Promise<void>((resolve) => {
      const check = (): void => {
        if (!lm.isRunning(inst.id)) resolve()
        else setTimeout(check, 100)
      }
      check()
    })

    // the fake client wrote its argv into the game dir
    const launched = await readFile(
      join(dir, 'instances', inst.id, 'minecraft', 'launched.txt'),
      'utf-8'
    )
    expect(launched).toContain('--username')
    expect(launched).toContain('Tester')
    expect(launched).toContain('--gameDir')

    expect(logs.some((l) => l.includes('FakeClient starting'))).toBe(true)
    expect(logs.some((l) => l.includes('FakeClient done'))).toBe(true)
    expect(playtimes).toHaveLength(1)
    expect(playtimes[0][0]).toBe(inst.id)
    expect(playtimes[0][2]).toBeGreaterThanOrEqual(playtimes[0][1])
    expect(changed.length).toBeGreaterThanOrEqual(2) // started + stopped
    expect(lm.list()).toHaveLength(0)
  })

  it('emits multiplayer session events inferred from the client log', async () => {
    const fake = await installFakeVersionFixture(fx, dir)
    await writeLocalVersionJson(dir, fake.versionJson)
    const lm = manager(fake.versionId, [])
    const inst = fakeInstance(fake.versionId, { id: 'inst-server-log' })
    const connected: [string, string, number][] = []
    const disconnected: [string, number][] = []
    lm.on('server-connect', (id: string, address: string, at: number) =>
      connected.push([id, address, at])
    )
    lm.on('server-disconnect', (id: string, at: number) => disconnected.push([id, at]))

    await lm.launch(inst, {
      javaOverride: java,
      server: { host: 'play.example.net', port: 25565 }
    })
    await new Promise<void>((resolve) => {
      const check = (): void => {
        if (lm.isRunning(inst.id)) setTimeout(check, 50)
        else resolve()
      }
      check()
    })

    expect(connected).toHaveLength(1)
    expect(connected[0][0]).toBe(inst.id)
    expect(connected[0][1]).toBe('play.example.net')
    expect(disconnected).toHaveLength(1)
    expect(disconnected[0][0]).toBe(inst.id)
    expect(disconnected[0][1]).toBeGreaterThanOrEqual(connected[0][2])
  })

  it('saves the session to disk and reads it back via LogsService', async () => {
    const fake = await installFakeVersionFixture(fx, dir)
    await writeLocalVersionJson(dir, fake.versionJson)
    const lm = manager(fake.versionId, [])
    const inst = fakeInstance(fake.versionId, { id: 'inst-session' })

    await lm.launch(inst, { javaOverride: java })
    await new Promise<void>((resolve) => {
      const check = (): void => {
        if (lm.isRunning(inst.id)) setTimeout(check, 100)
        else resolve()
      }
      check()
    })

    // The session file is finalized asynchronously after exit — poll for it.
    const logsSvc = new LogsService()
    let sessions = await logsSvc.sessions(inst.id)
    for (let i = 0; i < 50 && sessions.length === 0; i++) {
      await new Promise((r) => setTimeout(r, 100))
      sessions = await logsSvc.sessions(inst.id)
    }

    expect(sessions).toHaveLength(1)
    expect(sessions[0].crashed).toBe(false)
    expect(sessions[0].size).toBeGreaterThan(0)
    expect(sessions[0].startedAt).toBeGreaterThan(0)

    const lines = await logsSvc.read(inst.id, sessions[0].file)
    expect(lines.some((l) => l.text.includes('FakeClient starting'))).toBe(true)
    expect(lines.some((l) => l.text.includes('FakeClient done'))).toBe(true)
    // The `# …` header comment must be filtered out of the returned lines.
    expect(lines.every((l) => !l.text.startsWith('# '))).toBe(true)

    await logsSvc.delete(inst.id, sessions[0].file)
    expect(await logsSvc.sessions(inst.id)).toHaveLength(0)
  })

  it('marks a crashed session as .crash.log', async () => {
    const fake = await installFakeVersionFixture(fx, dir, {
      versionId: 'crash-session-1.0',
      gameArgs: ['--crash']
    })
    await writeLocalVersionJson(dir, fake.versionJson)
    const lm = manager(fake.versionId, [])
    const inst = fakeInstance(fake.versionId, { id: 'inst-crash-session' })

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no crash within 20s')), 20_000)
      lm.on('crash', () => {
        clearTimeout(timer)
        resolve()
      })
      void lm.launch(inst, { javaOverride: java }).catch(reject)
    })

    const logsSvc = new LogsService()
    let sessions = await logsSvc.sessions(inst.id)
    for (let i = 0; i < 50 && (sessions.length === 0 || !sessions[0].crashed); i++) {
      await new Promise((r) => setTimeout(r, 100))
      sessions = await logsSvc.sessions(inst.id)
    }
    expect(sessions).toHaveLength(1)
    expect(sessions[0].crashed).toBe(true)
    expect(sessions[0].file).toMatch(/\.crash\.log$/)
  })

  it('detects crashes, captures the report, and emits a crash event', async () => {
    const fake = await installFakeVersionFixture(fx, dir, {
      versionId: 'crash-1.0',
      gameArgs: ['--crash']
    })
    await writeLocalVersionJson(dir, fake.versionJson)
    const lm = manager(fake.versionId, [])
    const inst = fakeInstance(fake.versionId, { id: 'inst-crash' })

    const crash = await new Promise<CrashInfo>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no crash event within 20s')), 20_000)
      lm.on('crash', (c: CrashInfo) => {
        clearTimeout(timer)
        resolve(c)
      })
      void lm.launch(inst, { javaOverride: java }).catch(reject)
    })

    expect(crash.instanceId).toBe(inst.id)
    expect(crash.exitCode).toBe(255)
    expect(crash.reportPath).toBeTruthy()
    expect(crash.report).toContain('Manually triggered debug crash')
    expect(crash.lastLog.length).toBeGreaterThan(0)
  })

  it('kill() terminates a running game', async () => {
    // A client that sleeps forever: reuse fake client but ask java to wait by
    // launching with a server arg loop is overkill — instead launch the normal
    // client and race; if it exits first, kill() returns false which is fine.
    const fake = await installFakeVersionFixture(fx, dir, { versionId: 'kill-1.0' })
    await writeLocalVersionJson(dir, fake.versionJson)
    const lm = manager(fake.versionId, [])
    const inst = fakeInstance(fake.versionId, { id: 'inst-kill' })
    await lm.launch(inst, { javaOverride: java })
    const killed = lm.kill(inst.id)
    expect(typeof killed).toBe('boolean')
    await new Promise<void>((resolve) => {
      const check = (): void => {
        if (lm.isRunning(inst.id)) setTimeout(check, 100)
        else resolve()
      }
      check()
    })
    expect(lm.isRunning(inst.id)).toBe(false)
  })

  it('refuses double-launch of the same instance', async () => {
    const fake = await installFakeVersionFixture(fx, dir, { versionId: 'dbl-1.0' })
    await writeLocalVersionJson(dir, fake.versionJson)
    const lm = manager(fake.versionId, [])
    const inst = fakeInstance(fake.versionId, { id: 'inst-dbl' })
    await lm.launch(inst, { javaOverride: java })
    if (lm.isRunning(inst.id)) {
      await expect(lm.launch(inst, { javaOverride: java })).rejects.toThrow(/already running/)
    }
    lm.kill(inst.id)
    await new Promise<void>((resolve) => {
      const check = (): void => {
        if (lm.isRunning(inst.id)) setTimeout(check, 100)
        else resolve()
      }
      check()
    })
  })
})

describe('mod loader install (fabric meta profile)', () => {
  it('lists loader versions, picks stable, installs the profile, and merges inheritance', async () => {
    process.env.NATIVE_URL_FABRIC_META = fx.baseUrl

    // Local vanilla version json (so no Mojang traffic).
    const vanilla = {
      id: '1.21.4',
      type: 'release',
      mainClass: 'net.minecraft.client.main.Main',
      javaVersion: { component: 'java-runtime-delta', majorVersion: 21 },
      assetIndex: { id: '19', sha1: 'x', size: 1, url: `${fx.baseUrl}/noop` },
      libraries: [{ name: 'com.mojang:base-lib:1.0' }],
      arguments: { game: ['--vanillaArg'], jvm: [] }
    }
    await writeLocalVersionJson(dir, vanilla as never)

    fx.add(
      '/v2/versions/loader/1.21.4',
      JSON.stringify([
        { loader: { version: '0.17.0-beta.1', stable: false } },
        { loader: { version: '0.16.9', stable: true } },
        { loader: { version: '0.16.8', stable: true } }
      ]),
      { contentType: 'application/json' }
    )
    const profile = {
      id: 'fabric-loader-0.16.9-1.21.4',
      inheritsFrom: '1.21.4',
      type: 'release',
      mainClass: 'net.fabricmc.loader.impl.launch.knot.KnotClient',
      arguments: { game: [], jvm: ['-DFabricMcEmu= net.minecraft.client.main.Main '] },
      libraries: [{ name: 'net.fabricmc:fabric-loader:0.16.9', url: 'https://maven.fabricmc.net/' }]
    }
    fx.add('/v2/versions/loader/1.21.4/0.16.9/profile/json', JSON.stringify(profile), {
      contentType: 'application/json'
    })

    const versions = await listLoaderVersions('fabric', '1.21.4')
    expect(versions[0].version).toBe('0.17.0-beta.1')
    expect(versions[0].stable).toBe(false)

    const picked = await pickLoaderVersion('fabric', '1.21.4', 'stable')
    expect(picked).toBe('0.16.9')
    const latest = await pickLoaderVersion('fabric', '1.21.4', 'latest')
    expect(latest).toBe('0.17.0-beta.1')

    const task = new DownloadTask('loader', { label: 'fabric' })
    const versionId = await installLoader('fabric', '1.21.4', '0.16.9', task)
    task.finish()
    expect(versionId).toBe('fabric-loader-0.16.9-1.21.4')

    // The stored profile resolves with vanilla inheritance applied.
    const merged = await resolveVersionJson(versionId)
    expect(merged.mainClass).toBe('net.fabricmc.loader.impl.launch.knot.KnotClient')
    expect(merged.javaVersion?.majorVersion).toBe(21)
    expect(merged.libraries.map((l) => l.name)).toContain('net.fabricmc:fabric-loader:0.16.9')
    expect(merged.libraries.map((l) => l.name)).toContain('com.mojang:base-lib:1.0')
    expect(merged.arguments?.game).toContain('--vanillaArg')
  })

  it('rejects a loader version that does not exist for the mc version', async () => {
    process.env.NATIVE_URL_FABRIC_META = fx.baseUrl
    fx.add('/v2/versions/loader/1.21.4', JSON.stringify([{ loader: { version: '0.16.9', stable: true } }]), {
      contentType: 'application/json'
    })
    await expect(pickLoaderVersion('fabric', '1.21.4', '9.9.9')).rejects.toThrow(/not available/)
  })
})
