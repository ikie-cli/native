import { join } from 'node:path'
import type { VersionJson, AssetIndexFile, Library } from './mojang-types'
import { URLS, osArch, osName, paths } from '../paths'
import { getVersionJson, resolveVersionJson } from './manifest'
import { libraryApplies, mavenToPath, type RuleContext } from './rules'
import { DownloadTask, type DownloadItem } from './download'
import { io } from './io'
import { ensureDir, exists, readJson, writeJson } from '../utils/fsx'
import { fetchJson } from '../utils/http'

export function ruleCtx(): RuleContext {
  return { osName: osName(), osArch: osArch(), features: {} }
}

export interface PreparedVersion {
  json: VersionJson
  versionId: string
  clientJar: string
  classpath: string[]
  nativesDir: string
  assetsDir: string
  legacyAssetsDir: string | null
  log4jConfigPath: string | null
}

/** Natives classifier for this OS (legacy library format). */
export function nativeClassifier(lib: Library, ctx: RuleContext): string | null {
  if (!lib.natives) return null
  const key = lib.natives[ctx.osName]
  if (!key) return null
  return key.replace('${arch}', ctx.osArch === 'x86' ? '32' : '64')
}

export function libraryItems(
  libs: Library[],
  ctx: RuleContext,
  librariesDir: string
): { items: DownloadItem[]; classpath: string[]; natives: { item: DownloadItem; extract?: { exclude?: string[] } }[] } {
  const items: DownloadItem[] = []
  const classpath: string[] = []
  const natives: { item: DownloadItem; extract?: { exclude?: string[] } }[] = []
  const seenCp = new Set<string>()

  for (const lib of libs) {
    if (!libraryApplies(lib, ctx)) continue

    const artifact = lib.downloads?.artifact
    if (artifact) {
      const rel = artifact.path ?? mavenToPath(lib.name)
      const dest = join(librariesDir, rel)
      // Empty url (forge installer output) → file was placed by the installer;
      // keep it on the classpath but don't try to download it.
      if (artifact.url) {
        items.push({ url: artifact.url, dest, size: artifact.size, sha1: artifact.sha1 })
      }
      addCp(dest)
    } else if (lib.name && !lib.natives) {
      // Maven-style (fabric/quilt/legacy forge libs) — build URL from base.
      const rel = mavenToPath(lib.name)
      const base = (lib.url ?? 'https://libraries.minecraft.net/').replace(/\/?$/, '/')
      const dest = join(librariesDir, rel)
      items.push({ url: base + rel, dest })
      addCp(dest)
    }

    const classifier = nativeClassifier(lib, ctx)
    if (classifier) {
      const nat = lib.downloads?.classifiers?.[classifier]
      if (nat?.url) {
        const rel = nat.path ?? mavenToPath(`${lib.name}:${classifier}`)
        const dest = join(librariesDir, rel)
        natives.push({
          item: { url: nat.url, dest, size: nat.size, sha1: nat.sha1 },
          extract: lib.extract
        })
      }
    }
  }

  function addCp(p: string): void {
    if (!seenCp.has(p)) {
      seenCp.add(p)
      classpath.push(p)
    }
  }

  return { items, classpath, natives }
}

async function installAssets(json: VersionJson, task: DownloadTask, concurrency: number): Promise<{
  assetsDir: string
  legacyAssetsDir: string | null
}> {
  const assetsDir = paths.assets()
  if (!json.assetIndex) return { assetsDir, legacyAssetsDir: null }

  task.setPhase('assets')
  const indexDest = join(assetsDir, 'indexes', `${json.assetIndex.id}.json`)
  await task.run(
    [{ url: json.assetIndex.url, dest: indexDest, size: json.assetIndex.size, sha1: json.assetIndex.sha1 }],
    1
  )
  const index = await readJson<AssetIndexFile>(indexDest)
  const objects = Object.entries(index.objects ?? {})
  const items: DownloadItem[] = []
  const seen = new Set<string>()
  for (const [, obj] of objects) {
    const rel = `${obj.hash.slice(0, 2)}/${obj.hash}`
    if (seen.has(rel)) continue
    seen.add(rel)
    items.push({
      url: `${URLS.resources()}/${rel}`,
      dest: join(assetsDir, 'objects', rel),
      size: obj.size,
      sha1: obj.hash
    })
  }
  await task.run(items, concurrency)

  // Legacy/virtual assets need real file names.
  let legacyAssetsDir: string | null = null
  if (index.virtual || index.map_to_resources) {
    legacyAssetsDir = join(assetsDir, 'virtual', json.assetIndex.id)
    const { copyFile } = await import('node:fs/promises')
    for (const [name, obj] of objects) {
      const src = join(assetsDir, 'objects', obj.hash.slice(0, 2), obj.hash)
      const dest = join(legacyAssetsDir, name)
      if (!(await exists(dest))) {
        await ensureDir(join(dest, '..'))
        await copyFile(src, dest)
      }
    }
  }
  return { assetsDir, legacyAssetsDir }
}

