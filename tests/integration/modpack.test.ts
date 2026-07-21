import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import AdmZip from 'adm-zip'
import type Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDbAt } from '../../src/main/db'
import { InstancesService } from '../../src/main/services/instances'
import { ModpacksService } from '../../src/main/services/modpacks'
import { IconsService } from '../../src/main/services/icons'
import { paths } from '../../src/main/paths'
import { startFixtureServer, type Fixture } from './helpers/fixture-server'

/** .mrpack import: instance creation, overrides, downloads, offline path. */

let fx: Fixture
let dir: string
let db: Database.Database
let instances: InstancesService
let modpacks: ModpacksService
const savedModrinth = process.env.NATIVE_URL_MODRINTH
const createdInstances: string[] = []

beforeEach(async () => {
  fx = await startFixtureServer()
  process.env.NATIVE_URL_MODRINTH = fx.baseUrl
  dir = await mkdtemp(join(tmpdir(), 'native-mrpack-'))
  db = openDbAt(join(dir, 'native.db'))
  instances = new InstancesService(db, () => ({ memMin: 512, memMax: 2048 }))
  modpacks = new ModpacksService(db, instances, new IconsService())
  instances.on('changed', () => {
    for (const i of instances.list()) {
      if (!createdInstances.includes(i.id)) createdInstances.push(i.id)
    }
  })
})

afterEach(async () => {
  if (savedModrinth === undefined) delete process.env.NATIVE_URL_MODRINTH
  else process.env.NATIVE_URL_MODRINTH = savedModrinth
  db.close()
  await fx.close()
  await rm(dir, { recursive: true, force: true })
  for (const id of createdInstances.splice(0)) {
    await rm(paths.instance(id), { recursive: true, force: true })
  }
})

function buildMrpack(args: {
  file: string
  index: Record<string, unknown>
  overrides?: Record<string, string>
  clientOverrides?: Record<string, string>
}): Promise<void> {
  const zip = new AdmZip()
  zip.addFile('modrinth.index.json', Buffer.from(JSON.stringify(args.index)))
  for (const [p, body] of Object.entries(args.overrides ?? {})) {
    zip.addFile(`overrides/${p}`, Buffer.from(body))
  }
  for (const [p, body] of Object.entries(args.clientOverrides ?? {})) {
    zip.addFile(`client-overrides/${p}`, Buffer.from(body))
  }
  return writeFile(args.file, zip.toBuffer())
}

