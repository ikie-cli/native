import { BrowserWindow, app, dialog, ipcMain, safeStorage, shell } from 'electron'
import os from 'node:os'
import { IPC } from '@shared/ipc'
import type {
  AppSettings,
  ContentKind,
  InstanceCreate,
  JavaDownloadRequest,
  ProjectVersion
} from '@shared/types'
import { openDb } from './db'
import { paths } from './paths'
import { SettingsService } from './services/settings'
import { AccountsService, plainTokenCrypto, type TokenCrypto } from './services/accounts'
import { createMsmcClient } from './services/msmc'
import { InstancesService } from './services/instances'
import { ContentService, type SearchQuery } from './services/content'
import { ModpacksService } from './services/modpacks'
import { ServersService, parseAddress, pingServer } from './services/servers'
import { WorldsService } from './services/worlds'
import { ScreenshotsService } from './services/screenshots'
import { LogsService } from './services/logs'
import { FilesService } from './services/files'
import { IconsService } from './services/icons'
import { fetchNews } from './services/news'
import { UpdaterService } from './services/updater'
import { DiscordRpc } from './services/discord'
import { RankedService } from './services/ranked'
import { LaunchManager } from './core/launch'
import { DownloadManager } from './core/download'
import { getManifest } from './core/manifest'
import { listLoaderVersions } from './core/loaders'
import { detectJavas, downloadJava, probeJava } from './core/java'
import { log } from './logger'

// Built-in CurseForge API key (ships with the app; overridable for dev/CI).
const CURSEFORGE_API_KEY =
  process.env.NATIVE_CF_API_KEY ?? '$2a$10$uUiUIGgW7zoLg2niyP3p/.5ChxQPf2rpz03vxXzfEeDBaJNQVLymS'

export interface Services {
  settings: SettingsService
  accounts: AccountsService
  instances: InstancesService
  launcher: LaunchManager
  updater: UpdaterService
  discord: DiscordRpc
  ranked: RankedService
  /** Swapped for a renderer-backed dialog in registerIpc; auto-approves headless. */
  javaConfirm: { handler: (req: Omit<JavaDownloadRequest, 'requestId'>) => Promise<boolean> }
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
    createMsmcClient(() => process.env.NATIVE_MSA_CLIENT_ID ?? settings.get().msaClientId)
  )
  const instances = new InstancesService(db, () => {
    const s = settings.get()
    return { memMin: s.defaultMemMin, memMax: s.defaultMemMax }
  })
  const javaConfirm: Services['javaConfirm'] = { handler: async () => true }
  const launcher = new LaunchManager({
    resolveVersionId: (inst) => instances.resolveVersionId(inst),
    peekVersionId: (inst) => instances.peekVersionId(inst),
    account: () => accounts.launchAccount(),
    concurrency: () => settings.get().concurrentDownloads,
    onPlaytime: (id, s, e) => instances.recordPlaytime(id, s, e),
    confirmJavaDownload: (req) => javaConfirm.handler(req)
  })
  const updater = new UpdaterService()
  const discord = new DiscordRpc()
  const ranked = new RankedService(instances, accounts)
  return { settings, accounts, instances, launcher, updater, discord, ranked, javaConfirm }
}

