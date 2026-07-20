import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import type { InstanceConfig, InstanceCreate, LoaderKind } from '@shared/types'
import { DEFAULT_SETTINGS } from '@shared/types'
import { paths } from '../paths'
import { copyDir, ensureDir, removePath } from '../utils/fsx'
import { DownloadManager, type DownloadTask } from '../core/download'
import { installLoader, pickLoaderVersion } from '../core/loaders'
import { installVersion } from '../core/install'
import { log } from '../logger'

interface InstanceRow {
  id: string
  name: string
  icon: string | null
  mc_version: string
  loader: LoaderKind
  loader_version: string | null
  java_path: string | null
  mem_min: number
  mem_max: number
  jvm_args: string
  game_width: number | null
  game_height: number | null
  fullscreen: number
  grp: string | null
  created_at: number
  last_played_at: number | null
  total_play_ms: number
  installed: number
  notes: string
}

const EDITABLE: (keyof InstanceConfig)[] = [
  'name',
  'icon',
  'mcVersion',
  'loader',
  'loaderVersion',
  'javaPath',
  'memMin',
  'memMax',
  'jvmArgs',
  'gameWidth',
  'gameHeight',
  'fullscreen',
  'group',
  'notes',
  'installed'
]

const COL: Record<string, string> = {
  name: 'name',
  icon: 'icon',
  mcVersion: 'mc_version',
  loader: 'loader',
  loaderVersion: 'loader_version',
  javaPath: 'java_path',
  memMin: 'mem_min',
  memMax: 'mem_max',
  jvmArgs: 'jvm_args',
  gameWidth: 'game_width',
  gameHeight: 'game_height',
  fullscreen: 'fullscreen',
  group: 'grp',
  notes: 'notes',
  installed: 'installed',
  lastPlayedAt: 'last_played_at',
  totalPlayMs: 'total_play_ms'
}

export class InstancesService extends EventEmitter {
  constructor(
    private db: Database.Database,
    private defaults: () => { memMin: number; memMax: number }
  ) {
    super()
  }

  list(): InstanceConfig[] {
    const rows = this.db
      .prepare('SELECT * FROM instances ORDER BY last_played_at DESC NULLS LAST, created_at DESC')
      .all() as InstanceRow[]
    return rows.map(rowToConfig)
  }

  get(id: string): InstanceConfig | null {
    const row = this.db.prepare('SELECT * FROM instances WHERE id = ?').get(id) as
      | InstanceRow
      | undefined
    return row ? rowToConfig(row) : null
  }

  async create(input: InstanceCreate): Promise<InstanceConfig> {
    const name = input.name.trim()
    if (!name) throw new Error('Instance name is required')
    if (name.length > 60) throw new Error('Instance name is too long (60 max)')
    if (!input.mcVersion) throw new Error('A Minecraft version is required')
    const d = this.defaults()
    const id = randomUUID()
    const now = Date.now()
    this.db
      .prepare(
        `INSERT INTO instances
          (id, name, icon, mc_version, loader, loader_version, java_path, mem_min, mem_max,
           jvm_args, game_width, game_height, fullscreen, grp, created_at, notes)
         VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        name,
        input.icon ?? null,
        input.mcVersion,
        input.loader,
        input.loaderVersion ?? null,
        input.memMin ?? d.memMin,
        input.memMax ?? d.memMax,
        input.jvmArgs ?? '',
        input.gameWidth ?? DEFAULT_SETTINGS.defaultWidth,
        input.gameHeight ?? DEFAULT_SETTINGS.defaultHeight,
        input.fullscreen ? 1 : 0,
        input.group ?? null,
        now,
        input.notes ?? ''
      )
    await ensureDir(paths.instanceGameDir(id))
    for (const sub of ['mods', 'resourcepacks', 'shaderpacks', 'saves', 'screenshots']) {
      await ensureDir(`${paths.instanceGameDir(id)}/${sub}`)
    }
    const inst = this.get(id)!
    this.emit('changed')
    log.info(`Created instance ${name} (${id}) ${input.loader} ${input.mcVersion}`)
    return inst
  }

  update(id: string, patch: Partial<InstanceConfig>): InstanceConfig {
    const existing = this.get(id)
    if (!existing) throw new Error('Instance not found')
    if (patch.name !== undefined && !patch.name.trim()) throw new Error('Name cannot be empty')
    if (patch.memMin !== undefined || patch.memMax !== undefined) {
      const min = patch.memMin ?? existing.memMin
      const max = patch.memMax ?? existing.memMax
      if (min > max) throw new Error('Minimum RAM cannot exceed maximum RAM')
    }
    const sets: string[] = []
    const vals: unknown[] = []
    for (const key of EDITABLE) {
      if (key in patch) {
        sets.push(`${COL[key]} = ?`)
        const v = patch[key]
        vals.push(typeof v === 'boolean' ? (v ? 1 : 0) : (v ?? null))
      }
    }
    if (sets.length > 0) {
      // Version/loader change invalidates the install.
      if (
        (patch.mcVersion && patch.mcVersion !== existing.mcVersion) ||
        (patch.loader && patch.loader !== existing.loader) ||
        (patch.loaderVersion !== undefined && patch.loaderVersion !== existing.loaderVersion)
      ) {
        sets.push('installed = 0')
      }
      vals.push(id)
      this.db.prepare(`UPDATE instances SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
    }
    this.emit('changed')
    return this.get(id)!
  }

