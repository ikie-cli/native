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
  /** cached launchable version id (loader profile); null until first resolve */
  resolvedVersionId: string | null
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

/** A saved past launch, one per session file on disk. */
export interface LogSession {
  /** Filename, e.g. `1721570000000.log` — the id passed to read/delete. */
  file: string
  /** Launch start time (epoch ms), parsed from the filename. */
  startedAt: number
  /** File size in bytes. */
  size: number
  /** True when the session ended in a crash (`.crash.log`). */
  crashed: boolean
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
  /** Most recent detected multiplayer connection, including the current one. */
  lastPlayedAt: number | null
  /** Completed time spent connected to this server. */
  totalPlayMs: number
  /** Number of detected connection sessions. */
  playCount: number
  /** True when Native discovered this server from a Minecraft client log. */
  detected: boolean
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

export interface RankedPlayer {
  id: string
  username: string
  rating: number
  wins: number
  losses: number
  races: number
}

export interface RankedStatus {
  configured: boolean
  online: boolean
  instance: InstanceConfig | null
  player: RankedPlayer | null
  leaderboard: RankedPlayer[]
  history: RankedMatchSummary[]
  service: {
    players: number
    queued: number
    activeMatches: number
    completedMatches: number
  } | null
  error?: string
}

/** One finished race in a player's history. */
export interface RankedMatchSummary {
  id: string
  mode: string
  seed: string
  createdAt: number
  finishedAt: number | null
  winnerId: string | null
  finishMs: number | null
  ratingDelta: number
  opponent: string
}

/** Public profile: a player plus their recent finished races. */
export interface RankedProfile {
  player: RankedPlayer
  history: RankedMatchSummary[]
}

/** Full project page data for the mod detail view. */
export interface ProjectDetails {
  platform: 'modrinth' | 'curseforge'
  projectId: string
  /** modrinth project_type when known (mod/modpack/resourcepack/shader); null on CurseForge */
  projectType: string | null
  slug: string
  title: string
  summary: string
  /** Long-form description: markdown (Modrinth) or sanitized-later HTML (CurseForge). */
  body: string
  bodyFormat: 'markdown' | 'html'
  icon: string | null
  author: string
  downloads: number
  follows: number
  updated: string
  published: string
  categories: string[]
  gallery: string[]
  links: { website: string | null; source: string | null; issues: string | null; wiki: string | null }
  license: string | null
  clientSide: string | null
  serverSide: string | null
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

/** Sent to the renderer when a launch needs a Java runtime that isn't installed. */
export interface JavaDownloadRequest {
  requestId: string
  major: number
  /** Full Temurin version that would be installed, e.g. "21.0.5+11" */
  javaVersion: string
  sizeBytes: number
  instanceName: string | null
  mcVersion: string | null
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

export interface FileEntry {
  name: string
  dir: boolean
  size: number
  mtimeMs: number
}

export type ContentKind = 'mod' | 'resourcepack' | 'shaderpack'

export interface LocalContentFile {
  fileName: string
  kind: ContentKind
  enabled: boolean
  sizeBytes: number
  mtime: number
  /** data URL from the local project-icon cache; null when not cached */
  icon: string | null
  meta: {
    name?: string
    version?: string
    description?: string
    projectId?: string | null
    platform?: 'modrinth' | 'curseforge'
  } | null
  /** newer compatible version from the last update check; null = up to date/unknown */
  update: { versionId: string; versionNumber: string } | null
}

/** One file with a newer compatible version available. */
export interface ContentUpdateInfo {
  instanceId: string
  kind: ContentKind
  fileName: string
  projectId: string
  platform: 'modrinth' | 'curseforge'
  displayName: string
  installedVersion: string | null
  newVersionId: string
  newVersionNumber: string
}

/**
 * Update-check state for an instance. Results are persisted, so this is
 * available offline; `fromCache` marks a check that couldn't reach the
 * network and fell back entirely to the stored results.
 */
export interface ContentUpdatesResult {
  instanceId: string
  /** newest successful per-file check; null = never checked */
  checkedAt: number | null
  fromCache: boolean
  updates: ContentUpdateInfo[]
}

export interface ModpackInstallResult {
  instance: InstanceConfig
  filesTotal: number
  overridesApplied: boolean
  warnings: string[]
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
  autoUpdateCheck: boolean
  autoUpdateDownload: boolean
  updateChannel: 'latest' | 'beta' | 'nightly'
  /** Show current instance as Discord Rich Presence. */
  discordRpc: boolean
  /** First-run guided tour: flips true once finished or skipped. */
  onboardingDone: boolean
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
  autoUpdateCheck: true,
  autoUpdateDownload: true,
  updateChannel: 'latest',
  discordRpc: true,
  onboardingDone: false
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
  | { status: 'available'; version: string; notes: string; size: number }
  | { status: 'downloading'; version: string; notes: string; size: number; progress: UpdateProgress }
  | {
      status: 'ready'
      version: string
      notes: string
      size: number
      /** How the update was fetched: 'delta' (small patch) or 'full'. Null if unknown. */
      deltaMode?: 'delta' | 'full' | null
      /** When 'full', the reason a differential download wasn't possible. */
      deltaReason?: string | null
    }
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
