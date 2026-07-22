import { mkdtemp, rm, writeFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDbAt } from '../../src/main/db'
import { SettingsService } from '../../src/main/services/settings'
import { InstancesService } from '../../src/main/services/instances'
import { AccountsService, plainTokenCrypto } from '../../src/main/services/accounts'
import { ServersService } from '../../src/main/services/servers'
import { DEFAULT_SETTINGS } from '../../src/shared/types'

let dir: string
let db: Database.Database

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'native-db-'))
  process.env.NATIVE_DATA_DIR = dir // instance dirs land in the sandbox
  db = openDbAt(join(dir, 'test.db'))
})

afterEach(async () => {
  db.close()
  await rm(dir, { recursive: true, force: true })
})

describe('SettingsService persistence', () => {
  it('returns defaults on empty db', () => {
    const s = new SettingsService(db)
    expect(s.get()).toEqual(DEFAULT_SETTINGS)
  })

  it('persists patches and round-trips through JSON', () => {
    const s = new SettingsService(db)
    s.set({ theme: 'oled', defaultMemMax: 8192, javaPathOverride: '/opt/java/bin/java' })
    const got = s.get()
    expect(got.theme).toBe('oled')
    expect(got.defaultMemMax).toBe(8192)
    expect(got.javaPathOverride).toBe('/opt/java/bin/java')
    expect(got.language).toBe('en') // untouched default
  })

  it('survives reopen (real durability)', () => {
    new SettingsService(db).set({ concurrentDownloads: 3 })
    db.close()
    db = openDbAt(join(dir, 'test.db'))
    expect(new SettingsService(db).get().concurrentDownloads).toBe(3)
  })

  it('ignores unknown keys', () => {
    const s = new SettingsService(db)
    s.set({ hax: true } as never)
    expect((s.get() as unknown as Record<string, unknown>).hax).toBeUndefined()
  })

  it('null values round-trip (clearing an override)', () => {
    const s = new SettingsService(db)
    s.set({ javaPathOverride: '/x' })
    s.set({ javaPathOverride: null })
    expect(s.get().javaPathOverride).toBeNull()
  })
})