/**
 * Install a fully-resolved version (vanilla or loader-merged):
 * client jar, libraries, natives (extracted), assets, log4j config.
 * Everything is checksum-verified and resumable; re-running validates fast.
 */
export async function installVersion(
  versionId: string,
  task: DownloadTask,
  concurrency: number
): Promise<PreparedVersion> {
  const ctx = ruleCtx()
  const json = await resolveVersionJson(versionId)
  const librariesDir = paths.libraries()

  // Vanilla client jar lives under the *vanilla* id (inheritsFrom chain root).
  const vanillaId = await rootVanillaId(versionId)
  const clientJar = join(paths.versionDir(vanillaId), `${vanillaId}.jar`)

  task.setPhase('client')
  if (json.downloads?.client?.url) {
    await task.run(
      [
        {
          url: json.downloads.client.url,
          dest: clientJar,
          size: json.downloads.client.size,
          sha1: json.downloads.client.sha1
        }
      ],
      2
    )
  } else if (!(await exists(clientJar))) {
    throw new Error(`No client download for version ${versionId}`)
  }

  task.setPhase('libraries')
  const { items, classpath, natives } = libraryItems(json.libraries ?? [], ctx, librariesDir)
  await task.run(items, concurrency)

  const nativesDir = paths.natives(versionId)
  if (natives.length > 0) {
    await task.run(
      natives.map((n) => n.item),
      concurrency
    )
    task.setPhase('natives')
    await ensureDir(nativesDir)
    for (const n of natives) {
      const exclude = n.extract?.exclude ?? ['META-INF/']
      await io.unzip(n.item.dest, nativesDir, exclude)
    }
  } else {
    await ensureDir(nativesDir)
  }

  const { assetsDir, legacyAssetsDir } = await installAssets(json, task, concurrency)

  let log4jConfigPath: string | null = null
  if (json.logging?.client?.file) {
    task.setPhase('logging')
    const f = json.logging.client.file
    log4jConfigPath = join(paths.assets(), 'log_configs', f.id)
    await task.run([{ url: f.url, dest: log4jConfigPath, size: f.size, sha1: f.sha1 }], 2)
  }

  // classpath: libraries then client jar last
  const cp = [...classpath, clientJar]

  return {
    json,
    versionId,
    clientJar,
    classpath: cp,
    nativesDir,
    assetsDir,
    legacyAssetsDir,
    log4jConfigPath
  }
}

/** Follow the inheritsFrom chain down to the vanilla root id. */
export async function rootVanillaId(versionId: string): Promise<string> {
  let id = versionId
  for (let depth = 0; depth < 6; depth++) {
    const file = join(paths.versionDir(id), `${id}.json`)
    if (!(await exists(file))) return id
    const json = await readJson<VersionJson>(file)
    if (!json.inheritsFrom) return id
    id = json.inheritsFrom
  }
  return id
}

/**
 * Quick validation for pre-launch: verify client jar + all library files exist
 * (hash check offloaded to the io worker). Returns missing/corrupt paths.
 */
export async function validateFiles(versionId: string): Promise<string[]> {
  const ctx = ruleCtx()
  const json = await resolveVersionJson(versionId)
  const { items } = libraryItems(json.libraries ?? [], ctx, paths.libraries())
  const vanillaId = await rootVanillaId(versionId)
  const clientJar = join(paths.versionDir(vanillaId), `${vanillaId}.jar`)
  const wanted: { path: string; sha1?: string }[] = [
    { path: clientJar, sha1: json.downloads?.client?.sha1 },
    ...items.map((i) => ({ path: i.dest, sha1: i.sha1 }))
  ]
  const missing: string[] = []
  const toHash: string[] = []
  const hashByPath = new Map<string, string>()
  for (const w of wanted) {
    if (!(await exists(w.path))) {
      missing.push(w.path)
    } else if (w.sha1) {
      toHash.push(w.path)
      hashByPath.set(w.path, w.sha1)
    }
  }
  if (toHash.length > 0) {
    const hashes = await io.sha1Batch(toHash)
    for (const [p, got] of Object.entries(hashes)) {
      if (!got || got.toLowerCase() !== hashByPath.get(p)!.toLowerCase()) missing.push(p)
    }
  }
  return missing
}

/** Make sure the vanilla version json exists locally (used before loader installs). */
export async function ensureVanillaJson(mcVersion: string): Promise<VersionJson> {
  return await getVersionJson(mcVersion)
}

export async function writeVersionJson(id: string, json: VersionJson): Promise<void> {
  await writeJson(join(paths.versionDir(id), `${id}.json`), json)
}

export async function fetchJsonCached<T>(url: string, cacheName: string, ttlMs: number): Promise<T> {
  const file = join(paths.cache(), cacheName)
  try {
    const data = await fetchJson<T>(url)
    await writeJson(file, { at: Date.now(), data })
    return data
  } catch (err) {
    if (await exists(file)) {
      const cached = await readJson<{ at: number; data: T }>(file)
      if (Date.now() - cached.at < ttlMs) return cached.data
    }
    throw err
  }
}
