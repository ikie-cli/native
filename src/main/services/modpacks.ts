import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import AdmZip from 'adm-zip'
import type Database from 'better-sqlite3'
import type { ContentKind, ModpackInstallResult, ProjectVersion } from '@shared/types'
import { URLS, paths } from '../paths'
import { postJson } from '../utils/http'
import { ensureDir, removePath, sanitizeFileName } from '../utils/fsx'
import { DownloadManager, type DownloadTask } from '../core/download'
import { packPathSegments, parseMrpackIndex, safePackPath, type MrpackIndex } from '../core/mrpack'
import { InstancesService, uniqueName } from './instances'
import { IconsService } from './icons'
import { log } from '../logger'

const PATH_KIND: Record<string, ContentKind> = {
  mods: 'mod',
  resourcepacks: 'resourcepack',
  shaderpacks: 'shaderpack'
}

/**
 * Modrinth modpack (.mrpack) installs: one pack version becomes a new
 * instance (name/mc version/loader from the pack index), overrides are
 * extracted into the game dir, and the pack's file list downloads through the
 * normal task pipeline. Local `.mrpack` files import through the same path,
 * so a pack whose content ships entirely in overrides installs fully offline.
 */
export class ModpacksService {
  constructor(
    private db: Database.Database,
    private instances: InstancesService,
    private icons: IconsService
  ) {}

  /** Install a pack version from Modrinth (downloads the .mrpack first). */
  async installModrinth(
    args: { projectId: string; version: ProjectVersion; displayName: string; iconUrl?: string | null },
    concurrency: number
  ): Promise<ModpackInstallResult> {
    const task = DownloadManager.createTask(`pack:${args.version.id}`, {
      label: args.displayName,
      phase: 'modpack'
    })
    try {
      const dir = join(paths.cache(), 'modpacks')
      await ensureDir(dir)
      const file = join(dir, sanitizeFileName(`${args.projectId}-${args.version.id}.mrpack`))
      await task.run(
        [
          {
            url: args.version.url,
            dest: file,
            size: args.version.fileSize || undefined,
            sha1: args.version.sha1 ?? undefined
          }
        ],
        1
      )
      const result = await this.importFrom(
        file,
        task,
        { name: args.displayName, iconUrl: args.iconUrl ?? null },
        concurrency
      )
      task.finish()
      return result
    } catch (err) {
      task.fail(err)
      throw err
    }
  }

  /** Import a local .mrpack file (works offline for override-only packs). */
  async importFile(filePath: string, concurrency: number): Promise<ModpackInstallResult> {
    if (!/\.(mrpack|zip)$/i.test(filePath)) {
      throw new Error('Pick a .mrpack file exported from Modrinth')
    }
    const task = DownloadManager.createTask(`pack:import:${randomUUID().slice(0, 8)}`, {
      label: basename(filePath),
      phase: 'modpack'
    })
    try {
      const result = await this.importFrom(filePath, task, null, concurrency)
      task.finish()
      return result
    } catch (err) {
      task.fail(err)
      throw err
    }
  }