  async remove(id: string): Promise<void> {
    const inst = this.get(id)
    if (!inst) return
    this.db.prepare('DELETE FROM instances WHERE id = ?').run(id)
    await removePath(paths.instance(id))
    this.emit('changed')
    log.info(`Deleted instance ${inst.name} (${id})`)
  }

  async duplicate(id: string): Promise<InstanceConfig> {
    const src = this.get(id)
    if (!src) throw new Error('Instance not found')
    const copy = await this.create({
      name: uniqueName(
        `${src.name} (copy)`,
        this.list().map((i) => i.name)
      ),
      mcVersion: src.mcVersion,
      loader: src.loader,
      loaderVersion: src.loaderVersion,
      icon: src.icon,
      memMin: src.memMin,
      memMax: src.memMax,
      jvmArgs: src.jvmArgs,
      gameWidth: src.gameWidth,
      gameHeight: src.gameHeight,
      fullscreen: src.fullscreen,
      group: src.group,
      notes: src.notes
    })
    await copyDir(paths.instanceGameDir(id), paths.instanceGameDir(copy.id))
    this.db
      .prepare('UPDATE instances SET installed = ? WHERE id = ?')
      .run(src.installed ? 1 : 0, copy.id)
    this.db
      .prepare(
        `INSERT INTO content_index (instance_id, file_name, kind, project_id, version_id, platform, display_name, version_number)
         SELECT ?, file_name, kind, project_id, version_id, platform, display_name, version_number
         FROM content_index WHERE instance_id = ?`
      )
      .run(copy.id, id)
    this.emit('changed')
    return this.get(copy.id)!
  }

  /**
   * Resolve the launchable version id for an instance, installing the loader
   * profile on first use. Loader version 'stable'/'latest'/null are resolved
   * to a concrete version and persisted.
   */
  async resolveVersionId(inst: InstanceConfig, task?: DownloadTask): Promise<string> {
    if (inst.loader === 'vanilla') return inst.mcVersion
    const ownTask =
      task ??
      DownloadManager.createTask(`loader:${inst.id}`, { label: inst.name, phase: 'loader' })
    try {
      const concrete = await pickLoaderVersion(inst.loader, inst.mcVersion, inst.loaderVersion)
      if (concrete !== inst.loaderVersion) {
        this.db
          .prepare('UPDATE instances SET loader_version = ? WHERE id = ?')
          .run(concrete, inst.id)
      }
      const versionId = await installLoader(inst.loader, inst.mcVersion, concrete, ownTask)
      if (!task) ownTask.finish()
      return versionId
    } catch (err) {
      if (!task) ownTask.fail(err)
      throw err
    }
  }

  /** Full install: loader profile + all game files. */
  async install(id: string, concurrency: number): Promise<void> {
    const inst = this.get(id)
    if (!inst) throw new Error('Instance not found')
    const task = DownloadManager.createTask(`install:${id}`, {
      label: inst.name,
      phase: 'prepare'
    })
    try {
      const versionId = await this.resolveVersionId(inst, task)
      await installVersion(versionId, task, concurrency)
      this.db.prepare('UPDATE instances SET installed = 1 WHERE id = ?').run(id)
      task.finish()
      this.emit('changed')
    } catch (err) {
      task.fail(err)
      this.emit('changed')
      throw err
    }
  }

  recordPlaytime(instanceId: string, startedAt: number, endedAt: number): void {
    const ms = Math.max(0, endedAt - startedAt)
    this.db
      .prepare('INSERT INTO playtime_sessions (instance_id, started_at, ended_at) VALUES (?, ?, ?)')
      .run(instanceId, startedAt, endedAt)
    this.db
      .prepare(
        'UPDATE instances SET total_play_ms = total_play_ms + ?, last_played_at = ? WHERE id = ?'
      )
      .run(ms, endedAt, instanceId)
    this.emit('changed')
  }
}

function rowToConfig(r: InstanceRow): InstanceConfig {
  return {
    id: r.id,
    name: r.name,
    icon: r.icon,
    mcVersion: r.mc_version,
    loader: r.loader,
    loaderVersion: r.loader_version,
    javaPath: r.java_path,
    memMin: r.mem_min,
    memMax: r.mem_max,
    jvmArgs: r.jvm_args,
    gameWidth: r.game_width,
    gameHeight: r.game_height,
    fullscreen: r.fullscreen === 1,
    group: r.grp,
    createdAt: r.created_at,
    lastPlayedAt: r.last_played_at,
    totalPlayMs: r.total_play_ms,
    installed: r.installed === 1,
    notes: r.notes
  }
}

export function uniqueName(base: string, existing: string[]): string {
  if (!existing.includes(base)) return base
  for (let i = 2; i < 100; i++) {
    const candidate = `${base} ${i}`
    if (!existing.includes(candidate)) return candidate
  }
  return `${base} ${Date.now()}`
}
