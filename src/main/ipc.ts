import { BrowserWindow, app, dialog, ipcMain, safeStorage, shell } from 'electron'
import os from 'node:os'
import { IPC } from '@shared/ipc'
import type { AppSettings, ContentKind, InstanceCreate, ProjectVersion } from '@shared/types'
import { openDb } from './db'
import { paths } from './paths'
import { SettingsService } from './services/settings'
import { AccountsService, plainTokenCrypto, type TokenCrypto } from './services/accounts'
import { InstancesService } from './services/instances'
import { ContentService, type SearchQuery } from './services/content'
import { ServersService, pingServer } from './services/servers'
import { WorldsService } from './services/worlds'
import { ScreenshotsService } from './services/screenshots'
import { fetchNews } from './services/news'
import { UpdaterService } from './services/updater'
import { LaunchManager } from './core/launch'
import { DownloadManager } from './core/download'
import { getManifest } from './core/manifest'
import { listLoaderVersions } from './core/loaders'
import { detectJavas, downloadJava, probeJava } from './core/java'
import { log } from './logger'

export interface Services {
  settings: SettingsService
  accounts: AccountsService
  instances: InstancesService
  launcher: LaunchManager
  updater: UpdaterService
}

export function buildServices(): Services {
  const db = openDb()
  const settings = new SettingsService(db)

  const crypto: TokenCrypto = safeStorage.isEncryptionAvailable()
    ? {
        encrypt: (p) => safeStorage.encryptString(p),
        decrypt: (b) => safeStorage.decryptString(b)
      }
    : plainTokenCrypto
  if (!safeStorage.isEncryptionAvailable()) {
    log.warn('OS keychain unavailable — storing tokens without OS encryption')
  }

  const accounts = new AccountsService(
    db,
    crypto,
    () => process.env.NATIVE_MSA_CLIENT_ID ?? settings.get().msaClientId
  )
  const instances = new InstancesService(db, () => {
    const s = settings.get()
    return { memMin: s.defaultMemMin, memMax: s.defaultMemMax }
  })
  const launcher = new LaunchManager({
    resolveVersionId: (inst) => instances.resolveVersionId(inst),
    account: () => accounts.launchAccount(),
    concurrency: () => settings.get().concurrentDownloads,
    onPlaytime: (id, s, e) => instances.recordPlaytime(id, s, e)
  })
  const updater = new UpdaterService()
  return { settings, accounts, instances, launcher, updater }
}