  private async importFrom(
    archivePath: string,
    task: DownloadTask,
    hint: { name: string; iconUrl: string | null } | null,
    concurrency: number
  ): Promise<ModpackInstallResult> {
    // .mrpack archives are small (index + config overrides; the heavy content
    // is in the download list), so reading them inline is fine.
    let zip: AdmZip
    try {
      zip = new AdmZip(archivePath)
    } catch {
      throw new Error('That file is not a readable modpack archive')
    }
    const indexEntry = zip.getEntry('modrinth.index.json')
    if (!indexEntry) throw new Error('Not a Modrinth modpack (missing modrinth.index.json)')
    const index = parseMrpackIndex(indexEntry.getData().toString('utf-8'))

    const name = uniqueName(
      hint?.name ?? index.name,
      this.instances.list().map((i) => i.name)
    )
    const inst = await this.instances.create({
      name,
      mcVersion: index.mcVersion,
      loader: index.loader,
      loaderVersion: index.loaderVersion,
      notes: index.summary ?? ''
    })
    const gameDir = paths.instanceGameDir(inst.id)
    const warnings: string[] = []

    // Overrides first, client-overrides second (client wins per spec).
    let overridesApplied = false
    for (const root of ['overrides/', 'client-overrides/']) {
      for (const entry of zip.getEntries()) {
        if (entry.isDirectory || !entry.entryName.startsWith(root)) continue
        const rel = entry.entryName.slice(root.length)
        if (!safePackPath(rel)) {
          warnings.push(`Skipped unsafe override path: ${entry.entryName}`)
          continue
        }
        const dest = join(gameDir, ...packPathSegments(rel))
        await ensureDir(dirname(dest))
        await writeFile(dest, entry.getData())
        overridesApplied = true
      }
    }
    if (index.serverOnlyCount > 0) {
      warnings.push(`Skipped ${index.serverOnlyCount} server-only file(s)`)
    }

    // Pack file list — the only part that needs the network on local imports.
    if (index.files.length > 0) {
      task.setPhase('content')
      await task.run(
        index.files.map((f) => ({
          url: f.urls[0],
          dest: join(gameDir, ...packPathSegments(f.path)),
          size: f.size || undefined,
          sha1: f.sha1 ?? undefined
        })),
        Math.max(1, Math.min(concurrency, 16))
      )
    }

    // Best-effort: link downloaded files back to Modrinth projects so the
    // Content tab shows names and the update checker covers them. Offline or
    // API failure just means bare filenames — never fails the install.
    await this.backfillContentIndex(inst.id, index).catch(() => undefined)
    if (hint?.iconUrl) await this.applyIcon(inst.id, hint.iconUrl).catch(() => undefined)

    log.info(
      `Imported modpack "${index.name}" → instance ${inst.id} (${index.loader} ${index.mcVersion}, ${index.files.length} files)`
    )
    return {
      instance: this.instances.get(inst.id)!,
      filesTotal: index.files.length,
      overridesApplied,
      warnings
    }
  }

  private async backfillContentIndex(instanceId: string, index: MrpackIndex): Promise<void> {
    const known = new Map<string, { fileName: string; kind: ContentKind }>()
    for (const f of index.files) {
      const segs = packPathSegments(f.path)
      const kind = PATH_KIND[segs[0]]
      if (!f.sha1 || segs.length !== 2 || !kind) continue
      known.set(f.sha1, { fileName: segs[1], kind })
    }
    if (known.size === 0) return
    const { json } = await postJson<
      Record<string, { id: string; project_id: string; name: string; version_number: string }>
    >(`${URLS.modrinth()}/v2/version_files`, {
      hashes: [...known.keys()],
      algorithm: 'sha1'
    })
    const stmt = this.db.prepare(
      `INSERT INTO content_index (instance_id, file_name, kind, project_id, version_id, platform, display_name, version_number)
       VALUES (?, ?, ?, ?, ?, 'modrinth', NULL, ?)
       ON CONFLICT(instance_id, file_name, kind) DO UPDATE SET
         project_id = excluded.project_id, version_id = excluded.version_id,
         platform = excluded.platform, version_number = excluded.version_number`
    )
    for (const [hash, file] of known) {
      const v = json?.[hash]
      if (!v?.project_id) continue
      stmt.run(instanceId, file.fileName, file.kind, v.project_id, v.id, v.version_number)
    }
  }

  private async applyIcon(instanceId: string, iconUrl: string): Promise<void> {
    const res = await fetch(iconUrl, { signal: AbortSignal.timeout(15_000) })
    if (!res.ok) return
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length === 0 || buf.length > 1024 * 1024) return
    const ext = ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(
      extname(new URL(iconUrl).pathname).toLowerCase()
    )
      ? extname(new URL(iconUrl).pathname).toLowerCase()
      : '.png'
    const tmp = join(tmpdir(), `native-pack-icon-${randomUUID().slice(0, 8)}${ext}`)
    try {
      await writeFile(tmp, buf)
      const ref = await this.icons.importImage(tmp)
      this.instances.update(instanceId, { icon: ref })
    } finally {
      await removePath(tmp)
    }
  }
}