describe('InstancesService CRUD', () => {
  const svc = (): InstancesService =>
    new InstancesService(db, () => ({ memMin: 512, memMax: 4096 }))

  it('creates with defaults and lists', async () => {
    const s = svc()
    const inst = await s.create({ name: '  Fabric 1.21  ', mcVersion: '1.21.4', loader: 'fabric' })
    expect(inst.name).toBe('Fabric 1.21') // trimmed
    expect(inst.memMin).toBe(512)
    expect(inst.memMax).toBe(4096)
    expect(inst.installed).toBe(false)
    expect(s.list()).toHaveLength(1)
    // game dir + standard subfolders created on disk
    for (const sub of ['mods', 'resourcepacks', 'shaderpacks', 'saves', 'screenshots']) {
      const st = await stat(join(dir, 'instances', inst.id, 'minecraft', sub))
      expect(st.isDirectory()).toBe(true)
    }
  })

  it('rejects invalid creates', async () => {
    const s = svc()
    await expect(s.create({ name: '   ', mcVersion: '1.21.4', loader: 'vanilla' })).rejects.toThrow(
      /name is required/
    )
    await expect(
      s.create({ name: 'x'.repeat(61), mcVersion: '1.21.4', loader: 'vanilla' })
    ).rejects.toThrow(/too long/)
    await expect(s.create({ name: 'ok', mcVersion: '', loader: 'vanilla' })).rejects.toThrow(
      /version is required/
    )
  })

  it('updates fields and validates memory ordering', async () => {
    const s = svc()
    const inst = await s.create({ name: 'A', mcVersion: '1.20.1', loader: 'vanilla' })
    const up = s.update(inst.id, { name: 'Renamed', memMax: 8192, jvmArgs: '-XX:+UseG1GC' })
    expect(up.name).toBe('Renamed')
    expect(up.memMax).toBe(8192)
    expect(up.jvmArgs).toBe('-XX:+UseG1GC')
    expect(() => s.update(inst.id, { memMin: 9000 })).toThrow(/cannot exceed/)
    expect(() => s.update(inst.id, { name: ' ' })).toThrow(/empty/)
    expect(() => s.update('nope', { name: 'X' })).toThrow(/not found/)
  })

  it('invalidates install flag when version or loader changes', async () => {
    const s = svc()
    const inst = await s.create({ name: 'A', mcVersion: '1.20.1', loader: 'fabric' })
    s.update(inst.id, { installed: true })
    expect(s.get(inst.id)!.installed).toBe(true)
    s.update(inst.id, { mcVersion: '1.21.4' })
    expect(s.get(inst.id)!.installed).toBe(false)

    s.update(inst.id, { installed: true })
    s.update(inst.id, { loader: 'quilt' })
    expect(s.get(inst.id)!.installed).toBe(false)
  })

  it('duplicates config + on-disk game dir with a unique name', async () => {
    const s = svc()
    const inst = await s.create({ name: 'Orig', mcVersion: '1.21.4', loader: 'fabric' })
    // put a mod file into the source instance
    const modsDir = join(dir, 'instances', inst.id, 'minecraft', 'mods')
    await writeFile(join(modsDir, 'sodium.jar'), 'fake jar')
    db.prepare(
      `INSERT INTO content_index (instance_id, file_name, kind, project_id, version_id, platform, display_name, version_number)
       VALUES (?, 'sodium.jar', 'mod', 'AANobbMI', 'v1', 'modrinth', 'Sodium', '0.6.0')`
    ).run(inst.id)

    const copy = await s.duplicate(inst.id)
    expect(copy.name).toBe('Orig (copy)')
    expect(copy.id).not.toBe(inst.id)
    expect(copy.mcVersion).toBe('1.21.4')
    const copied = await stat(join(dir, 'instances', copy.id, 'minecraft', 'mods', 'sodium.jar'))
    expect(copied.isFile()).toBe(true)
    const row = db
      .prepare('SELECT display_name FROM content_index WHERE instance_id = ? AND file_name = ?')
      .get(copy.id, 'sodium.jar') as { display_name: string }
    expect(row.display_name).toBe('Sodium')

    const copy2 = await s.duplicate(inst.id)
    expect(copy2.name).toBe('Orig (copy) 2')
  })

  it('removes instance rows and files', async () => {
    const s = svc()
    const inst = await s.create({ name: 'Gone', mcVersion: '1.21.4', loader: 'vanilla' })
    const gameDir = join(dir, 'instances', inst.id)
    await s.remove(inst.id)
    expect(s.get(inst.id)).toBeNull()
    await expect(stat(gameDir)).rejects.toThrow()
  })

  it('records playtime sessions and accumulates totals', async () => {
    const s = svc()
    const inst = await s.create({ name: 'P', mcVersion: '1.21.4', loader: 'vanilla' })
    const t0 = Date.now() - 90_000
    s.recordPlaytime(inst.id, t0, t0 + 60_000)
    s.recordPlaytime(inst.id, t0 + 60_000, t0 + 90_000)
    const got = s.get(inst.id)!
    expect(got.totalPlayMs).toBe(90_000)
    expect(got.lastPlayedAt).toBe(t0 + 90_000)
    const sessions = db
      .prepare('SELECT COUNT(*) as n FROM playtime_sessions WHERE instance_id = ?')
      .get(inst.id) as { n: number }
    expect(sessions.n).toBe(2)
  })

  it('orders list() by last played, then created', async () => {
    const s = svc()
    const a = await s.create({ name: 'A', mcVersion: '1.21.4', loader: 'vanilla' })
    const b = await s.create({ name: 'B', mcVersion: '1.21.4', loader: 'vanilla' })
    const t = Date.now()
    s.recordPlaytime(a.id, t - 1000, t)
    expect(s.list()[0].id).toBe(a.id)
    s.recordPlaytime(b.id, t, t + 1000)
    expect(s.list()[0].id).toBe(b.id)
  })
})

