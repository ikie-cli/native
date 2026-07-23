import { app } from 'electron'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'

/**
 * All filesystem locations + remote endpoints.
 * Every endpoint is overridable via env so tests can run against a local
 * fixture server, and so mirrors/proxies can be configured later.
 */

function env(name: string, fallback: string): string {
  const v = process.env[name]
  return v && v.length > 0 ? v : fallback
}

export const URLS = {
  versionManifest: () =>
    env(
      'NATIVE_URL_VERSION_MANIFEST',
      'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'
    ),
  /** asset objects host; final URL is `${resources}/<2-hash-chars>/<hash>` */
  resources: () => env('NATIVE_URL_RESOURCES', 'https://resources.download.minecraft.net'),
  fabricMeta: () => env('NATIVE_URL_FABRIC_META', 'https://meta.fabricmc.net'),
  quiltMeta: () => env('NATIVE_URL_QUILT_META', 'https://meta.quiltmc.org'),
  forgeMaven: () => env('NATIVE_URL_FORGE_MAVEN', 'https://maven.minecraftforge.net'),
  neoforgeMaven: () => env('NATIVE_URL_NEOFORGE_MAVEN', 'https://maven.neoforged.net/releases'),
  adoptium: () => env('NATIVE_URL_ADOPTIUM', 'https://api.adoptium.net'),
  modrinth: () => env('NATIVE_URL_MODRINTH', 'https://api.modrinth.com'),
  curseforge: () => env('NATIVE_URL_CURSEFORGE', 'https://api.curseforge.com'),
  launcherContent: () => env('NATIVE_URL_LAUNCHER_CONTENT', 'https://launchercontent.mojang.com'),
  msaDeviceCode: () =>
    env(
      'NATIVE_URL_MSA_DEVICECODE',
      'https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode'
    ),
  msaToken: () =>
    env('NATIVE_URL_MSA_TOKEN', 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token'),
  xblAuth: () => env('NATIVE_URL_XBL', 'https://user.auth.xboxlive.com/user/authenticate'),
  xstsAuth: () => env('NATIVE_URL_XSTS', 'https://xsts.auth.xboxlive.com/xsts/authorize'),
  mcServices: () => env('NATIVE_URL_MC_SERVICES', 'https://api.minecraftservices.com'),
  ranked: () => env('NATIVE_URL_RANKED', 'https://api.nativelaunch.xyz')
}

/** Root data dir; overridable for tests (NATIVE_DATA_DIR). */
export function dataRoot(): string {
  return env('NATIVE_DATA_DIR', join(app.getPath('appData'), 'NativeLauncher'))
}

export const paths = {
  root: () => dataRoot(),
  db: () => join(dataRoot(), 'native.db'),
  instances: () => join(dataRoot(), 'instances'),
  instance: (id: string) => join(dataRoot(), 'instances', id),
  instanceGameDir: (id: string) => join(dataRoot(), 'instances', id, 'minecraft'),
  /** Per-instance saved launch logs (one file per session). */
  instanceLogsDir: (id: string) => join(dataRoot(), 'instances', id, 'logs'),
  libraries: () => join(dataRoot(), 'libraries'),
  assets: () => join(dataRoot(), 'assets'),
  versions: () => join(dataRoot(), 'versions'),
  versionDir: (id: string) => join(dataRoot(), 'versions', id),
  natives: (versionId: string) => join(dataRoot(), 'natives', versionId),
  java: () => join(dataRoot(), 'java'),
  javaMajor: (major: number) => join(dataRoot(), 'java', String(major)),
  cache: () => join(dataRoot(), 'cache'),
  icons: () => join(dataRoot(), 'icons'),
  backups: () => join(dataRoot(), 'backups'),
  logs: () => join(dataRoot(), 'logs'),
  rankedDeviceId: () => join(dataRoot(), 'ranked-device-id')
}

export function ensureDirs(): void {
  for (const dir of [
    paths.root(),
    paths.instances(),
    paths.libraries(),
    paths.assets(),
    paths.versions(),
    paths.java(),
    paths.cache(),
    paths.icons(),
    paths.backups(),
    paths.logs()
  ]) {
    mkdirSync(dir, { recursive: true })
  }
}

export type OsName = 'windows' | 'linux' | 'osx'

export function osName(): OsName {
  switch (process.platform) {
    case 'win32':
      return 'windows'
    case 'darwin':
      return 'osx'
    default:
      return 'linux'
  }
}

export function osArch(): 'x64' | 'arm64' | 'x86' {
  const a = process.arch
  if (a === 'arm64') return 'arm64'
  if (a === 'ia32') return 'x86'
  return 'x64'
}
