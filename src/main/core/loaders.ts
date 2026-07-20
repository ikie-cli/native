import { spawn } from 'node:child_process'
import { readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { LoaderKind } from '@shared/types'
import type { VersionJson } from './mojang-types'
import { URLS, paths } from '../paths'
import { fetchJson, fetchText } from '../utils/http'
import { ensureDir, exists } from '../utils/fsx'
import { ensureVanillaJson, writeVersionJson } from './install'
import { DownloadTask } from './download'
import { ensureJava, guessJavaMajor } from './java'
import { getVersionJson } from './manifest'
import { log } from '../logger'

export interface LoaderVersionInfo {
  version: string
  stable: boolean
}

/** ---------- version lists ---------- */

export async function listLoaderVersions(
  loader: LoaderKind,
  mcVersion: string
): Promise<LoaderVersionInfo[]> {
  switch (loader) {
    case 'vanilla':
      return []
    case 'fabric': {
      const list = await fetchJson<{ loader: { version: string; stable: boolean } }[]>(
        `${URLS.fabricMeta()}/v2/versions/loader/${encodeURIComponent(mcVersion)}`
      )
      return list.map((e) => ({ version: e.loader.version, stable: e.loader.stable }))
    }
    case 'quilt': {
      const list = await fetchJson<{ loader: { version: string } }[]>(
        `${URLS.quiltMeta()}/v3/versions/loader/${encodeURIComponent(mcVersion)}`
      )
      return list.map((e) => ({
        version: e.loader.version,
        stable: !/beta|pre|rc/i.test(e.loader.version)
      }))
    }
    case 'forge': {
      const xml = await fetchText(
        `${URLS.forgeMaven()}/net/minecraftforge/forge/maven-metadata.xml`
      )
      const versions = [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map((m) => m[1])
      return versions
        .filter((v) => v.startsWith(`${mcVersion}-`))
        .map((v) => ({ version: v.slice(mcVersion.length + 1), stable: true }))
        .reverse()
    }
    case 'neoforge': {
      const artifact = neoforgeArtifact(mcVersion)
      const xml = await fetchText(`${URLS.neoforgeMaven()}/${artifact.path}/maven-metadata.xml`)
      const versions = [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map((m) => m[1])
      return versions
        .filter((v) => artifact.match(v))
        .map((v) => ({ version: v, stable: !v.includes('beta') }))
        .reverse()
    }
  }
}

/** NeoForge artifact mapping: 1.20.1 uses the legacy `forge` artifact. */
function neoforgeArtifact(mcVersion: string): {
  path: string
  match: (v: string) => boolean
  installerUrl: (v: string) => string
} {
  if (mcVersion === '1.20.1') {
    return {
      path: 'net/neoforged/forge',
      match: (v) => v.startsWith('1.20.1-'),
      installerUrl: (v) =>
        `${URLS.neoforgeMaven()}/net/neoforged/forge/${v}/forge-${v}-installer.jar`
    }
  }
  // 1.21.4 → "21.4.", 1.21 → "21.0."
  const m = mcVersion.match(/^1\.(\d+)(?:\.(\d+))?/)
  const prefix = m ? `${m[1]}.${m[2] ?? '0'}.` : ''
  return {
    path: 'net/neoforged/neoforge',
    match: (v) => v.startsWith(prefix),
    installerUrl: (v) =>
      `${URLS.neoforgeMaven()}/net/neoforged/neoforge/${v}/neoforge-${v}-installer.jar`
  }
}

export async function pickLoaderVersion(
  loader: LoaderKind,
  mcVersion: string,
  requested: string | null | undefined
): Promise<string | null> {
  if (loader === 'vanilla') return null
  const all = await listLoaderVersions(loader, mcVersion)
  if (all.length === 0) throw new Error(`No ${loader} versions available for Minecraft ${mcVersion}`)
  if (requested && requested !== 'stable' && requested !== 'latest') {
    const hit = all.find((v) => v.version === requested)
    if (!hit) throw new Error(`${loader} ${requested} is not available for Minecraft ${mcVersion}`)
    return hit.version
  }
  if (requested === 'latest') return all[0].version
  return (all.find((v) => v.stable) ?? all[0]).version
}

/** ---------- installs ---------- */

/**
 * Install the requested loader for a vanilla version.
 * Returns the launchable version id (vanilla id when loader === vanilla).
 */
export async function installLoader(
  loader: LoaderKind,
  mcVersion: string,
  loaderVersion: string | null,
  task: DownloadTask
): Promise<string> {
  await ensureVanillaJson(mcVersion)
  switch (loader) {
    case 'vanilla':
      return mcVersion
    case 'fabric':
      return await installMetaProfile(
        `${URLS.fabricMeta()}/v2/versions/loader/${encodeURIComponent(mcVersion)}/${encodeURIComponent(loaderVersion!)}/profile/json`
      )
    case 'quilt':
      return await installMetaProfile(
        `${URLS.quiltMeta()}/v3/versions/loader/${encodeURIComponent(mcVersion)}/${encodeURIComponent(loaderVersion!)}/profile/json`
      )
    case 'forge': {
      const url = `${URLS.forgeMaven()}/net/minecraftforge/forge/${mcVersion}-${loaderVersion}/forge-${mcVersion}-${loaderVersion}-installer.jar`
      return await runInstallerJar(url, mcVersion, `forge-${mcVersion}-${loaderVersion}`, task)
    }
    case 'neoforge': {
      const artifact = neoforgeArtifact(mcVersion)
      const url = artifact.installerUrl(loaderVersion!)
      return await runInstallerJar(url, mcVersion, `neoforge-${loaderVersion}`, task)
    }
  }
}

/** Fabric/Quilt: fetch the profile json and store it. */
async function installMetaProfile(url: string): Promise<string> {
  const profile = await fetchJson<VersionJson>(url)
  if (!profile.id || !profile.mainClass) throw new Error('Malformed loader profile')
  await writeVersionJson(profile.id, profile)
  return profile.id
}

/**
 * Forge/NeoForge: download the official installer jar and run it headlessly
 * (`--installClient <root>`), then locate the version json it produced.
 */
async function runInstallerJar(
  installerUrl: string,
  mcVersion: string,
  cacheKey: string,
  task: DownloadTask
): Promise<string> {
  const root = paths.root()
  const installerPath = join(paths.cache(), `${cacheKey}-installer.jar`)

  task.setPhase('loader')
  await task.run([{ url: installerUrl, dest: installerPath }], 2)

  // The installer expects a launcher root with a profiles file + versions dir.
  await ensureDir(paths.versions())
  await ensureDir(paths.libraries())
  const profilesFile = join(root, 'launcher_profiles.json')
  if (!(await exists(profilesFile))) {
    await writeFile(profilesFile, JSON.stringify({ profiles: {}, settings: {}, version: 3 }))
  }

  // Installer needs a Java runtime; match the game's requirement.
  const vjson = await getVersionJson(mcVersion)
  const major = vjson.javaVersion?.majorVersion ?? guessJavaMajor(mcVersion)
  const java = await ensureJava(major, process.env.NATIVE_JAVA_BIN ?? null, task)

  const before = await listVersionDirs()
  task.setPhase('loader-install')
  log.info(`Running loader installer: ${installerPath}`)
  await execInstaller(java, installerPath, root)
  const after = await listVersionDirs()

  const created = after.filter((d) => !before.includes(d))
  const candidate =
    created.find((d) => /forge/i.test(d)) ??
    created[0] ??
    after.find((d) => /forge/i.test(d) && d.includes(mcVersion))
  if (!candidate) {
    throw new Error('Loader installer finished but no version was produced')
  }
  return candidate
}

async function listVersionDirs(): Promise<string[]> {
  try {
    const entries = await readdir(paths.versions(), { withFileTypes: true })
    const out: string[] = []
    for (const e of entries) {
      if (e.isDirectory() && (await exists(join(paths.versions(), e.name, `${e.name}.json`)))) {
        out.push(e.name)
      }
    }
    return out
  } catch {
    return []
  }
}

function execInstaller(java: string, jar: string, root: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(java, ['-jar', jar, '--installClient', root], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let tail = ''
    const keep = (d: Buffer): void => {
      tail = (tail + d.toString()).slice(-4000)
    }
    child.stdout.on('data', keep)
    child.stderr.on('data', keep)
    const timer = setTimeout(
      () => {
        child.kill()
        reject(new Error('Loader installer timed out after 15 minutes'))
      },
      15 * 60 * 1000
    )
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else {
        log.error(`Installer failed (${code}):\n${tail}`)
        reject(
          new Error(
            `Loader installer exited with code ${code}. This Minecraft version may need a manual install. Last output:\n${tail.slice(-600)}`
          )
        )
      }
    })
  })
}
