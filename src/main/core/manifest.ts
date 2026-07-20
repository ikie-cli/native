import { join } from 'node:path'
import type { VersionManifest } from '@shared/types'
import type { VersionJson } from './mojang-types'
import { URLS, paths } from '../paths'
import { fetchJson } from '../utils/http'
import { exists, readJson, writeJson } from '../utils/fsx'

interface RawManifest {
  latest: { release: string; snapshot: string }
  versions: {
    id: string
    type: string
    url: string
    sha1?: string
    releaseTime: string
  }[]
}

let memManifest: { at: number; data: RawManifest } | null = null
const MANIFEST_TTL = 5 * 60 * 1000

export async function getRawManifest(force = false): Promise<RawManifest> {
  if (!force && memManifest && Date.now() - memManifest.at < MANIFEST_TTL) return memManifest.data
  const cacheFile = join(paths.cache(), 'version_manifest_v2.json')
  try {
    const data = await fetchJson<RawManifest>(URLS.versionManifest(), { timeoutMs: 15_000 })
    parseManifest(data) // validate before caching
    memManifest = { at: Date.now(), data }
    await writeJson(cacheFile, data)
    return data
  } catch (err) {
    if (await exists(cacheFile)) {
      const data = await readJson<RawManifest>(cacheFile)
      memManifest = { at: Date.now(), data }
      return data
    }
    throw err
  }
}

/** Validate + trim the raw manifest into the shared shape. */
export function parseManifest(raw: RawManifest): VersionManifest {
  if (!raw || !Array.isArray(raw.versions) || !raw.latest?.release) {
    throw new Error('Malformed version manifest')
  }
  return {
    latest: { release: raw.latest.release, snapshot: raw.latest.snapshot },
    versions: raw.versions.map((v) => {
      if (!v.id || !v.type) throw new Error('Malformed manifest entry')
      return {
        id: v.id,
        type: (['release', 'snapshot', 'old_beta', 'old_alpha'].includes(v.type)
          ? v.type
          : 'snapshot') as VersionManifest['versions'][number]['type'],
        releaseTime: v.releaseTime
      }
    })
  }
}

export async function getManifest(force = false): Promise<VersionManifest> {
  return parseManifest(await getRawManifest(force))
}

/** Fetch (or read cached) version JSON for a vanilla version id. */
export async function getVersionJson(id: string): Promise<VersionJson> {
  const file = join(paths.versionDir(id), `${id}.json`)
  if (await exists(file)) return await readJson<VersionJson>(file)
  const raw = await getRawManifest()
  const entry = raw.versions.find((v) => v.id === id)
  if (!entry) throw new Error(`Unknown Minecraft version: ${id}`)
  const json = await fetchJson<VersionJson>(entry.url)
  await writeJson(file, json)
  return json
}

/** Read a locally installed (possibly loader) version JSON. */
export async function getLocalVersionJson(id: string): Promise<VersionJson | null> {
  const file = join(paths.versionDir(id), `${id}.json`)
  if (!(await exists(file))) return null
  return await readJson<VersionJson>(file)
}

/**
 * Resolve inheritance chains (loader jsons `inheritsFrom` vanilla).
 * Child values win; libraries are child-first concatenated; arguments append.
 */
export function mergeVersionJson(parent: VersionJson, child: VersionJson): VersionJson {
  return {
    ...parent,
    ...child,
    inheritsFrom: undefined,
    mainClass: child.mainClass || parent.mainClass,
    assetIndex: child.assetIndex ?? parent.assetIndex,
    assets: child.assets ?? parent.assets,
    javaVersion: child.javaVersion ?? parent.javaVersion,
    downloads: child.downloads ?? parent.downloads,
    logging: child.logging ?? parent.logging,
    minecraftArguments: child.minecraftArguments ?? parent.minecraftArguments,
    arguments:
      parent.arguments || child.arguments
        ? {
            game: [...(parent.arguments?.game ?? []), ...(child.arguments?.game ?? [])],
            jvm: [...(parent.arguments?.jvm ?? []), ...(child.arguments?.jvm ?? [])]
          }
        : undefined,
    libraries: [...(child.libraries ?? []), ...(parent.libraries ?? [])]
  }
}

/** Load a version json resolving `inheritsFrom` recursively (local first, then remote vanilla). */
export async function resolveVersionJson(id: string): Promise<VersionJson> {
  const local = await getLocalVersionJson(id)
  const json = local ?? (await getVersionJson(id))
  if (!json.inheritsFrom) return json
  const parent = await resolveVersionJson(json.inheritsFrom)
  return mergeVersionJson(parent, json)
}
