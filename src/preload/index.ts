import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IPC } from '@shared/ipc'
import type {
  AccountInfo,
  AppSettings,
  AuthFlowState,
  ContentKind,
  CrashInfo,
  DownloadTaskProgress,
  InstanceConfig,
  InstanceCreate,
  JavaInstall,
  LaunchValidation,
  LocalContentFile,
  LogLine,
  NewsItem,
  ProjectVersion,
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
    onChanged: (cb: (list: RunningGame[]) => void) => on(IPC.running.onChanged, cb),
    onLog: (cb: (instanceId: string, lines: LogLine[]) => void) => on(IPC.running.onLog, cb),
    onCrash: (cb: (crash: CrashInfo) => void) => on(IPC.running.onCrash, cb)
  },
  content: {
    search: (q: unknown): Promise<SearchResult> => ipcRenderer.invoke(IPC.content.search, q),
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
    }): Promise<void> => ipcRenderer.invoke(IPC.content.install, args),
    listLocal: (instanceId: string, kind: ContentKind): Promise<LocalContentFile[]> =>
      ipcRenderer.invoke(IPC.content.listLocal, instanceId, kind),
    toggle: (instanceId: string, kind: ContentKind, fileName: string, enabled: boolean): Promise<void> =>
      ipcRenderer.invoke(IPC.content.toggle, instanceId, kind, fileName, enabled),
    removeLocal: (instanceId: string, kind: ContentKind, fileName: string): Promise<void> =>
      ipcRenderer.invoke(IPC.content.removeLocal, instanceId, kind, fileName),
    addLocalFiles: (instanceId: string, kind: ContentKind, files: string[]): Promise<number> =>
      ipcRenderer.invoke(IPC.content.addLocalFiles, instanceId, kind, files)
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
    quickJoin: (id: string): Promise<RunningGame> => ipcRenderer.invoke(IPC.servers.quickJoin, id)
  },
  news: {
    fetch: (): Promise<NewsItem[]> => ipcRenderer.invoke(IPC.news.fetch)
  },
  java: {
    list: (): Promise<JavaInstall[]> => ipcRenderer.invoke(IPC.java.list),
    test: (path: string): Promise<JavaInstall | null> => ipcRenderer.invoke(IPC.java.test, path),
    download: (major: number): Promise<JavaInstall> => ipcRenderer.invoke(IPC.java.download, major)
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