export function registerIpc(win: BrowserWindow, services: Services): void {
  const db = openDb()
  const { settings, accounts, instances, launcher, updater } = services
  const content = new ContentService(db, () => settings.get().curseforgeApiKey)
  const servers = new ServersService(db)
  const worlds = new WorldsService()
  const screenshots = new ScreenshotsService()

  const send = (channel: string, ...args: unknown[]): void => {
    if (!win.isDestroyed()) win.webContents.send(channel, ...args)
  }

  // ---------- window ----------
  ipcMain.on(IPC.win.minimize, () => win.minimize())
  ipcMain.on(IPC.win.toggleMaximize, () => (win.isMaximized() ? win.unmaximize() : win.maximize()))
  ipcMain.on(IPC.win.close, () => win.close())
  ipcMain.handle(IPC.win.isMaximized, () => win.isMaximized())
  win.on('maximize', () => send(IPC.win.onMaximized, true))
  win.on('unmaximize', () => send(IPC.win.onMaximized, false))

  // ---------- app ----------
  ipcMain.handle(IPC.app.info, () => ({
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    dataDir: paths.root()
  }))
  ipcMain.handle(IPC.app.openExternal, (_e, url: string) => {
    if (/^https?:\/\//.test(url)) return shell.openExternal(url)
    return Promise.resolve()
  })
  ipcMain.handle(IPC.app.openPath, (_e, p: string) => shell.openPath(p))
  ipcMain.handle(IPC.app.revealFile, (_e, p: string) => shell.showItemInFolder(p))
  ipcMain.handle(IPC.app.systemMemory, () => ({ totalMB: Math.round(os.totalmem() / 1048576) }))
  ipcMain.handle(
    IPC.app.pickFile,
    async (_e, opts: { title: string; filters?: { name: string; extensions: string[] }[]; multi?: boolean }) => {
      const res = await dialog.showOpenDialog(win, {
        title: opts.title,
        filters: opts.filters,
        properties: opts.multi ? ['openFile', 'multiSelections'] : ['openFile']
      })
      return res.canceled ? [] : res.filePaths
    }
  )

  // ---------- auth ----------
  ipcMain.handle(IPC.auth.beginMsa, () => {
    void accounts.beginMsaFlow().catch(() => undefined) // state flows via events
  })
  ipcMain.handle(IPC.auth.cancelMsa, () => accounts.cancelMsaFlow())
  ipcMain.handle(IPC.auth.addOffline, (_e, name: string) => accounts.addOffline(name))
  ipcMain.handle(IPC.auth.list, () => accounts.list())
  ipcMain.handle(IPC.auth.setActive, (_e, id: string) => accounts.setActive(id))
  ipcMain.handle(IPC.auth.remove, (_e, id: string) => accounts.remove(id))
  accounts.on('flow', (state) => send(IPC.auth.onFlow, state))
  accounts.on('changed', (list) => send(IPC.auth.onChanged, list))

  // ---------- versions ----------
  ipcMain.handle(IPC.versions.manifest, (_e, force?: boolean) => getManifest(force))
  ipcMain.handle(IPC.versions.loaderVersions, (_e, loader, mc) => listLoaderVersions(loader, mc))

  // ---------- instances ----------
  ipcMain.handle(IPC.instances.list, () => instances.list())
  ipcMain.handle(IPC.instances.get, (_e, id: string) => instances.get(id))
  ipcMain.handle(IPC.instances.create, (_e, input: InstanceCreate) => instances.create(input))
  ipcMain.handle(IPC.instances.update, (_e, id: string, patch) => instances.update(id, patch))
  ipcMain.handle(IPC.instances.remove, (_e, id: string) => instances.remove(id))
  ipcMain.handle(IPC.instances.duplicate, (_e, id: string) => instances.duplicate(id))
  ipcMain.handle(IPC.instances.install, (_e, id: string) =>
    instances.install(id, settings.get().concurrentDownloads)
  )
  ipcMain.handle(IPC.instances.validate, async (_e, id: string) => {
    const inst = instances.get(id)
    if (!inst) throw new Error('Instance not found')
    return await launcher.validate(inst, settings.get().javaPathOverride)
  })
  ipcMain.handle(
    IPC.instances.launch,
    async (_e, id: string, server?: { host: string; port: number } | null) => {
      const inst = instances.get(id)
      if (!inst) throw new Error('Instance not found')
      const game = await launcher.launch(inst, {
        javaOverride: settings.get().javaPathOverride,
        server: server ?? null
      })
      const behavior = settings.get().launchBehavior
      if (behavior === 'minimize') win.minimize()
      else if (behavior === 'close') win.hide()
      return game
    }
  )
  ipcMain.handle(IPC.instances.kill, (_e, id: string) => launcher.kill(id))
  ipcMain.handle(IPC.instances.openFolder, (_e, id: string) =>
    shell.openPath(paths.instanceGameDir(id))
  )
  instances.on('changed', () => send(IPC.instances.onChanged, instances.list()))

  // ---------- running games ----------
  ipcMain.handle(IPC.running.list, () => launcher.list())
  ipcMain.handle(IPC.running.logs, (_e, id: string) => launcher.logs(id))
  launcher.on('changed', (list) => {
    send(IPC.running.onChanged, list)
    if (list.length === 0 && settings.get().launchBehavior === 'close' && !win.isVisible()) {
      win.show()
    }
  })
  launcher.on('crash', (crash) => {
    send(IPC.running.onCrash, crash)
    if (!win.isVisible()) win.show()
  })
  // Log lines are batched at ~15 Hz to keep IPC cheap during spammy load phases.
  {
    const buffers = new Map<string, import('@shared/types').LogLine[]>()
    let flushTimer: ReturnType<typeof setInterval> | null = null
    launcher.on('log', (instanceId: string, line) => {
      let arr = buffers.get(instanceId)
      if (!arr) buffers.set(instanceId, (arr = []))
      arr.push(line)
      if (!flushTimer) {
        flushTimer = setInterval(() => {
          if (buffers.size === 0) {
            clearInterval(flushTimer!)
            flushTimer = null
            return
          }
          for (const [id, lines] of buffers) send(IPC.running.onLog, id, lines)
          buffers.clear()
        }, 66)
      }
    })
  }

  // ---------- content ----------
  ipcMain.handle(IPC.content.search, (_e, q: SearchQuery) => content.search(q))
  ipcMain.handle(IPC.content.versions, (_e, platform, projectId, mc, loader) =>
    content.versions(platform, projectId, mc, loader)
  )
  ipcMain.handle(
    IPC.content.install,
    (
      _e,
      args: {
        instanceId: string
        platform: 'modrinth' | 'curseforge'
        projectId: string
        version: ProjectVersion
        kind: ContentKind
        displayName: string
        mcVersion?: string | null
        loader?: string | null
      }
    ) =>
      content.install(
        args.instanceId,
        args.platform,
        args.projectId,
        args.version,
        args.kind,
        args.displayName,
        args.mcVersion,
        args.loader
      )
  )
  ipcMain.handle(IPC.content.listLocal, (_e, instanceId: string, kind: ContentKind) =>
    content.listLocal(instanceId, kind)
  )
  ipcMain.handle(IPC.content.toggle, (_e, instanceId, kind, fileName, enabled) =>
    content.toggle(instanceId, kind, fileName, enabled)
  )
  ipcMain.handle(IPC.content.removeLocal, (_e, instanceId, kind, fileName) =>
    content.removeLocal(instanceId, kind, fileName)
  )
  ipcMain.handle(IPC.content.addLocalFiles, (_e, instanceId, kind, files) =>
    content.addLocalFiles(instanceId, kind, files)
  )

  // ---------- worlds / screenshots ----------
  ipcMain.handle(IPC.worlds.list, (_e, id: string) => worlds.list(id))
  ipcMain.handle(IPC.worlds.backup, (_e, id: string, folder: string) => worlds.backup(id, folder))
  ipcMain.handle(IPC.worlds.remove, (_e, id: string, folder: string) => worlds.remove(id, folder))
  ipcMain.handle(IPC.screenshots.list, (_e, id: string) => screenshots.list(id))
  ipcMain.handle(IPC.screenshots.data, (_e, id: string, name: string) => screenshots.data(id, name))
  ipcMain.handle(IPC.screenshots.remove, (_e, id: string, name: string) =>
    screenshots.remove(id, name)
  )

  // ---------- servers ----------
  ipcMain.handle(IPC.servers.list, () => servers.list())
  ipcMain.handle(IPC.servers.add, (_e, name, address, instanceId) =>
    servers.add(name, address, instanceId)
  )
  ipcMain.handle(IPC.servers.update, (_e, id, patch) => servers.update(id, patch))
  ipcMain.handle(IPC.servers.remove, (_e, id) => servers.remove(id))
  ipcMain.handle(IPC.servers.ping, (_e, address: string) => pingServer(address))
  ipcMain.handle(IPC.servers.quickJoin, async (_e, serverId: string) => {
    const entry = servers.list().find((s) => s.id === serverId)
    if (!entry) throw new Error('Server not found')
    const instId = entry.instanceId ?? instances.list()[0]?.id
    if (!instId) throw new Error('Create an instance first to join servers')
    const inst = instances.get(instId)
    if (!inst) throw new Error('Instance not found')
    const { parseAddress } = await import('./services/servers')
    const game = await launcher.launch(inst, {
      javaOverride: settings.get().javaPathOverride,
      server: parseAddress(entry.address)
    })
    return game
  })

  // ---------- news ----------
  ipcMain.handle(IPC.news.fetch, () => fetchNews())

  // ---------- java ----------
  ipcMain.handle(IPC.java.list, () => detectJavas())
  ipcMain.handle(IPC.java.detect, () => detectJavas())
  ipcMain.handle(IPC.java.test, (_e, path: string) => probeJava(path))
  ipcMain.handle(IPC.java.download, async (_e, major: number) => {
    const task = DownloadManager.createTask(`java:${major}`, {
      label: `Java ${major}`,
      phase: 'java'
    })
    try {
      const result = await downloadJava(major, task)
      task.finish()
      return result
    } catch (err) {
      task.fail(err)
      throw err
    }
  })

  // ---------- settings ----------
  ipcMain.handle(IPC.settings.get, () => settings.get())
  ipcMain.handle(IPC.settings.set, (_e, patch: Partial<AppSettings>) => {
    const next = settings.set(patch)
    if (patch.autoUpdateDownload !== undefined) updater.setAutoDownload(next.autoUpdateDownload)
    send(IPC.settings.onChanged, next)
    return next
  })

  // ---------- downloads ----------
  ipcMain.handle(IPC.downloads.active, () => DownloadManager.snapshot())
  ipcMain.handle(IPC.downloads.cancel, (_e, id: string) => DownloadManager.cancel(id))
  DownloadManager.onProgress((all) => send(IPC.downloads.onProgress, all))

  // ---------- updater ----------
  ipcMain.handle(IPC.updater.state, () => updater.getState())
  ipcMain.handle(IPC.updater.check, () => updater.check())
  ipcMain.handle(IPC.updater.download, () => updater.download())
  ipcMain.handle(IPC.updater.install, () => updater.install())
  updater.on('state', (s) => send(IPC.updater.onState, s))
}