describe('AccountsService (offline + storage)', () => {
  const noMsmc = {
    login: async (): Promise<never> => {
      throw new Error('not used')
    },
    refresh: async (): Promise<never> => {
      throw new Error('not used')
    }
  }
  const svc = (): AccountsService => new AccountsService(db, plainTokenCrypto, noMsmc)

  it('adds offline accounts with derived uuid and auto-activates the first', () => {
    const s = svc()
    const acc = s.addOffline('Steve')
    expect(acc.type).toBe('offline')
    expect(acc.uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-3[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(acc.active).toBe(true)
  })

  it('rejects invalid usernames', () => {
    expect(() => svc().addOffline('ab')).toThrow()
    expect(() => svc().addOffline('has space')).toThrow()
  })

  it('switches active account and reassigns on removal', () => {
    const s = svc()
    const a = s.addOffline('Alpha')
    const b = s.addOffline('Beta')
    expect(s.active()?.id).toBe(a.id)
    s.setActive(b.id)
    expect(s.active()?.id).toBe(b.id)
    s.remove(b.id)
    expect(s.active()?.id).toBe(a.id)
    s.remove(a.id)
    expect(s.active()).toBeNull()
  })

  it('launchAccount returns offline credentials without network', async () => {
    const s = svc()
    s.addOffline('Steve')
    const la = await s.launchAccount()
    expect(la.type).toBe('offline')
    expect(la.name).toBe('Steve')
    expect(la.accessToken).toBe('offline')
  })

  it('launchAccount throws when no account is active', async () => {
    await expect(svc().launchAccount()).rejects.toThrow(/No account/)
  })
})

describe('ServersService CRUD', () => {
  it('adds/updates/removes servers with validation and stable ordering', () => {
    const s = new ServersService(db)
    const a = s.add('Hypixel', 'mc.hypixel.net', null)
    const b = s.add('Local', 'localhost:25566', null)
    expect(s.list().map((x) => x.name)).toEqual(['Hypixel', 'Local'])
    expect(a.sortIndex).toBe(0)
    expect(b.sortIndex).toBe(1)

    s.update(a.id, { name: 'Hyp', address: 'mc.hypixel.net:25565' })
    expect(s.list()[0].name).toBe('Hyp')

    expect(() => s.add('Bad', 'host:99999', null)).toThrow(/Invalid port/)
    expect(() => s.add('  ', 'ok.net', null)).toThrow(/name/)
    expect(() => s.update('missing', { name: 'X' })).toThrow(/not found/)

    s.remove(a.id)
    expect(s.list()).toHaveLength(1)
  })

  it('discovers servers and records per-server multiplayer playtime', async () => {
    const instances = new InstancesService(db, () => ({ memMin: 512, memMax: 4096 }))
    const inst = await instances.create({ name: 'Multiplayer', mcVersion: '1.21.4', loader: 'vanilla' })
    const s = new ServersService(db)
    const start = Date.now() - 20 * 60_000

    const detected = s.beginSession('PLAY.Example.net:25565', inst.id, start)
    expect(detected.address).toBe('play.example.net')
    expect(detected.detected).toBe(true)
    expect(detected.instanceId).toBe(inst.id)
    expect(detected.playCount).toBe(1)
    expect(detected.lastPlayedAt).toBe(start)

    const ended = s.endSession(inst.id, start + 20 * 60_000)!
    expect(ended.totalPlayMs).toBe(20 * 60_000)
    expect(ended.lastPlayedAt).toBe(start + 20 * 60_000)

    s.beginSession('play.example.net', inst.id, start + 30 * 60_000)
    s.endSession(inst.id, start + 35 * 60_000)
    const history = s.list()
    expect(history).toHaveLength(1)
    expect(history[0].playCount).toBe(2)
    expect(history[0].totalPlayMs).toBe(25 * 60_000)
    expect(
      (db.prepare('SELECT COUNT(*) AS n FROM server_playtime_sessions').get() as { n: number }).n
    ).toBe(2)
  })
})
