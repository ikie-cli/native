import { readFile, readdir, rename, stat, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import type {
  ContentKind,
  ContentUpdateInfo,
  ContentUpdatesResult,
  LocalContentFile,
  ProjectDetails,
  ProjectType,
  ProjectVersion,
  SearchResult
} from '@shared/types'
import { URLS, paths } from '../paths'
import { fetchJson } from '../utils/http'
import { ensureDir, exists, removePath } from '../utils/fsx'
import { DownloadManager } from '../core/download'
import { pickUpdate } from '../core/updates'
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

/* ---------- project icon cache ----------
 * Icons for installed content, keyed by project id, stored once under
 * <data>/cache/project-icons/. Downloaded at install time; content lists read
 * only from disk (never the network) and serve data URLs since CSP blocks
 * remote images and file:// in the renderer. */

const ICON_MAX_BYTES = 512 * 1024
const iconDir = (): string => join(paths.cache(), 'project-icons')

function iconFile(projectId: string): string {
  // Project ids are alphanumeric on both platforms; hash defensively anyway.
  return join(iconDir(), `${createHash('sha1').update(projectId).digest('hex')}.img`)
}

async function cacheProjectIcon(projectId: string, url: string): Promise<void> {
  try {
    const dest = iconFile(projectId)
    if (await exists(dest)) return
    await ensureDir(iconDir())
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
    if (!res.ok) return
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length === 0 || buf.length > ICON_MAX_BYTES) return
    await writeFile(dest, buf)
  } catch {
    /* icon is cosmetic — never fail an install over it */
  }
}