describe('mrpack import', () => {
  it('creates an instance, applies overrides, downloads pack files', async () => {
    const mod = fx.add('/dl/packmod-1.0.jar', 'pack mod contents')
    // Hash→version lookup used to link files back to Modrinth projects.
    fx.add(
      '/v2/version_files',
      JSON.stringify({
        [mod.sha1]: { id: 'pv1', project_id: 'packproj', name: 'Pack Mod 1.0', version_number: '1.0' }
      }),
      { contentType: 'application/json' }
    )
    const file = join(dir, 'test.mrpack')
    await buildMrpack({
      file,
      index: {
        formatVersion: 1,
        game: 'minecraft',
        versionId: '3.1.0',
        name: 'Integration Pack',
        summary: 'The test pack',
        dependencies: { minecraft: '1.20.1', 'fabric-loader': '0.15.11' },
        files: [
          {
            path: 'mods/packmod-1.0.jar',
            hashes: { sha1: mod.sha1 },
            env: { client: 'required', server: 'required' },
            downloads: [`${fx.baseUrl}/dl/packmod-1.0.jar`],
            fileSize: mod.size
          }
        ]
      },
      overrides: {
        'config/pack.toml': 'from-overrides',
        'options.txt': 'renderDistance:8'
      },
      clientOverrides: { 'config/pack.toml': 'from-client-overrides' }
    })

    const res = await modpacks.importFile(file, 4)
    expect(res.filesTotal).toBe(1)
    expect(res.overridesApplied).toBe(true)

    const inst = res.instance
    expect(inst.name).toBe('Integration Pack')
    expect(inst.mcVersion).toBe('1.20.1')
    expect(inst.loader).toBe('fabric')
    expect(inst.loaderVersion).toBe('0.15.11')
    expect(inst.notes).toBe('The test pack')

    const gameDir = paths.instanceGameDir(inst.id)
    expect(await readFile(join(gameDir, 'mods', 'packmod-1.0.jar'), 'utf-8')).toBe(
      'pack mod contents'
    )
    expect(await readFile(join(gameDir, 'options.txt'), 'utf-8')).toBe('renderDistance:8')
    // client-overrides win over overrides
    expect(await readFile(join(gameDir, 'config', 'pack.toml'), 'utf-8')).toBe(
      'from-client-overrides'
    )

    // content_index backfilled from the hash lookup → update checker covers pack mods
    const row = db
      .prepare('SELECT project_id, version_id FROM content_index WHERE instance_id = ?')
      .get(inst.id) as { project_id: string; version_id: string } | undefined
    expect(row).toEqual({ project_id: 'packproj', version_id: 'pv1' })
  })

  it('imports an override-only pack fully offline', async () => {
    process.env.NATIVE_URL_MODRINTH = 'http://127.0.0.1:1' // nothing listens here
    const file = join(dir, 'offline.mrpack')
    await buildMrpack({
      file,
      index: {
        formatVersion: 1,
        game: 'minecraft',
        versionId: '1.0.0',
        name: 'Offline Pack',
        dependencies: { minecraft: '1.20.4' },
        files: []
      },
      overrides: { 'config/offline.cfg': 'works' }
    })

    const res = await modpacks.importFile(file, 4)
    expect(res.instance.loader).toBe('vanilla')
    expect(res.filesTotal).toBe(0)
    expect(
      await readFile(join(paths.instanceGameDir(res.instance.id), 'config', 'offline.cfg'), 'utf-8')
    ).toBe('works')
  })

  it('rejects archives that are not modpacks and unsafe indexes', async () => {
    const notPack = join(dir, 'notpack.mrpack')
    const zip = new AdmZip()
    zip.addFile('something.txt', Buffer.from('hi'))
    await writeFile(notPack, zip.toBuffer())
    await expect(modpacks.importFile(notPack, 4)).rejects.toThrow(/missing modrinth.index.json/)

    const evil = join(dir, 'evil.mrpack')
    await buildMrpack({
      file: evil,
      index: {
        formatVersion: 1,
        game: 'minecraft',
        versionId: '1',
        name: 'Evil',
        dependencies: { minecraft: '1.20.1' },
        files: [
          {
            path: '../../escape.jar',
            hashes: { sha1: 'x' },
            downloads: ['https://example.com/x.jar'],
            fileSize: 1
          }
        ]
      }
    })
    const before = instances.list().length
    await expect(modpacks.importFile(evil, 4)).rejects.toThrow(/unsafe file path/)
    // rejected before any instance was created
    expect(instances.list().length).toBe(before)

    await expect(modpacks.importFile(join(dir, 'nope.txt'), 4)).rejects.toThrow(/\.mrpack/)
  })

  it('never writes override files outside the game dir', async () => {
    const file = join(dir, 'sneaky.mrpack')
    const zip = new AdmZip()
    zip.addFile(
      'modrinth.index.json',
      Buffer.from(
        JSON.stringify({
          formatVersion: 1,
          game: 'minecraft',
          versionId: '1',
          name: 'Sneaky',
          dependencies: { minecraft: '1.20.1' },
          files: []
        })
      )
    )
    // adm-zip normalizes `overrides/../escape.txt` → `escape.txt` at add-time,
    // so it falls outside the overrides root and is ignored entirely; the
    // safePackPath guard is the backstop for hand-crafted zips that keep the
    // literal `..`. Either way, nothing escapes the game dir.
    zip.addFile('overrides/../escape.txt', Buffer.from('escaped!'))
    zip.addFile('overrides/config/ok.txt', Buffer.from('fine'))
    await writeFile(file, zip.toBuffer())

    const res = await modpacks.importFile(file, 4)
    const gameDir = paths.instanceGameDir(res.instance.id)
    expect(await readFile(join(gameDir, 'config', 'ok.txt'), 'utf-8')).toBe('fine')
    expect(existsSync(join(gameDir, '..', 'escape.txt'))).toBe(false)
  })
})