export function registerIpc(win: BrowserWindow, services: Services): void {
  const db = openDb()
  const { settings, accounts, instances, launcher, updater, discord, ranked } = services
  const content = new ContentService(db, () => CURSEFORGE_API_KEY)
  const servers = new ServersService(db)
  const icons = new IconsService()
  const modpacks = new ModpacksService(db, instances, icons)
  const worlds = new WorldsService()
  const screenshots = new ScreenshotsService()
  const logs = new LogsService()
  const files = new FilesService()

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
  ipcMain.handle(IPC.running.sessions, (_e, id: string) => logs.sessions(id))
  ipcMain.handle(IPC.running.readSession, (_e, id: string, file: string) => logs.read(id, file))
  ipcMain.handle(IPC.running.deleteSession, (_e, id: string, file: string) =>
    logs.delete(id, file)
  )
  launcher.on('changed', (list) => {
    send(IPC.running.onChanged, list)
    // Discord presence follows the most-recently-started game (or idle).
    const top = list[list.length - 1]
    const inst = top ? instances.get(top.instanceId) : null
    discord.set(inst ? { instance: inst, startedAt: top.startedAt } : null)
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
  ipcMain.handle(IPC.content.project, (_e, platform: 'modrinth' | 'curseforge', projectId: string) =>
    content.project(platform, projectId)
  )
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
        iconUrl?: string | null
      }
    ) => {
      return content
        .install(
          args.instanceId,
          args.platform,
          args.projectId,
          args.version,
          args.kind,
          args.displayName,
          args.mcVersion,
          args.loader,
          args.iconUrl
        )
        .then(() => send(IPC.content.onLocalChanged, args.instanceId))
    }
  )
  ipcMain.handle(IPC.content.listLocal, (_e, instanceId: string, kind: ContentKind) =>
    content.listLocal(instanceId, kind)
  )
  ipcMain.handle(IPC.content.installedProjects, (_e, instanceId: string) =>
    content.installedProjectIds(instanceId)
  )
  ipcMain.handle(IPC.content.toggle, (_e, instanceId, kind, fileName, enabled) =>
    content.toggle(instanceId, kind, fileName, enabled)
  )
  ipcMain.handle(IPC.content.removeLocal, async (_e, instanceId, kind, fileName) => {
    await content.removeLocal(instanceId, kind, fileName)
    send(IPC.content.onLocalChanged, instanceId)
  })
  ipcMain.handle(IPC.content.addLocalFiles, (_e, instanceId, kind, files) =>
    content.addLocalFiles(instanceId, kind, files)
  )

  // ---------- content updates ----------
  // mc version + loader come from the instance record, never the renderer.
  const updateContext = (instanceId: string): { mc: string; loader: string | null } => {
    const inst = instances.get(instanceId)
    if (!inst) throw new Error('Instance not found')
    return { mc: inst.mcVersion, loader: inst.loader === 'vanilla' ? null : inst.loader }
  }
  ipcMain.handle(IPC.content.updates, (_e, instanceId: string) => content.updates(instanceId))
  ipcMain.handle(IPC.content.checkUpdates, async (_e, instanceId: string) => {
    const ctx = updateContext(instanceId)
    const res = await content.checkUpdates(instanceId, ctx.mc, ctx.loader)
    send(IPC.content.onUpdatesChanged, instanceId, res)
    return res
  })
  ipcMain.handle(
    IPC.content.applyUpdate,
    async (_e, instanceId: string, kind: ContentKind, fileName: string) => {
      const ctx = updateContext(instanceId)
      await content.applyUpdate(instanceId, kind, fileName, ctx.mc, ctx.loader)
      send(IPC.content.onLocalChanged, instanceId)
      send(IPC.content.onUpdatesChanged, instanceId, await content.updates(instanceId))
    }
  )
  ipcMain.handle(IPC.content.updateAll, async (_e, instanceId: string) => {
    const ctx = updateContext(instanceId)
    const res = await content.updateAll(instanceId, ctx.mc, ctx.loader)
    send(IPC.content.onLocalChanged, instanceId)
    send(IPC.content.onUpdatesChanged, instanceId, await content.updates(instanceId))
    return res
  })

  // ---------- modpacks ----------
  ipcMain.handle(
    IPC.packs.installModrinth,
    (
      _e,
      args: { projectId: string; version: ProjectVersion; displayName: string; iconUrl?: string | null }
    ) => modpacks.installModrinth(args, settings.get().concurrentDownloads)
  )
  ipcMain.handle(IPC.packs.importFile, (_e, filePath: string) =>
    modpacks.importFile(filePath, settings.get().concurrentDownloads)
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

  // ---------- instance files ----------
  ipcMain.handle(IPC.files.list, (_e, id: string, relPath: string) => files.list(id, relPath))
  ipcMain.handle(IPC.files.openPath, (_e, id: string, relPath: string) =>
    files.openPath(id, relPath)
  )
  ipcMain.handle(IPC.files.reveal, (_e, id: string, relPath: string) => files.reveal(id, relPath))
  ipcMain.handle(IPC.files.delete, (_e, id: string, relPath: string) => files.delete(id, relPath))
  ipcMain.handle(IPC.files.readText, (_e, id: string, relPath: string, maxBytes?: number) =>
    files.readText(id, relPath, maxBytes)
  )

  // ---------- servers ----------
  ipcMain.handle(IPC.servers.list, () => servers.list())
  const sendServers = (): void => send(IPC.servers.onChanged, servers.list())
  ipcMain.handle(IPC.servers.add, (_e, name, address, instanceId) => {
    const entry = servers.add(name, address, instanceId)
    sendServers()
    return entry
  })
  ipcMain.handle(IPC.servers.update, (_e, id, patch) => {
    servers.update(id, patch)
    sendServers()
  })
  ipcMain.handle(IPC.servers.remove, (_e, id) => {
    servers.remove(id)
    sendServers()
  })
  ipcMain.handle(IPC.servers.ping, (_e, address: string) => pingServer(address))
  ipcMain.handle(IPC.servers.quickJoin, async (_e, serverId: string) => {
    const entry = servers.list().find((s) => s.id === serverId)
    if (!entry) throw new Error('Server not found')
    const instId = entry.instanceId ?? instances.list()[0]?.id
    if (!instId) throw new Error('Create an instance first to join servers')
    const inst = instances.get(instId)
    if (!inst) throw new Error('Instance not found')
    const game = await launcher.launch(inst, {
      javaOverride: settings.get().javaPathOverride,
      server: parseAddress(entry.address)
    })
    return game
  })
  launcher.on('server-connect', (instanceId: string, address: string, startedAt: number) => {
    try {
      const entry = servers.beginSession(address, instanceId, startedAt)
      log.info(`Detected multiplayer session on ${entry.address}`)
      sendServers()
    } catch (err) {
      log.warn(`Could not record multiplayer session: ${(err as Error).message}`)
    }
  })
  launcher.on('server-disconnect', (instanceId: string, endedAt: number) => {
    try {
      if (servers.endSession(instanceId, endedAt)) sendServers()
    } catch (err) {
      log.warn(`Could not finish multiplayer session: ${(err as Error).message}`)
    }
  })

  // ---------- Native Ranked ----------
  ipcMain.handle(IPC.ranked.status, () => ranked.status())
  ipcMain.handle(IPC.ranked.provision, () => ranked.provision())
  ipcMain.handle(IPC.ranked.launch, async () => {
    const inst = await ranked.prepareLaunch()
    const game = await launcher.launch(inst, {
      javaOverride: settings.get().javaPathOverride,
      server: null
    })
    const behavior = settings.get().launchBehavior
    if (behavior === 'minimize') win.minimize()
    else if (behavior === 'close') win.hide()
    return game
  })

  // ---------- news ----------
  ipcMain.handle(IPC.news.fetch, () => fetchNews())

  // ---------- instance icons ----------
  ipcMain.handle(IPC.icons.importImage, async (_e) => {
    const res = await dialog.showOpenDialog(win, {
      title: 'Choose an instance image',
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
      properties: ['openFile']
    })
    if (res.canceled || res.filePaths.length === 0) return null
    return await icons.importImage(res.filePaths[0])
  })
  ipcMain.handle(IPC.icons.data, (_e, ref: string) => icons.data(ref))

  // ---------- java ----------
  {
    // Launch pauses on a pending ask until the renderer answers (or times out → deny).
    let askSeq = 0
    const pendingAsks = new Map<string, (ok: boolean) => void>()
    services.javaConfirm.handler = (req) =>
      new Promise<boolean>((resolve) => {
        if (win.isDestroyed()) return resolve(false)
        const requestId = `java-ask-${++askSeq}`
        pendingAsks.set(requestId, resolve)
        if (!win.isVisible()) win.show()
        send(IPC.java.onAskDownload, { requestId, ...req } satisfies JavaDownloadRequest)
        setTimeout(() => {
          const pending = pendingAsks.get(requestId)
          if (pending) {
            pendingAsks.delete(requestId)
            pending(false)
          }
        }, 300_000).unref?.()
      })
    ipcMain.handle(IPC.java.answerDownload, (_e, requestId: string, accepted: boolean) => {
      const pending = pendingAsks.get(requestId)
      pendingAsks.delete(requestId)
      pending?.(accepted === true)
    })
  }
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
    if (patch.autoUpdateCheck !== undefined) updater.setAutoCheck(next.autoUpdateCheck)
    if (patch.autoUpdateDownload !== undefined) updater.setAutoDownload(next.autoUpdateDownload)
    if (patch.updateChannel !== undefined) updater.setChannel(next.updateChannel)
    if (patch.discordRpc !== undefined) discord.setEnabled(next.discordRpc)
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
