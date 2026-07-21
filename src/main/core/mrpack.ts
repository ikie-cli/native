import type { LoaderKind } from '@shared/types'

/**
 * Modrinth modpack (`.mrpack`) index parsing — pure, so it unit-tests without
 * Electron. The archive layout is: `modrinth.index.json` + `overrides/`
 * (+ `client-overrides/`) copied into the instance, plus a `files` list of
 * downloads with sha1 hashes and instance-relative destination paths.
 * Spec: https://support.modrinth.com/en/articles/8802351-modrinth-modpack-format-mrpack
 */

export interface MrpackFileEntry {
  /** instance-relative destination, forward slashes, validated safe */
  path: string
  sha1: string | null
  size: number
  urls: string[]
}

export interface MrpackIndex {
  name: string
  packVersion: string
  summary: string | null
  mcVersion: string
  loader: LoaderKind
  loaderVersion: string | null
  files: MrpackFileEntry[]
  /** entries skipped because the pack marks them server-only */
  serverOnlyCount: number
}

/** dependency key in the index → launcher loader kind (checked in this order) */
const LOADER_DEPS: [key: string, loader: LoaderKind][] = [
  ['fabric-loader', 'fabric'],
  ['quilt-loader', 'quilt'],
  ['neoforge', 'neoforge'],
  ['forge', 'forge']
]

/**
 * True when `p` is a safe instance-relative path: no absolute paths, drive
 * prefixes, or `..`/`.` segments. Backslashes are treated as separators
 * (some Windows-authored packs use them) before validation.
 */
export function safePackPath(p: unknown): p is string {
  if (typeof p !== 'string' || p.length === 0) return false
  const norm = p.replace(/\\/g, '/')
  if (norm.startsWith('/') || /^[a-zA-Z]:/.test(norm)) return false
  return norm.split('/').every((seg) => seg.length > 0 && seg !== '.' && seg !== '..')
}

/** Normalize a pack path to forward slashes (callers re-join per-OS). */
export function packPathSegments(p: string): string[] {
  return p.replace(/\\/g, '/').split('/')
}

export function parseMrpackIndex(text: string): MrpackIndex {
  let raw: {
    formatVersion?: unknown
    game?: unknown
    name?: unknown
    versionId?: unknown
    summary?: unknown
    dependencies?: Record<string, unknown>
    files?: unknown
  }
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('modrinth.index.json is not valid JSON')
  }
  if (raw?.formatVersion !== 1) {
    throw new Error(`Unsupported modpack format (formatVersion ${String(raw?.formatVersion)})`)
  }
  if (raw.game !== 'minecraft') {
    throw new Error(`This pack is for "${String(raw.game)}", not Minecraft`)
  }
  const deps = raw.dependencies ?? {}
  const mcVersion = deps['minecraft']
  if (typeof mcVersion !== 'string' || !mcVersion) {
    throw new Error('Modpack is missing its Minecraft version')
  }
  let loader: LoaderKind = 'vanilla'
  let loaderVersion: string | null = null
  for (const [key, kind] of LOADER_DEPS) {
    const v = deps[key]
    if (typeof v === 'string' && v) {
      loader = kind
      loaderVersion = v
      break
    }
  }

  const files: MrpackFileEntry[] = []
  let serverOnlyCount = 0
  for (const f of Array.isArray(raw.files) ? raw.files : []) {
    const entry = f as {
      path?: unknown
      hashes?: { sha1?: unknown }
      env?: { client?: unknown }
      downloads?: unknown
      fileSize?: unknown
    }
    if (entry?.env?.client === 'unsupported') {
      serverOnlyCount++
      continue
    }
    if (!safePackPath(entry?.path)) {
      throw new Error(`Modpack contains an unsafe file path: ${String(entry?.path)}`)
    }
    const urls = (Array.isArray(entry.downloads) ? entry.downloads : []).filter(
      (u): u is string => typeof u === 'string' && /^https?:\/\//.test(u)
    )
    if (urls.length === 0) {
      throw new Error(`Modpack file has no download URL: ${entry.path}`)
    }
    files.push({
      path: entry.path,
      sha1: typeof entry.hashes?.sha1 === 'string' ? entry.hashes.sha1 : null,
      size: typeof entry.fileSize === 'number' ? entry.fileSize : 0,
      urls
    })
  }

  return {
    name: typeof raw.name === 'string' && raw.name ? raw.name : 'Modpack',
    packVersion: typeof raw.versionId === 'string' ? raw.versionId : '',
    summary: typeof raw.summary === 'string' ? raw.summary : null,
    mcVersion,
    loader,
    loaderVersion,
    files,
    serverOnlyCount
  }
}
