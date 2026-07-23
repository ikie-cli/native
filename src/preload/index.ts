import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IPC } from '@shared/ipc'
import type {
  AccountInfo,
  AppSettings,
  AuthFlowState,
  ContentKind,
  ContentUpdatesResult,
  CrashInfo,
  DownloadTaskProgress,
  FileEntry,
  InstanceConfig,
  InstanceCreate,
  JavaDownloadRequest,
  JavaInstall,
  LaunchValidation,
  LocalContentFile,
  LogLine,
  LogSession,
  ModpackInstallResult,
  NewsItem,
  ProjectDetails,
  ProjectVersion,
  RankedInstallResult,
  RunningGame,
  ScreenshotInfo,
  SearchResult,
  ServerEntry,
  ServerStatus,
  SystemMemory,
  UpdaterState,
  VersionManifest,
  WorldInfo
} from '@shared/types'

function on<T extends unknown[]>(channel: string, cb: (...args: T) => void): () => void {
  const listener = (_e: Electron.IpcRendererEvent, ...args: unknown[]): void => cb(...(args as T))
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api = {
  env: {
    avatarBase: process.env.NATIVE_AVATAR_BASE ?? 'https://mc-heads.net',
    // Hermetic runs suppress the first-run tour unless a spec asks for it.
    e2e: process.env.NATIVE_E2E === '1',
    forceTour: process.env.NATIVE_FORCE_TOUR === '1'
  },
  window: {
    minimize: (): void => ipcRenderer.send(IPC.win.minimize),
    toggleMaximize: (): void => ipcRenderer.send(IPC.win.toggleMaximize),
    close: (): void => ipcRenderer.send(IPC.win.close),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke(IPC.win.isMaximized),
    onMaximized: (cb: (v: boolean) => void) => on(IPC.win.onMaximized, cb)
  },
  app: {
    info: (): Promise<{ version: string; platform: string; arch: string; dataDir: string }> =>
      ipcRenderer.invoke(IPC.app.info),
    openExternal: (url: string): Promise<void> => ipcRenderer.invoke(IPC.app.openExternal, url),
    openPath: (p: string): Promise<string> => ipcRenderer.invoke(IPC.app.openPath, p),
    revealFile: (p: string): Promise<void> => ipcRenderer.invoke(IPC.app.revealFile, p),
    systemMemory: (): Promise<SystemMemory> => ipcRenderer.invoke(IPC.app.systemMemory),
    pickFile: (opts: {
      title: string
      filters?: { name: string; extensions: string[] }[]
      multi?: boolean
    }): Promise<string[]> => ipcRenderer.invoke(IPC.app.pickFile, opts),
    pathForFile: (file: File): string => webUtils.getPathForFile(file)
  },
  auth: {
    beginMsa: (): Promise<void> => ipcRenderer.invoke(IPC.auth.beginMsa),
    cancelMsa: (): Promise<void> => ipcRenderer.invoke(IPC.auth.cancelMsa),
    addOffline: (name: string): Promise<AccountInfo> => ipcRenderer.invoke(IPC.auth.addOffline, name),
    list: (): Promise<AccountInfo[]> => ipcRenderer.invoke(IPC.auth.list),
    setActive: (id: string): Promise<void> => ipcRenderer.invoke(IPC.auth.setActive, id),
    remove: (id: string): Promise<void> => ipcRenderer.invoke(IPC.auth.remove, id),
    onFlow: (cb: (s: AuthFlowState) => void) => on(IPC.auth.onFlow, cb),
    onChanged: (cb: (list: AccountInfo[]) => void) => on(IPC.auth.onChanged, cb)
  },
  versions: {
    manifest: (force?: boolean): Promise<VersionManifest> =>
      ipcRenderer.invoke(IPC.versions.manifest, force),
    loaderVersions: (
      loader: string,
      mc: string
    ): Promise<{ version: string; stable: boolean }[]> =>
      ipcRenderer.invoke(IPC.versions.loaderVersions, loader, mc)
  },
  instances: {
    list: (): Promise<InstanceConfig[]> => ipcRenderer.invoke(IPC.instances.list),
    get: (id: string): Promise<InstanceConfig | null> => ipcRenderer.invoke(IPC.instances.get, id),
    create: (input: InstanceCreate): Promise<InstanceConfig> =>
      ipcRenderer.invoke(IPC.instances.create, input),
    update: (id: string, patch: Partial<InstanceConfig>): Promise<InstanceConfig> =>
      ipcRenderer.invoke(IPC.instances.update, id, patch),
    remove: (id: string): Promise<void> => ipcRenderer.invoke(IPC.instances.remove, id),
    duplicate: (id: string): Promise<InstanceConfig> =>
      ipcRenderer.invoke(IPC.instances.duplicate, id),
    install: (id: string): Promise<void> => ipcRenderer.invoke(IPC.instances.install, id),
    validate: (id: string): Promise<LaunchValidation> =>
      ipcRenderer.invoke(IPC.instances.validate, id),
    launch: (id: string, server?: { host: string; port: number } | null): Promise<RunningGame> =>
      ipcRenderer.invoke(IPC.instances.launch, id, server),
    kill: (id: string): Promise<boolean> => ipcRenderer.invoke(IPC.instances.kill, id),
    openFolder: (id: string): Promise<string> => ipcRenderer.invoke(IPC.instances.openFolder, id),
    onChanged: (cb: (list: InstanceConfig[]) => void) => on(IPC.instances.onChanged, cb)
  },
  running: {
    list: (): Promise<RunningGame[]> => ipcRenderer.invoke(IPC.running.list),
    logs: (id: string): Promise<LogLine[]> => ipcRenderer.invoke(IPC.running.logs, id),
    sessions: (id: string): Promise<LogSession[]> => ipcRenderer.invoke(IPC.running.sessions, id),
    readSession: (id: string, file: string): Promise<LogLine[]> =>
      ipcRenderer.invoke(IPC.running.readSession, id, file),
    deleteSession: (id: string, file: string): Promise<void> =>
      ipcRenderer.invoke(IPC.running.deleteSession, id, file),
    onChanged: (cb: (list: RunningGame[]) => void) => on(IPC.running.onChanged, cb),
    onLog: (cb: (instanceId: string, lines: LogLine[]) => void) => on(IPC.running.onLog, cb),
    onCrash: (cb: (crash: CrashInfo) => void) => on(IPC.running.onCrash, cb)
  },
  content: {
    search: (q: unknown): Promise<SearchResult> => ipcRenderer.invoke(IPC.content.search, q),
    project: (platform: 'modrinth' | 'curseforge', projectId: string): Promise<ProjectDetails> =>
      ipcRenderer.invoke(IPC.content.project, platform, projectId),
    versions: (
      platform: 'modrinth' | 'curseforge',
      projectId: string,
      mc?: string | null,
      loader?: string | null
    ): Promise<ProjectVersion[]> =>
      ipcRenderer.invoke(IPC.content.versions, platform, projectId, mc, loader),
    install: (args: {
      instanceId: string
      platform: 'modrinth' | 'curseforge'
      projectId: string
      version: ProjectVersion
      kind: ContentKind
      displayName: string
      mcVersion?: string | null
      loader?: string | null
      iconUrl?: string | null
    }): Promise<void> => ipcRenderer.invoke(IPC.content.install, args),
    listLocal: (instanceId: string, kind: ContentKind): Promise<LocalContentFile[]> =>
      ipcRenderer.invoke(IPC.content.listLocal, instanceId, kind),
    installedProjects: (instanceId: string): Promise<string[]> =>
      ipcRenderer.invoke(IPC.content.installedProjects, instanceId),
    onLocalChanged: (cb: (instanceId: string) => void) => on(IPC.content.onLocalChanged, cb),
    toggle: (instanceId: string, kind: ContentKind, fileName: string, enabled: boolean): Promise<void> =>
      ipcRenderer.invoke(IPC.content.toggle, instanceId, kind, fileName, enabled),
    removeLocal: (instanceId: string, kind: ContentKind, fileName: string): Promise<void> =>
      ipcRenderer.invoke(IPC.content.removeLocal, instanceId, kind, fileName),
    addLocalFiles: (instanceId: string, kind: ContentKind, files: string[]): Promise<number> =>
      ipcRenderer.invoke(IPC.content.addLocalFiles, instanceId, kind, files),
    /** Cached update state (offline-safe, DB only). */
    updates: (instanceId: string): Promise<ContentUpdatesResult> =>
      ipcRenderer.invoke(IPC.content.updates, instanceId),
    /** Network check; degrades to cached results when offline. */
    checkUpdates: (instanceId: string): Promise<ContentUpdatesResult> =>
      ipcRenderer.invoke(IPC.content.checkUpdates, instanceId),
    applyUpdate: (instanceId: string, kind: ContentKind, fileName: string): Promise<void> =>
      ipcRenderer.invoke(IPC.content.applyUpdate, instanceId, kind, fileName),
    updateAll: (
      instanceId: string
    ): Promise<{ applied: number; failed: { fileName: string; error: string }[] }> =>
      ipcRenderer.invoke(IPC.content.updateAll, instanceId),
    onUpdatesChanged: (cb: (instanceId: string, result: ContentUpdatesResult) => void) =>
      on(IPC.content.onUpdatesChanged, cb)
  },
  packs: {
    installModrinth: (args: {
      projectId: string
      version: ProjectVersion
      displayName: string
      iconUrl?: string | null
    }): Promise<ModpackInstallResult> => ipcRenderer.invoke(IPC.packs.installModrinth, args),
    importFile: (filePath: string): Promise<ModpackInstallResult> =>
      ipcRenderer.invoke(IPC.packs.importFile, filePath)
  },
  worlds: {
    list: (id: string): Promise<WorldInfo[]> => ipcRenderer.invoke(IPC.worlds.list, id),
    backup: (id: string, folder: string): Promise<string> =>
      ipcRenderer.invoke(IPC.worlds.backup, id, folder),
    remove: (id: string, folder: string): Promise<void> =>
      ipcRenderer.invoke(IPC.worlds.remove, id, folder)
  },
  screenshots: {
    list: (id: string): Promise<ScreenshotInfo[]> => ipcRenderer.invoke(IPC.screenshots.list, id),
    data: (id: string, name: string): Promise<string | null> =>
      ipcRenderer.invoke(IPC.screenshots.data, id, name),
    remove: (id: string, name: string): Promise<void> =>
      ipcRenderer.invoke(IPC.screenshots.remove, id, name)
  },
  files: {
    list: (id: string, relPath: string): Promise<FileEntry[]> =>
      ipcRenderer.invoke(IPC.files.list, id, relPath),
    openPath: (id: string, relPath: string): Promise<string> =>
      ipcRenderer.invoke(IPC.files.openPath, id, relPath),
    reveal: (id: string, relPath: string): Promise<void> =>
      ipcRenderer.invoke(IPC.files.reveal, id, relPath),
    delete: (id: string, relPath: string): Promise<void> =>
      ipcRenderer.invoke(IPC.files.delete, id, relPath),
    readText: (id: string, relPath: string, maxBytes?: number): Promise<string | null> =>
      ipcRenderer.invoke(IPC.files.readText, id, relPath, maxBytes)
  },
  servers: {
    list: (): Promise<ServerEntry[]> => ipcRenderer.invoke(IPC.servers.list),
    add: (name: string, address: string, instanceId: string | null): Promise<ServerEntry> =>
      ipcRenderer.invoke(IPC.servers.add, name, address, instanceId),
    update: (
      id: string,
      patch: Partial<Pick<ServerEntry, 'name' | 'address' | 'instanceId'>>
    ): Promise<void> => ipcRenderer.invoke(IPC.servers.update, id, patch),
    remove: (id: string): Promise<void> => ipcRenderer.invoke(IPC.servers.remove, id),
    ping: (address: string): Promise<ServerStatus> => ipcRenderer.invoke(IPC.servers.ping, address),
    quickJoin: (id: string): Promise<RunningGame> => ipcRenderer.invoke(IPC.servers.quickJoin, id),
    onChanged: (cb: (servers: ServerEntry[]) => void) => on(IPC.servers.onChanged, cb)
  },
  ranked: {
    install: (): Promise<RankedInstallResult> => ipcRenderer.invoke(IPC.ranked.install)
  },
  news: {
    fetch: (): Promise<NewsItem[]> => ipcRenderer.invoke(IPC.news.fetch)
  },
  icons: {
    /** Open a picker, import the chosen image, return `image:<name>` or null. */
    importImage: (): Promise<string | null> => ipcRenderer.invoke(IPC.icons.importImage),
    data: (ref: string): Promise<string | null> => ipcRenderer.invoke(IPC.icons.data, ref)
  },
  java: {
    list: (): Promise<JavaInstall[]> => ipcRenderer.invoke(IPC.java.list),
    test: (path: string): Promise<JavaInstall | null> => ipcRenderer.invoke(IPC.java.test, path),
    download: (major: number): Promise<JavaInstall> => ipcRenderer.invoke(IPC.java.download, major),
    onAskDownload: (cb: (req: JavaDownloadRequest) => void) => on(IPC.java.onAskDownload, cb),
    answerDownload: (requestId: string, accepted: boolean): Promise<void> =>
      ipcRenderer.invoke(IPC.java.answerDownload, requestId, accepted)
  },
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke(IPC.settings.get),
    set: (patch: Partial<AppSettings>): Promise<AppSettings> =>
      ipcRenderer.invoke(IPC.settings.set, patch),
    onChanged: (cb: (s: AppSettings) => void) => on(IPC.settings.onChanged, cb)
  },
  downloads: {
    active: (): Promise<DownloadTaskProgress[]> => ipcRenderer.invoke(IPC.downloads.active),
    cancel: (id: string): Promise<void> => ipcRenderer.invoke(IPC.downloads.cancel, id),
    onProgress: (cb: (all: DownloadTaskProgress[]) => void) => on(IPC.downloads.onProgress, cb)
  },
  updater: {
    state: (): Promise<UpdaterState> => ipcRenderer.invoke(IPC.updater.state),
    check: (): Promise<void> => ipcRenderer.invoke(IPC.updater.check),
    download: (): Promise<void> => ipcRenderer.invoke(IPC.updater.download),
    install: (): Promise<void> => ipcRenderer.invoke(IPC.updater.install),
    onState: (cb: (s: UpdaterState) => void) => on(IPC.updater.onState, cb)
  }
}

export type NativeApi = typeof api

contextBridge.exposeInMainWorld('native', api)
