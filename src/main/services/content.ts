import { readdir, rename, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import type {
  ContentKind,
  LocalContentFile,
  ProjectType,
  ProjectVersion,
  SearchResult
} from '@shared/types'
import { URLS, paths } from '../paths'
import { fetchJson } from '../utils/http'
import { ensureDir, exists, removePath } from '../utils/fsx'
import { DownloadManager } from '../core/download'
import { log } from '../logger'

export interface SearchQuery {
  query: string
  type: ProjectType
  mcVersion?: string | null
  loader?: string | null
  category?: string | null
  sort?: 'relevance' | 'downloads' | 'follows' | 'newest' | 'updated'
  offset?: number
  limit?: number
  platform?: 'modrinth' | 'curseforge'
}

const KIND_DIR: Record<ContentKind, string> = {
  mod: 'mods',
  resourcepack: 'resourcepacks',
  shaderpack: 'shaderpacks'
}

const TYPE_TO_KIND: Partial<Record<ProjectType, ContentKind>> = {
  mod: 'mod',
  resourcepack: 'resourcepack',
  shader: 'shaderpack'
}

/** Modrinth (primary, keyless) + CurseForge (optional, needs API key) search. */
export class ContentService {
  constructor(
    private db: Database.Database,
    private cfApiKey: () => string | null
  ) {}

  async search(q: SearchQuery): Promise<SearchResult> {
    if (q.platform === 'curseforge') return await this.searchCurseforge(q)
    return await this.searchModrinth(q)
  }

  private async searchModrinth(q: SearchQuery): Promise<SearchResult> {
    const facets: string[][] = [[`project_type:${q.type === 'shader' ? 'shader' : q.type}`]]
    if (q.mcVersion) facets.push([`versions:${q.mcVersion}`])
    if (q.loader && q.type === 'mod') facets.push([`categories:${q.loader}`])
    if (q.category) facets.push([`categories:${q.category}`])
    const params = new URLSearchParams({
      query: q.query,
      facets: JSON.stringify(facets),
      index: q.sort === 'newest' ? 'newest' : (q.sort ?? 'relevance'),
      offset: String(q.offset ?? 0),
      limit: String(Math.min(q.limit ?? 20, 100))
    })
    const res = await fetchJson<{
      hits: {
        project_id: string
        slug: string
        title: string
        author: string
        description: string
        icon_url: string | null
        downloads: number
        follows: number
        date_modified: string
        categories: string[]
        project_type: string
      }[]
      total_hits: number
    }>(`${URLS.modrinth()}/v2/search?${params}`)
    return {
      hits: res.hits.map((h) => ({
        projectId: h.project_id,
        slug: h.slug,
        platform: 'modrinth',
        type: q.type,
        title: h.title,
        author: h.author,
        description: h.description,
        icon: h.icon_url,
        downloads: h.downloads,
        follows: h.follows,
        updated: h.date_modified,
        categories: h.categories ?? []
      })),
      total: res.total_hits,
      offset: q.offset ?? 0,
      limit: q.limit ?? 20
    }
  }

  private async searchCurseforge(q: SearchQuery): Promise<SearchResult> {
    const key = this.cfApiKey()
    if (!key) {
      throw new Error('CurseForge search needs an API key — add one in Settings → Content')
    }
    const classId = { mod: 6, modpack: 4471, resourcepack: 12, shader: 6552, datapack: 6945 }[q.type]
    const params = new URLSearchParams({
      gameId: '432',
      classId: String(classId),
      searchFilter: q.query,
      sortField: q.sort === 'downloads' ? '6' : '1',
      sortOrder: 'desc',
      index: String(q.offset ?? 0),
      pageSize: String(Math.min(q.limit ?? 20, 50))
    })
    if (q.mcVersion) params.set('gameVersion', q.mcVersion)
    if (q.loader && q.type === 'mod') {
      const map: Record<string, string> = { forge: '1', fabric: '4', quilt: '5', neoforge: '6' }
      if (map[q.loader]) params.set('modLoaderType', map[q.loader])
    }
    const res = await fetchJson<{
      data: {
        id: number
        slug: string
        name: string
        summary: string
        downloadCount: number
        thumbsUpCount: number
        dateModified: string
        logo: { thumbnailUrl: string } | null
        authors: { name: string }[]
        categories: { name: string }[]
      }[]
      pagination: { totalCount: number }
    }>(`${URLS.curseforge()}/v1/mods/search?${params}`, { headers: { 'x-api-key': key } })
    return {
      hits: res.data.map((h) => ({
        projectId: String(h.id),
        slug: h.slug,
        platform: 'curseforge',
        type: q.type,
        title: h.name,
        author: h.authors[0]?.name ?? '',
        description: h.summary,
        icon: h.logo?.thumbnailUrl ?? null,
        downloads: h.downloadCount,
        follows: h.thumbsUpCount,
        updated: h.dateModified,
        categories: h.categories.map((c) => c.name)
      })),
      total: res.pagination.totalCount,
      offset: q.offset ?? 0,
      limit: q.limit ?? 20
    }
  }

  async versions(
    platform: 'modrinth' | 'curseforge',
    projectId: string,
    mcVersion?: string | null,
    loader?: string | null
  ): Promise<ProjectVersion[]> {
    if (platform === 'curseforge') return await this.cfVersions(projectId, mcVersion, loader)
    const params = new URLSearchParams()
    if (mcVersion) params.set('game_versions', JSON.stringify([mcVersion]))
    if (loader) params.set('loaders', JSON.stringify([loader]))
    const res = await fetchJson<
      {
        id: string
        project_id: string
        name: string
        version_number: string
        game_versions: string[]
        loaders: string[]
        date_published: string
        downloads: number
        files: { url: string; filename: string; primary: boolean; size: number; hashes: { sha1?: string } }[]
        dependencies: { project_id: string | null; dependency_type: string }[]
      }[]
    >(`${URLS.modrinth()}/v2/project/${encodeURIComponent(projectId)}/version?${params}`)
    return res
      .filter((v) => v.files.length > 0)
      .map((v) => {
        const file = v.files.find((f) => f.primary) ?? v.files[0]
        return {
          id: v.id,
          projectId: v.project_id,
          name: v.name,
          versionNumber: v.version_number,
          gameVersions: v.game_versions,
          loaders: v.loaders,
          datePublished: v.date_published,
          downloads: v.downloads,
          fileName: file.filename,
          fileSize: file.size,
          sha1: file.hashes.sha1 ?? null,
          url: file.url,
          dependencies: v.dependencies
            .filter((d) => d.project_id)
            .map((d) => ({
              projectId: d.project_id!,
              kind: (d.dependency_type as 'required' | 'optional' | 'incompatible' | 'embedded') ?? 'optional'
            }))
        }
      })
  }

  private async cfVersions(
    projectId: string,
    mcVersion?: string | null,
    loader?: string | null
  ): Promise<ProjectVersion[]> {
    const key = this.cfApiKey()
    if (!key) throw new Error('CurseForge needs an API key — add one in Settings → Content')
    const params = new URLSearchParams({ pageSize: '50' })
    if (mcVersion) params.set('gameVersion', mcVersion)
    if (loader) {
      const map: Record<string, string> = { forge: '1', fabric: '4', quilt: '5', neoforge: '6' }
      if (map[loader]) params.set('modLoaderType', map[loader])
    }
    const res = await fetchJson<{
      data: {
        id: number
        modId: number
        displayName: string
        fileName: string
        fileDate: string
        fileLength: number
        downloadUrl: string | null
        downloadCount: number
        gameVersions: string[]
        hashes: { value: string; algo: number }[]
        dependencies: { modId: number; relationType: number }[]
      }[]
    }>(`${URLS.curseforge()}/v1/mods/${projectId}/files?${params}`, {
      headers: { 'x-api-key': key }
    })
    return res.data
      .filter((f) => f.downloadUrl)
      .map((f) => ({
        id: String(f.id),
        projectId: String(f.modId),
        name: f.displayName,
        versionNumber: f.displayName,
        gameVersions: f.gameVersions.filter((g) => /^\d/.test(g)),
        loaders: f.gameVersions.filter((g) => !/^\d/.test(g)).map((s) => s.toLowerCase()),
        datePublished: f.fileDate,
        downloads: f.downloadCount,
        fileName: f.fileName,
        fileSize: f.fileLength,
        sha1: f.hashes.find((h) => h.algo === 1)?.value ?? null,
        url: f.downloadUrl!,
        dependencies: f.dependencies
          .filter((d) => d.relationType === 3)
          .map((d) => ({ projectId: String(d.modId), kind: 'required' as const }))
      }))
  }

  /**
   * Install a project version into an instance folder (+ required Modrinth
   * dependencies, one level deep with cycle guard).
   */
  async install(
    instanceId: string,
    platform: 'modrinth' | 'curseforge',
    projectId: string,
    version: ProjectVersion,
    kind: ContentKind,
    displayName: string,
    mcVersion?: string | null,
    loader?: string | null
  ): Promise<void> {
    const dir = join(paths.instanceGameDir(instanceId), KIND_DIR[kind])
    await ensureDir(dir)
    const task = DownloadManager.createTask(`content:${instanceId}:${version.id}`, {
      label: displayName,
      phase: 'content'
    })
    try {
      const items = [
        {
          url: version.url,
          dest: join(dir, version.fileName),
          size: version.fileSize || undefined,
          sha1: version.sha1 ?? undefined
        }
      ]
      const record: [string, string, string, string][] = [
        [version.fileName, projectId, version.id, displayName]
      ]
      // Resolve required dependencies (Modrinth only, mods only).
      if (platform === 'modrinth' && kind === 'mod') {
        const seen = new Set([projectId])
        for (const dep of version.dependencies.filter((d) => d.kind === 'required')) {
          if (seen.has(dep.projectId)) continue
          seen.add(dep.projectId)
          const depVersions = await this.versions('modrinth', dep.projectId, mcVersion, loader)
          const dv = depVersions[0]
          if (!dv) continue
          if (await exists(join(dir, dv.fileName))) continue
          items.push({
            url: dv.url,
            dest: join(dir, dv.fileName),
            size: dv.fileSize || undefined,
            sha1: dv.sha1 ?? undefined
          })
          record.push([dv.fileName, dep.projectId, dv.id, dv.name])
        }
      }
      await task.run(items, 4)
      const stmt = this.db.prepare(
        `INSERT INTO content_index (instance_id, file_name, kind, project_id, version_id, platform, display_name, version_number)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(instance_id, file_name, kind) DO UPDATE SET
           project_id = excluded.project_id, version_id = excluded.version_id,
           display_name = excluded.display_name, version_number = excluded.version_number`
      )
      for (const [fileName, pid, vid, name] of record) {
        stmt.run(instanceId, fileName, kind, pid, vid, platform, name, version.versionNumber)
      }
      task.finish()
      log.info(`Installed ${displayName} into ${instanceId}/${KIND_DIR[kind]}`)
    } catch (err) {
      task.fail(err)
      throw err
    }
  }

  /** List local files of a kind, joining index metadata when available. */
  async listLocal(instanceId: string, kind: ContentKind): Promise<LocalContentFile[]> {
    const dir = join(paths.instanceGameDir(instanceId), KIND_DIR[kind])
    let entries: string[] = []
    try {
      entries = await readdir(dir)
    } catch {
      return []
    }
    const meta = new Map<string, { display_name: string | null; version_number: string | null; project_id: string | null }>()
    const rows = this.db
      .prepare('SELECT file_name, display_name, version_number, project_id FROM content_index WHERE instance_id = ? AND kind = ?')
      .all(instanceId, kind) as {
      file_name: string
      display_name: string | null
      version_number: string | null
      project_id: string | null
    }[]
    for (const r of rows) meta.set(r.file_name, r)

    const out: LocalContentFile[] = []
    for (const name of entries) {
      const disabled = name.endsWith('.disabled')
      const baseName = disabled ? name.slice(0, -'.disabled'.length) : name
      const okExt =
        kind === 'mod' ? /\.jar$/i.test(baseName) : /\.(zip|jar)$/i.test(baseName) || !baseName.includes('.')
      if (!okExt) continue
      const st = await stat(join(dir, name)).catch(() => null)
      if (!st || st.isDirectory()) {
        if (kind === 'resourcepack' && st?.isDirectory()) {
          out.push({
            fileName: name,
            kind,
            enabled: true,
            sizeBytes: 0,
            mtime: st.mtimeMs,
            meta: null
          })
        }
        continue
      }
      const m = meta.get(baseName)
      out.push({
        fileName: baseName,
        kind,
        enabled: !disabled,
        sizeBytes: st.size,
        mtime: st.mtimeMs,
        meta: m
          ? {
              name: m.display_name ?? undefined,
              version: m.version_number ?? undefined,
              projectId: m.project_id
            }
          : null
      })
    }
    return out.sort((a, b) => a.fileName.localeCompare(b.fileName))
  }

  async toggle(instanceId: string, kind: ContentKind, fileName: string, enabled: boolean): Promise<void> {
    const dir = join(paths.instanceGameDir(instanceId), KIND_DIR[kind])
    const on = join(dir, fileName)
    const off = join(dir, `${fileName}.disabled`)
    if (enabled && (await exists(off))) await rename(off, on)
    else if (!enabled && (await exists(on))) await rename(on, off)
  }

  async removeLocal(instanceId: string, kind: ContentKind, fileName: string): Promise<void> {
    const dir = join(paths.instanceGameDir(instanceId), KIND_DIR[kind])
    await removePath(join(dir, fileName))
    await removePath(join(dir, `${fileName}.disabled`))
    this.db
      .prepare('DELETE FROM content_index WHERE instance_id = ? AND file_name = ? AND kind = ?')
      .run(instanceId, fileName, kind)
  }

  /** Copy user-picked files into the instance folder. */
  async addLocalFiles(instanceId: string, kind: ContentKind, files: string[]): Promise<number> {
    const dir = join(paths.instanceGameDir(instanceId), KIND_DIR[kind])
    await ensureDir(dir)
    const { copyFile, basename } = { copyFile: (await import('node:fs/promises')).copyFile, basename: (await import('node:path')).basename }
    let n = 0
    for (const f of files) {
      const name = basename(f)
      if (kind === 'mod' && !/\.jar$/i.test(name)) continue
      await copyFile(f, join(dir, name))
      n++
    }
    return n
  }

  kindForType(type: ProjectType): ContentKind {
    return TYPE_TO_KIND[type] ?? 'mod'
  }
}
