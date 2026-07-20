import { spawn } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { JavaInstall } from '@shared/types'
import { URLS, osArch, osName, paths } from '../paths'
import { fetchJson } from '../utils/http'
import { exists, makeExecutable, removePath } from '../utils/fsx'
import { DownloadTask } from './download'
import { io } from './io'
import { log } from '../logger'

const JAVA_BIN = process.platform === 'win32' ? 'java.exe' : 'java'

/** Run `java -version` and parse the major version. */
export function probeJava(javaPath: string): Promise<JavaInstall | null> {
  return new Promise((resolve) => {
    let out = ''
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(javaPath, ['-version'], { stdio: ['ignore', 'pipe', 'pipe'] })
    } catch {
      resolve(null)
      return
    }
    const timer = setTimeout(() => {
      child.kill()
      resolve(null)
    }, 10_000)
    child.stdout?.on('data', (d) => (out += d))
    child.stderr?.on('data', (d) => (out += d))
    child.on('error', () => {
      clearTimeout(timer)
      resolve(null)
    })
    child.on('close', () => {
      clearTimeout(timer)
      const parsed = parseJavaVersion(out)
      if (!parsed) return resolve(null)
      resolve({
        path: javaPath,
        version: parsed.version,
        major: parsed.major,
        arch: out.includes('64-Bit') ? '64' : 'unknown',
        source: 'system'
      })
    })
  })
}

export function parseJavaVersion(output: string): { version: string; major: number } | null {
  const m = output.match(/version "([^"]+)"/)
  if (!m) return null
  const version = m[1]
  const major = version.startsWith('1.') ? parseInt(version.split('.')[1], 10) : parseInt(version.split('.')[0], 10)
  if (!Number.isFinite(major)) return null
  return { version, major }
}

/** Candidate locations per OS + managed runtimes + PATH/JAVA_HOME. */
async function candidatePaths(): Promise<string[]> {
  const out = new Set<string>()
  if (process.env.NATIVE_JAVA_BIN) out.add(process.env.NATIVE_JAVA_BIN)
  if (process.env.JAVA_HOME) out.add(join(process.env.JAVA_HOME, 'bin', JAVA_BIN))
  out.add(JAVA_BIN) // PATH
  const roots =
    process.platform === 'win32'
      ? [
          'C:\\Program Files\\Java',
          'C:\\Program Files\\Eclipse Adoptium',
          'C:\\Program Files\\Microsoft\\jdk',
          'C:\\Program Files (x86)\\Java'
        ]
      : process.platform === 'darwin'
        ? ['/Library/Java/JavaVirtualMachines']
        : ['/usr/lib/jvm']
  for (const root of roots) {
    try {
      for (const entry of await readdir(root)) {
        const base = join(root, entry)
        const mac = join(base, 'Contents', 'Home', 'bin', JAVA_BIN)
        const plain = join(base, 'bin', JAVA_BIN)
        if (await exists(mac)) out.add(mac)
        else if (await exists(plain)) out.add(plain)
      }
    } catch {
      /* root missing */
    }
  }
  // Managed runtimes we downloaded.
  try {
    for (const major of await readdir(paths.java())) {
      const found = await findJavaBin(paths.javaMajor(Number(major)))
      if (found) out.add(found)
    }
  } catch {
    /* none yet */
  }
  return [...out]
}

async function findJavaBin(root: string): Promise<string | null> {
  const direct = join(root, 'bin', JAVA_BIN)
  if (await exists(direct)) return direct
  try {
    for (const entry of await readdir(root)) {
      for (const sub of [
        join(root, entry, 'bin', JAVA_BIN),
        join(root, entry, 'Contents', 'Home', 'bin', JAVA_BIN)
      ]) {
        if (await exists(sub)) return sub
      }
    }
  } catch {
    /* ignore */
  }
  return null
}

export async function detectJavas(): Promise<JavaInstall[]> {
  const seen = new Map<string, JavaInstall>()
  const results = await Promise.all((await candidatePaths()).map((p) => probeJava(p)))
  for (const r of results) {
    if (r && !seen.has(`${r.path}`)) {
      const managed = r.path.startsWith(paths.java())
      seen.set(r.path, { ...r, source: managed ? 'managed' : 'system' })
    }
  }
  return [...seen.values()].sort((a, b) => b.major - a.major)
}

/** Find an installed Java matching the required major (exact preferred, then higher). */
export async function findJavaForMajor(major: number): Promise<JavaInstall | null> {
  const all = await detectJavas()
  return (
    all.find((j) => j.major === major) ??
    all.filter((j) => j.major > major).sort((a, b) => a.major - b.major)[0] ??
    null
  )
}

interface AdoptiumAsset {
  binary: {
    package: { link: string; size: number; checksum: string }
    image_type: string
  }
  version: { semver: string }
}

/** Download a JRE for `major` from Adoptium into the managed java dir. */
export async function downloadJava(major: number, task: DownloadTask): Promise<JavaInstall> {
  const os = osName() === 'osx' ? 'mac' : osName()
  const arch = osArch() === 'arm64' ? 'aarch64' : osArch() === 'x86' ? 'x86' : 'x64'
  const api = `${URLS.adoptium()}/v3/assets/latest/${major}/hotspot?architecture=${arch}&image_type=jre&os=${os}&vendor=eclipse`
  const assets = await fetchJson<AdoptiumAsset[]>(api)
  const asset = assets.find((a) => a.binary?.package?.link)
  if (!asset) throw new Error(`No Java ${major} runtime available for ${os}/${arch}`)

  const url = asset.binary.package.link
  const isZip = url.endsWith('.zip')
  const dest = join(paths.cache(), `java-${major}${isZip ? '.zip' : '.tar.gz'}`)
  task.setPhase('java')
  await task.run([{ url, dest, size: asset.binary.package.size }], 4)

  const target = paths.javaMajor(major)
  await removePath(target)
  if (isZip) await io.unzip(dest, target)
  else await io.untar(dest, target)
  await removePath(dest)

  const bin = await findJavaBin(target)
  if (!bin) throw new Error('Downloaded Java archive did not contain a java binary')
  await makeExecutable(bin)
  const probed = await probeJava(bin)
  if (!probed) throw new Error('Downloaded Java failed to run')
  log.info(`Installed managed Java ${probed.version} at ${bin}`)
  return { ...probed, source: 'managed' }
}

/**
 * Ensure a Java for the needed major exists: override → installed match → download.
 */
export async function ensureJava(
  majorNeeded: number,
  override: string | null,
  task: DownloadTask
): Promise<string> {
  if (override) {
    const probed = await probeJava(override)
    if (!probed) throw new Error(`Configured Java is not runnable: ${override}`)
    if (probed.major < majorNeeded) {
      throw new Error(
        `Configured Java is version ${probed.major}, but this Minecraft version needs ${majorNeeded}+`
      )
    }
    return override
  }
  const found = await findJavaForMajor(majorNeeded)
  if (found) return found.path
  const dl = await downloadJava(majorNeeded, task)
  return dl.path
}

/** Fallback heuristic when a version json lacks javaVersion. */
export function guessJavaMajor(mcVersion: string): number {
  const m = mcVersion.match(/^1\.(\d+)(?:\.(\d+))?/)
  if (!m) return 21
  const minor = parseInt(m[1], 10)
  const patch = m[2] ? parseInt(m[2], 10) : 0
  if (minor <= 16) return 8
  if (minor === 17) return 17
  if (minor <= 19) return 17
  if (minor === 20 && patch <= 4) return 17
  return 21
}
