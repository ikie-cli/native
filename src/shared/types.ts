/** Cross-process domain types. Keep this file dependency-free. */

export type LoaderKind = 'vanilla' | 'fabric' | 'quilt' | 'forge' | 'neoforge'

export const LOADER_LABELS: Record<LoaderKind, string> = {
  vanilla: 'Vanilla',
  fabric: 'Fabric',
  quilt: 'Quilt',
  forge: 'Forge',
  neoforge: 'NeoForge'
}

export interface InstanceConfig {
  id: string
  name: string
  /** built-in icon key (`builtin:<name>`) or absolute image path */
  icon: string | null
  mcVersion: string
  loader: LoaderKind
  loaderVersion: string | null
  /** per-instance Java override; null = auto-match */
  javaPath: string | null
  /** MB */
  memMin: number
  memMax: number
  /** extra JVM args appended after memory flags */
  jvmArgs: string
  gameWidth: number | null
  gameHeight: number | null
  fullscreen: boolean
  group: string | null
  createdAt: number
  lastPlayedAt: number | null
  totalPlayMs: number
  /** true once install finished & validated */
  installed: boolean
  notes: string
}

export type InstanceCreate = Pick<InstanceConfig, 'name' | 'mcVersion' | 'loader'> &
  Partial<
    Pick<
      InstanceConfig,
      | 'icon'
      | 'loaderVersion'
      | 'memMin'
      | 'memMax'
      | 'jvmArgs'
      | 'gameWidth'
      | 'gameHeight'
      | 'fullscreen'
      | 'group'
      | 'notes'
    >
  >

export interface AccountInfo {
  /** minecraft profile uuid (offline: derived) */
  id: string
  type: 'msa' | 'offline'
  username: string
  uuid: string
  active: boolean
  addedAt: number
}

export interface DeviceCodeInfo {
  userCode: string
  verificationUri: string
  expiresIn: number
  interval: number
}

export type AuthFlowState =
  | { step: 'idle' }
  /** the Microsoft sign-in window is open */
  | { step: 'browser' }
  | { step: 'minecraft' }
  | { step: 'profile' }
  | { step: 'done'; account: AccountInfo }
  | { step: 'error'; error: string }

export interface VersionSummary {
  id: string
  type: 'release' | 'snapshot' | 'old_beta' | 'old_alpha'
  releaseTime: string
}

export interface VersionManifest {
  latest: { release: string; snapshot: string }
  versions: VersionSummary[]
}

export interface DownloadTaskProgress {
  id: string
  label: string
  phase: string
  totalBytes: number
  doneBytes: number
  totalFiles: number
  doneFiles: number
  speedBps: number
  etaSec: number
  state: 'running' | 'done' | 'error' | 'cancelled'
  error?: string
}

export interface RunningGame {
  instanceId: string
  pid: number
  startedAt: number
}

export type LogLevel = 'info' | 'warn' | 'error' | 'debug'
export interface LogLine {
  t: number
  level: LogLevel
  text: string
}

export interface CrashInfo {
  instanceId: string
  exitCode: number | null
  reportPath: string | null
  report: string | null
  lastLog: string
  at: number
}

export interface ServerEntry {
  id: string
  name: string
  address: string
  /** preferred instance to join with */
  instanceId: string | null
  addedAt: number
  sortIndex: number
}

export interface ServerStatus {
  online: boolean
  latencyMs: number | null
  motd: string | null
  players: { online: number; max: number } | null
  version: string | null
  favicon: string | null
  error?: string
}

export interface NewsItem {
  id: string
  title: string
  category: string
  date: string
  image: string | null
  url: string
  text: string
}

export interface JavaInstall {
  path: string
  version: string
  major: number
  arch: string
  source: 'system' | 'managed' | 'custom'
}

export interface WorldInfo {
  folder: string
  name: string
  sizeBytes: number
  lastPlayed: number
  icon: string | null
}

export interface ScreenshotInfo {
  name: string
  path: string
  sizeBytes: number
  mtime: number
}

export type ContentKind = 'mod' | 'resourcepack' | 'shaderpack'

export interface LocalContentFile {
  fileName: string
  kind: ContentKind
  enabled: boolean
  sizeBytes: number
  mtime: number
  meta: {
    name?: string
    version?: string
    description?: string
    projectId?: string | null
  } | null
}

export type ProjectType = 'mod' | 'modpack' | 'resourcepack' | 'shader' | 'datapack'

export interface SearchHit {
  projectId: string
  slug: string
  platform: 'modrinth' | 'curseforge'
  type: ProjectType
  title: string
  author: string
  description: string
  icon: string | null
  downloads: number
  follows: number
  updated: string
  categories: string[]
}

export interface SearchResult {
  hits: SearchHit[]
  total: number
  offset: number
  limit: number
}

export interface ProjectVersion {
  id: string
  projectId: string
  name: string
  versionNumber: string
  gameVersions: string[]
  loaders: string[]
  datePublished: string
  downloads: number
  fileName: string
  fileSize: number
  sha1: string | null
  url: string
  dependencies: { projectId: string; kind: 'required' | 'optional' | 'incompatible' | 'embedded' }[]
}

export interface AppSettings {
  theme: 'mono' | 'mono-light' | 'dark' | 'light' | 'oled' | 'system'
  language: string
  defaultMemMin: number
  defaultMemMax: number
  defaultWidth: number | null
  defaultHeight: number | null
  javaPathOverride: string | null
  launchBehavior: 'keep-open' | 'minimize' | 'close'
  concurrentDownloads: number
  msaClientId: string | null
  curseforgeApiKey: string | null
  autoUpdateCheck: boolean
  autoUpdateDownload: boolean
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'mono',
  language: 'en',
  defaultMemMin: 512,
  defaultMemMax: 4096,
  defaultWidth: 854,
  defaultHeight: 480,
  javaPathOverride: null,
  launchBehavior: 'keep-open',
  concurrentDownloads: 8,
  msaClientId: null,
  curseforgeApiKey: null,
  autoUpdateCheck: true,
  autoUpdateDownload: true
}

export interface UpdateProgress {
  percent: number
  bytesPerSecond: number
  transferred: number
  total: number
}

export type UpdaterState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available'; version: string; notes: string }
  | { status: 'downloading'; version: string; notes: string; progress: UpdateProgress }
  | { status: 'ready'; version: string; notes: string }
  | { status: 'error'; error: string }
  | { status: 'unsupported'; reason: string }

export interface LaunchValidation {
  ok: boolean
  problems: { severity: 'error' | 'warn'; code: string; message: string }[]
  javaPath: string | null
  javaMajorNeeded: number
  diskFreeBytes: number
}

export interface SystemMemory {
  totalMB: number
}
