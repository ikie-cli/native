import { mkdtemp, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDbAt } from '../../src/main/db'
import { InstancesService } from '../../src/main/services/instances'
import { ContentService } from '../../src/main/services/content'
import { paths } from '../../src/main/paths'
import type { InstanceConfig, ProjectVersion } from '../../src/shared/types'
import { startFixtureServer, type Fixture } from './helpers/fixture-server'

/**
 * Mod update checks + applies against a fake Modrinth on the fixture server,
 * including the offline path: a check that can't reach the network keeps the
 * cached results (badge data) instead of failing.
 */

let fx: Fixture
let dir: string
let db: Database.Database
let instances: InstancesService
let content: ContentService
let inst: InstanceConfig
const savedModrinth = process.env.NATIVE_URL_MODRINTH

function mrVersion(args: {
  id: string
  number: string
  date: string
  fileName: string
  url: string
  sha1: string
  size: number
}): Record<string, unknown> {
  return {
    id: args.id,
    project_id: 'proj1',
    name: `Test Mod ${args.number}`,
    version_number: args.number,
    game_versions: ['1.20.1'],
    loaders: ['fabric'],
    date_published: args.date,
    downloads: 100,
    files: [
      {
        url: args.url,
        filename: args.fileName,
        primary: true,
        size: args.size,
        hashes: { sha1: args.sha1 }
      }
    ],
    dependencies: []
  }
}

/** Local ProjectVersion (renderer shape) matching a fixture file. */
function pv(args: {
  id: string
  number: string
  date: string
  fileName: string
  url: string
  sha1: string
  size: number
}): ProjectVersion {
  return {
    id: args.id,
    projectId: 'proj1',
    name: `Test Mod ${args.number}`,
    versionNumber: args.number,
    gameVersions: ['1.20.1'],
    loaders: ['fabric'],
    datePublished: args.date,
    downloads: 100,
    fileName: args.fileName,
    fileSize: args.size,
    sha1: args.sha1,
    url: args.url,
    dependencies: []
  }
}

beforeEach(async () => {
  fx = await startFixtureServer()
  process.env.NATIVE_URL_MODRINTH = fx.baseUrl
  dir = await mkdtemp(join(tmpdir(), 'native-updates-'))
  db = openDbAt(join(dir, 'native.db'))
  instances = new InstancesService(db, () => ({ memMin: 512, memMax: 2048 }))
  content = new ContentService(db, () => null)
  inst = await instances.create({ name: 'Upd', mcVersion: '1.20.1', loader: 'fabric' })
})

afterEach(async () => {
  if (savedModrinth === undefined) delete process.env.NATIVE_URL_MODRINTH
  else process.env.NATIVE_URL_MODRINTH = savedModrinth
  db.close()
  await fx.close()
  await rm(dir, { recursive: true, force: true })
  await rm(paths.instance(inst.id), { recursive: true, force: true })
})

async function installV1(): Promise<{ v1sha: string; v2sha: string }> {
  const v1 = fx.add('/dl/testmod-1.0.jar', 'mod bytes v1')
  const v2 = fx.add('/dl/testmod-2.0.jar', 'mod bytes v2 (bigger)')
  fx.add(
    '/v2/project/proj1/version',
    JSON.stringify([
      mrVersion({
        id: 'v2',
        number: '2.0',
        date: '2025-06-01T00:00:00Z',
        fileName: 'testmod-2.0.jar',
        url: `${fx.baseUrl}/dl/testmod-2.0.jar`,
        sha1: v2.sha1,
        size: v2.size
      }),
      mrVersion({
        id: 'v1',
        number: '1.0',
        date: '2025-01-01T00:00:00Z',
        fileName: 'testmod-1.0.jar',
        url: `${fx.baseUrl}/dl/testmod-1.0.jar`,
        sha1: v1.sha1,
        size: v1.size
      })
    ]),
    { contentType: 'application/json' }
  )
  await content.install(
    inst.id,
    'modrinth',
    'proj1',
    pv({
      id: 'v1',
      number: '1.0',
      date: '2025-01-01T00:00:00Z',
      fileName: 'testmod-1.0.jar',
      url: `${fx.baseUrl}/dl/testmod-1.0.jar`,
      sha1: v1.sha1,
      size: v1.size
    }),
    'mod',
    'Test Mod',
    '1.20.1',
    'fabric'
  )
  return { v1sha: v1.sha1, v2sha: v2.sha1 }
}

const modsDir = (): string => join(paths.instanceGameDir(inst.id), 'mods')