async function readCachedIcon(projectId: string): Promise<string | null> {
  try {
    const buf = await readFile(iconFile(projectId))
    const mime = buf.subarray(0, 12).includes(Buffer.from('WEBP'))
      ? 'image/webp'
      : buf[0] === 0x89
        ? 'image/png'
        : buf[0] === 0xff
          ? 'image/jpeg'
          : buf[0] === 0x47
            ? 'image/gif'
            : buf.subarray(0, 5).toString() === '<svg ' || buf.subarray(0, 5).toString() === '<?xml'
              ? 'image/svg+xml'
              : 'image/png'
    return `data:${mime};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
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
    if (!key) throw new Error('CurseForge is unavailable in this build')
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

  /** Full project page (description, gallery, links) for the detail view. */
  async project(platform: 'modrinth' | 'curseforge', projectId: string): Promise<ProjectDetails> {
    if (platform === 'curseforge') return await this.cfProject(projectId)
    const p = await fetchJson<{
      id: string
      slug: string
      project_type: string | null
      title: string
      description: string
      body: string
      icon_url: string | null
      downloads: number
      followers: number
      updated: string
      published: string
      categories: string[]
      gallery: { url: string; featured: boolean }[]
      source_url: string | null
      issues_url: string | null
      wiki_url: string | null
      license: { id: string } | null
      client_side: string | null
      server_side: string | null
      team: string
    }>(`${URLS.modrinth()}/v2/project/${encodeURIComponent(projectId)}`)
    // Author needs the team members call; tolerate failure.
    const author = await fetchJson<{ user: { username: string }; role: string }[]>(
      `${URLS.modrinth()}/v2/project/${encodeURIComponent(projectId)}/members`
    )
      .then((m) => m.find((x) => x.role === 'Owner')?.user.username ?? m[0]?.user.username ?? '')
      .catch(() => '')
    return {
      platform: 'modrinth',
      projectId: p.id,
      projectType: p.project_type ?? null,
      slug: p.slug,
      title: p.title,
      summary: p.description,
      body: p.body ?? '',
      bodyFormat: 'markdown',
      icon: p.icon_url,
      author,
      downloads: p.downloads,
      follows: p.followers,
      updated: p.updated,
      published: p.published,
      categories: p.categories ?? [],
      gallery: (p.gallery ?? []).sort((a, b) => Number(b.featured) - Number(a.featured)).map((g) => g.url),
      links: {
        website: `https://modrinth.com/project/${p.slug}`,
        source: p.source_url,
        issues: p.issues_url,
        wiki: p.wiki_url
      },
      license: p.license?.id ?? null,
      clientSide: p.client_side,
      serverSide: p.server_side
    }
  }

  private async cfProject(projectId: string): Promise<ProjectDetails> {
    const key = this.cfApiKey()
    if (!key) throw new Error('CurseForge is unavailable in this build')
    const headers = { 'x-api-key': key }
    const { data: p } = await fetchJson<{
      data: {
        id: number
        slug: string
        name: string
        summary: string
        downloadCount: number
        thumbsUpCount: number
        dateModified: string
        dateReleased: string
        logo: { url: string } | null
        authors: { name: string }[]
        categories: { name: string }[]
        screenshots: { url: string }[]
        links: { websiteUrl: string | null; sourceUrl: string | null; issuesUrl: string | null; wikiUrl: string | null }
      }
    }>(`${URLS.curseforge()}/v1/mods/${projectId}`, { headers })
    const body = await fetchJson<{ data: string }>(
      `${URLS.curseforge()}/v1/mods/${projectId}/description`,
      { headers }
    )
      .then((r) => r.data)
      .catch(() => '')
    return {
      platform: 'curseforge',
      projectId: String(p.id),
      projectType: null,
      slug: p.slug,
      title: p.name,
      summary: p.summary,
      body,
      bodyFormat: 'html',
      icon: p.logo?.url ?? null,
      author: p.authors[0]?.name ?? '',
      downloads: p.downloadCount,
      follows: p.thumbsUpCount,
      updated: p.dateModified,
      published: p.dateReleased,
      categories: p.categories.map((c) => c.name),
      gallery: (p.screenshots ?? []).map((s) => s.url),
      links: {
        website: p.links?.websiteUrl ?? `https://www.curseforge.com/minecraft/mc-mods/${p.slug}`,
        source: p.links?.sourceUrl ?? null,
        issues: p.links?.issuesUrl ?? null,
        wiki: p.links?.wikiUrl ?? null
      },
      license: null,
      clientSide: null,
      serverSide: null
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
    if (!key) throw new Error('CurseForge is unavailable in this build')
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
    loader?: string | null,
    iconUrl?: string | null
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
      const record: [string, string, string, string, string | null][] = [
        [version.fileName, projectId, version.id, displayName, iconUrl ?? null]
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
          const depIcon = await fetchJson<{ icon_url: string | null; title: string }>(
            `${URLS.modrinth()}/v2/project/${encodeURIComponent(dep.projectId)}`
          ).catch(() => null)
          record.push([
            dv.fileName,
            dep.projectId,
            dv.id,
            depIcon?.title ?? dv.name,
            depIcon?.icon_url ?? null
          ])
        }
      }
      await task.run(items, 4)
      // Installing (or re-installing) a file makes any cached update stale.
      const stmt = this.db.prepare(
        `INSERT INTO content_index (instance_id, file_name, kind, project_id, version_id, platform, display_name, version_number, icon_url)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(instance_id, file_name, kind) DO UPDATE SET
           project_id = excluded.project_id, version_id = excluded.version_id,
           display_name = excluded.display_name, version_number = excluded.version_number,
           icon_url = excluded.icon_url, update_version_json = NULL`
      )
      for (const [fileName, pid, vid, name, icon] of record) {
        stmt.run(instanceId, fileName, kind, pid, vid, platform, name, version.versionNumber, icon)
        if (icon) void cacheProjectIcon(pid, icon)
      }
      task.finish()
      log.info(`Installed ${displayName} into ${instanceId}/${KIND_DIR[kind]}`)
    } catch (err) {
      task.fail(err)
      throw err
    }
  }

  /**
   * Project ids already installed in an instance (all kinds), for marking
   * search results as installed. Disk-verified: index rows whose file is gone
   * (deleted outside the launcher) are pruned and not reported.
   */
  async installedProjectIds(instanceId: string): Promise<string[]> {
    const rows = this.db
      .prepare(
        'SELECT file_name, kind, project_id FROM content_index WHERE instance_id = ? AND project_id IS NOT NULL'
      )
      .all(instanceId) as { file_name: string; kind: ContentKind; project_id: string }[]
    const out = new Set<string>()
    for (const r of rows) {
      const file = join(paths.instanceGameDir(instanceId), KIND_DIR[r.kind] ?? 'mods', r.file_name)
      if ((await exists(file)) || (await exists(`${file}.disabled`))) {
        out.add(r.project_id)
      } else {
        this.db
          .prepare('DELETE FROM content_index WHERE instance_id = ? AND file_name = ? AND kind = ?')
          .run(instanceId, r.file_name, r.kind)
      }
    }
    return [...out]
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
    const meta = new Map<
      string,
      {
        display_name: string | null
        version_number: string | null
        project_id: string | null
        icon_url: string | null
        platform: string | null
        update_version_json: string | null
      }
    >()
    const rows = this.db
      .prepare(
        'SELECT file_name, display_name, version_number, project_id, icon_url, platform, update_version_json FROM content_index WHERE instance_id = ? AND kind = ?'
      )
      .all(instanceId, kind) as {
      file_name: string
      display_name: string | null
      version_number: string | null
      project_id: string | null
      icon_url: string | null
      platform: string | null
      update_version_json: string | null
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
            icon: null,
            meta: null,
            update: null
          })
        }
        continue
      }
      const m = meta.get(baseName)
      // Icons come from the local cache only; missing icons fall back to the
      // stored URL once (fire-and-forget fetch) so old installs backfill.
      let icon: string | null = null
      if (m?.project_id) {
        icon = await readCachedIcon(m.project_id)
        if (!icon && m.icon_url) void cacheProjectIcon(m.project_id, m.icon_url)
      }
      const update = parseUpdateJson(m?.update_version_json ?? null)
      out.push({
        fileName: baseName,
        kind,
        enabled: !disabled,
        sizeBytes: st.size,
        mtime: st.mtimeMs,
        icon,
        meta: m
          ? {
              name: m.display_name ?? undefined,
              version: m.version_number ?? undefined,
              projectId: m.project_id,
              platform: m.platform === 'curseforge' ? ('curseforge' as const) : ('modrinth' as const)
            }
          : null,
        update: update ? { versionId: update.id, versionNumber: update.versionNumber } : null
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

  /* ---------- mod updates ----------
   * Per-file checks against the platform's version list, persisted into
   * content_index so results (and the tab badge) survive restarts and work
   * offline. A check that can't reach the network keeps the cached rows and
   * reports fromCache: true instead of failing. */

  /**
   * Check every indexed file of an instance for a newer compatible version.
   * Per-project failures are skipped (cached state kept), so an offline check
   * degrades to the stored results rather than throwing.
   */
  async checkUpdates(
    instanceId: string,
    mcVersion: string | null,
    loader: string | null
  ): Promise<ContentUpdatesResult> {
    const rows = this.db
      .prepare(
        `SELECT file_name, kind, project_id, version_id, platform FROM content_index
         WHERE instance_id = ? AND project_id IS NOT NULL AND version_id IS NOT NULL`
      )
      .all(instanceId) as {
      file_name: string
      kind: ContentKind
      project_id: string
      version_id: string
      platform: string | null
    }[]
    const now = Date.now()
    const mark = this.db.prepare(
      `UPDATE content_index SET update_version_json = ?, update_checked_at = ?
       WHERE instance_id = ? AND file_name = ? AND kind = ?`
    )
    let reached = 0
    const queue = [...rows]
    const workers = Array.from({ length: 4 }, async () => {
      for (;;) {
        const row = queue.shift()
        if (!row) return
        if (!(await this.fileOnDisk(instanceId, row.kind, row.file_name))) continue
        try {
          const platform = row.platform === 'curseforge' ? ('curseforge' as const) : ('modrinth' as const)
          const versions = await this.versions(
            platform,
            row.project_id,
            mcVersion,
            row.kind === 'mod' ? loader : null
          )
          const next = pickUpdate(row.version_id, versions)
          mark.run(next ? JSON.stringify(next) : null, now, instanceId, row.file_name, row.kind)
          reached++
        } catch {
          // network/API failure — keep whatever the last successful check stored
        }
      }
    })
    await Promise.all(workers)
    return await this.updates(instanceId, rows.length > 0 && reached === 0)
  }

  /** Cached update state — reads only the DB and disk, safe offline. */
  async updates(instanceId: string, fromCache = false): Promise<ContentUpdatesResult> {
    const rows = this.db
      .prepare(
        `SELECT file_name, kind, project_id, platform, display_name, version_number,
                update_version_json, update_checked_at
         FROM content_index WHERE instance_id = ?`
      )
      .all(instanceId) as {
      file_name: string
      kind: ContentKind
      project_id: string | null
      platform: string | null
      display_name: string | null
      version_number: string | null
      update_version_json: string | null
      update_checked_at: number | null
    }[]
    const updates: ContentUpdateInfo[] = []
    let checkedAt: number | null = null
    for (const r of rows) {
      if (r.update_checked_at && (!checkedAt || r.update_checked_at > checkedAt)) {
        checkedAt = r.update_checked_at
      }
      const next = parseUpdateJson(r.update_version_json)
      if (!next || !r.project_id) continue
      if (!(await this.fileOnDisk(instanceId, r.kind, r.file_name))) continue
      updates.push({
        instanceId,
        kind: r.kind,
        fileName: r.file_name,
        projectId: r.project_id,
        platform: r.platform === 'curseforge' ? 'curseforge' : 'modrinth',
        displayName: r.display_name ?? r.file_name,
        installedVersion: r.version_number,
        newVersionId: next.id,
        newVersionNumber: next.versionNumber
      })
    }
    updates.sort((a, b) => a.displayName.localeCompare(b.displayName))
    return { instanceId, checkedAt, fromCache, updates }
  }

  /**
   * Apply a cached update: install the stored new version (no version lookup
   * needed — the full ProjectVersion was persisted at check time), remove the
   * old file when the name changed, and preserve the enabled/disabled state.
   */
  async applyUpdate(
    instanceId: string,
    kind: ContentKind,
    fileName: string,
    mcVersion: string | null,
    loader: string | null
  ): Promise<void> {
    const row = this.db
      .prepare(
        `SELECT project_id, platform, display_name, icon_url, update_version_json
         FROM content_index WHERE instance_id = ? AND file_name = ? AND kind = ?`
      )
      .get(instanceId, fileName, kind) as
      | {
          project_id: string | null
          platform: string | null
          display_name: string | null
          icon_url: string | null
          update_version_json: string | null
        }
      | undefined
    const next = row?.update_version_json
      ? (JSON.parse(row.update_version_json) as ProjectVersion)
      : null
    if (!row?.project_id || !next) throw new Error(`No update available for ${fileName}`)

    const dir = join(paths.instanceGameDir(instanceId), KIND_DIR[kind])
    const wasDisabled =
      !(await exists(join(dir, fileName))) && (await exists(join(dir, `${fileName}.disabled`)))
    if (wasDisabled) await removePath(join(dir, `${fileName}.disabled`))

    const platform = row.platform === 'curseforge' ? ('curseforge' as const) : ('modrinth' as const)
    await this.install(
      instanceId,
      platform,
      row.project_id,
      next,
      kind,
      row.display_name ?? next.name,
      mcVersion,
      loader,
      row.icon_url
    )
    if (next.fileName !== fileName) await this.removeLocal(instanceId, kind, fileName)
    if (wasDisabled) await this.toggle(instanceId, kind, next.fileName, false)
    log.info(`Updated ${fileName} → ${next.fileName} in ${instanceId}`)
  }

  /** Apply every cached update; per-file failures don't stop the rest. */
  async updateAll(
    instanceId: string,
    mcVersion: string | null,
    loader: string | null
  ): Promise<{ applied: number; failed: { fileName: string; error: string }[] }> {
    const { updates } = await this.updates(instanceId)
    const failed: { fileName: string; error: string }[] = []
    for (const u of updates) {
      try {
        await this.applyUpdate(instanceId, u.kind, u.fileName, mcVersion, loader)
      } catch (err) {
        failed.push({ fileName: u.fileName, error: err instanceof Error ? err.message : String(err) })
      }
    }
    return { applied: updates.length - failed.length, failed }
  }

  private async fileOnDisk(instanceId: string, kind: ContentKind, fileName: string): Promise<boolean> {
    const file = join(paths.instanceGameDir(instanceId), KIND_DIR[kind] ?? 'mods', fileName)
    return (await exists(file)) || (await exists(`${file}.disabled`))
  }
}

/** Tolerant read of the persisted ProjectVersion JSON (never throws). */
function parseUpdateJson(json: string | null): { id: string; versionNumber: string } | null {
  if (!json) return null
  try {
    const v = JSON.parse(json) as ProjectVersion
    return v?.id ? { id: v.id, versionNumber: v.versionNumber ?? '' } : null
  } catch {
    return null
  }
}