describe('content update checks', () => {
  it('finds a newer compatible version and persists it', async () => {
    await installV1()
    const res = await content.checkUpdates(inst.id, '1.20.1', 'fabric')
    expect(res.fromCache).toBe(false)
    expect(res.checkedAt).toBeTypeOf('number')
    expect(res.updates).toHaveLength(1)
    expect(res.updates[0]).toMatchObject({
      fileName: 'testmod-1.0.jar',
      kind: 'mod',
      projectId: 'proj1',
      installedVersion: '1.0',
      newVersionId: 'v2',
      newVersionNumber: '2.0'
    })
    // listLocal surfaces the update per file (drives the row button)
    const files = await content.listLocal(inst.id, 'mod')
    expect(files[0].update).toEqual({ versionId: 'v2', versionNumber: '2.0' })
  })

  it('keeps cached results when the network is unreachable (offline)', async () => {
    await installV1()
    await content.checkUpdates(inst.id, '1.20.1', 'fabric')

    // Now go "offline": nothing listens on port 1.
    process.env.NATIVE_URL_MODRINTH = 'http://127.0.0.1:1'
    const offline = await content.checkUpdates(inst.id, '1.20.1', 'fabric')
    expect(offline.fromCache).toBe(true)
    expect(offline.updates).toHaveLength(1)
    expect(offline.updates[0].newVersionNumber).toBe('2.0')

    // The pure cache read (badge on startup) works with zero network too.
    const cached = await content.updates(inst.id)
    expect(cached.updates).toHaveLength(1)
  }, 60_000)

  it('reports up to date when the installed version is newest', async () => {
    const v1 = fx.add('/dl/only-1.0.jar', 'only version')
    fx.add(
      '/v2/project/proj1/version',
      JSON.stringify([
        mrVersion({
          id: 'v1',
          number: '1.0',
          date: '2025-01-01T00:00:00Z',
          fileName: 'only-1.0.jar',
          url: `${fx.baseUrl}/dl/only-1.0.jar`,
          sha1: v1.sha1,
          size: v1.size
        })
      ]),
      { contentType: 'application/json' }
    )
    await content.install(
      inst.id,
      'modrinth',
      'proj1',
      pv({
        id: 'v1',
        number: '1.0',
        date: '2025-01-01T00:00:00Z',
        fileName: 'only-1.0.jar',
        url: `${fx.baseUrl}/dl/only-1.0.jar`,
        sha1: v1.sha1,
        size: v1.size
      }),
      'mod',
      'Test Mod',
      '1.20.1',
      'fabric'
    )
    const res = await content.checkUpdates(inst.id, '1.20.1', 'fabric')
    expect(res.updates).toHaveLength(0)
  })
})

describe('applying updates', () => {
  it('replaces the old file, updates the index, clears the update', async () => {
    await installV1()
    await content.checkUpdates(inst.id, '1.20.1', 'fabric')
    await content.applyUpdate(inst.id, 'mod', 'testmod-1.0.jar', '1.20.1', 'fabric')

    expect(existsSync(join(modsDir(), 'testmod-2.0.jar'))).toBe(true)
    expect(existsSync(join(modsDir(), 'testmod-1.0.jar'))).toBe(false)

    const files = await content.listLocal(inst.id, 'mod')
    expect(files).toHaveLength(1)
    expect(files[0].fileName).toBe('testmod-2.0.jar')
    expect(files[0].meta?.version).toBe('2.0')
    expect(files[0].update).toBeNull()

    const after = await content.updates(inst.id)
    expect(after.updates).toHaveLength(0)
  })

  it('preserves the disabled state across an update', async () => {
    await installV1()
    await content.checkUpdates(inst.id, '1.20.1', 'fabric')
    await content.toggle(inst.id, 'mod', 'testmod-1.0.jar', false)

    await content.applyUpdate(inst.id, 'mod', 'testmod-1.0.jar', '1.20.1', 'fabric')

    expect(existsSync(join(modsDir(), 'testmod-2.0.jar.disabled'))).toBe(true)
    expect(existsSync(join(modsDir(), 'testmod-2.0.jar'))).toBe(false)
    expect(existsSync(join(modsDir(), 'testmod-1.0.jar.disabled'))).toBe(false)
    const files = await content.listLocal(inst.id, 'mod')
    expect(files).toHaveLength(1)
    expect(files[0].enabled).toBe(false)
  })

  it('updateAll applies everything and reports failures per file', async () => {
    await installV1()
    await content.checkUpdates(inst.id, '1.20.1', 'fabric')
    const res = await content.updateAll(inst.id, '1.20.1', 'fabric')
    expect(res.applied).toBe(1)
    expect(res.failed).toHaveLength(0)
  })
})
