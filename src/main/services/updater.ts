import { EventEmitter } from 'node:events'
import { app } from 'electron'
import type { UpdaterState } from '@shared/types'
import { log } from '../logger'

/**
 * electron-updater integration against the public GitHub release feed.
 * Checks on startup + every 4 hours;
 * downloads silently in the background when enabled; UI applies via
 * quitAndInstall.
 *
 * Works with NSIS (Windows, delta via blockmaps) and AppImage (Linux).
 * .deb installs can't self-update — we surface 'unsupported' so the UI can
 * link to the release page instead.
 */
export class UpdaterService extends EventEmitter {
  private state: UpdaterState = { status: 'idle' }
  private timer: ReturnType<typeof setInterval> | null = null
  private autoDownload = true
  private updater: typeof import('electron-updater').autoUpdater | null = null

  async init(opts: {
    autoCheck: boolean
    autoDownload: boolean
    channel: 'latest' | 'beta' | 'nightly'
  }): Promise<void> {
    this.autoDownload = opts.autoDownload
    if (!app.isPackaged && !process.env.NATIVE_UPDATER_DEV) {
      this.setState({ status: 'unsupported', reason: 'dev-build' })
      return
    }
    if (process.platform === 'linux' && !process.env.APPIMAGE && !process.env.NATIVE_UPDATER_DEV) {
      this.setState({
        status: 'unsupported',
        reason: 'This install (deb/system package) updates through your package manager.'
      })
      return
    }
    try {
      // electron-updater exposes autoUpdater through a lazy CJS getter, which
      // ESM interop may only surface on `.default`.
      const mod = await import('electron-updater')
      const autoUpdater =
        mod.autoUpdater ??
        (mod as unknown as { default: { autoUpdater: typeof mod.autoUpdater } }).default.autoUpdater
      this.updater = autoUpdater
      autoUpdater.logger = log
      autoUpdater.autoDownload = false // we orchestrate explicitly
      autoUpdater.autoInstallOnAppQuit = true
      this.setChannel(opts.channel)
      if (process.env.NATIVE_UPDATER_DEV) {
        // Test hook: dev builds read a generic-provider feed config. When the
        // env var is a path, it points straight at the yml. Dev builds report
        // Electron's version, so real feed versions look like downgrades —
        // allow them so tests can exercise the production feed.
        autoUpdater.forceDevUpdateConfig = true
        autoUpdater.allowDowngrade = true
        if (process.env.NATIVE_UPDATER_DEV.includes('/')) {
          autoUpdater.updateConfigPath = process.env.NATIVE_UPDATER_DEV
        }
      }

      autoUpdater.on('checking-for-update', () => this.setState({ status: 'checking' }))
      autoUpdater.on('update-not-available', () => this.setState({ status: 'idle' }))
      autoUpdater.on('update-available', (info) => {
        const notes = releaseNotes(info.releaseNotes)
        const size = info.files.reduce((total, file) => total + (file.size ?? 0), 0)
        this.setState({ status: 'available', version: info.version, notes, size })
        if (this.autoDownload) void this.download()
      })
      autoUpdater.on('download-progress', (p) => {
        if (this.state.status === 'downloading' || this.state.status === 'available') {
          const prev = this.state as { version: string; notes: string; size: number }
          this.setState({
            status: 'downloading',
            version: prev.version,
            notes: prev.notes,
            size: prev.size,
            progress: {
              percent: p.percent,
              bytesPerSecond: p.bytesPerSecond,
              transferred: p.transferred,
              total: p.total
            }
          })
        }
      })
      autoUpdater.on('update-downloaded', (info) => {
        const notes = releaseNotes(info.releaseNotes)
        const size = info.files.reduce((total, file) => total + (file.size ?? 0), 0)
        this.setState({ status: 'ready', version: info.version, notes, size })
      })
      autoUpdater.on('error', (err) => {
        log.warn(`[updater] ${err.message}`)
        this.setState({ status: 'error', error: err.message })
      })

      if (opts.autoCheck) {
        // Don't slow cold start: first check after the window is up.
        setTimeout(() => void this.check(), 8000).unref?.()
        this.timer = setInterval(() => void this.check(), 4 * 60 * 60 * 1000)
        this.timer.unref?.()
      }
    } catch (err) {
      this.setState({ status: 'error', error: err instanceof Error ? err.message : String(err) })
    }
  }

  getState(): UpdaterState {
    return this.state
  }

  async check(): Promise<void> {
    if (!this.updater) return
    try {
      await withRetries(() => this.updater!.checkForUpdates(), 3)
    } catch (err) {
      this.setState({ status: 'error', error: err instanceof Error ? err.message : String(err) })
    }
  }

  async download(): Promise<void> {
    if (!this.updater) return
    if (this.state.status !== 'available') return
    try {
      await withRetries(() => this.updater!.downloadUpdate(), 3)
    } catch (err) {
      this.setState({ status: 'error', error: err instanceof Error ? err.message : String(err) })
    }
  }

  install(): void {
    if (this.state.status === 'ready') this.updater?.quitAndInstall(true, true)
  }

  setAutoDownload(v: boolean): void {
    this.autoDownload = v
  }

  setChannel(channel: 'latest' | 'beta' | 'nightly'): void {
    if (!this.updater) return
    this.updater.channel = channel
    this.updater.allowPrerelease = channel !== 'latest'
  }

  private setState(s: UpdaterState): void {
    this.state = s
    this.emit('state', s)
  }
}

function releaseNotes(notes: unknown): string {
  if (typeof notes === 'string') return notes
  if (!Array.isArray(notes)) return ''
  return notes
    .map((entry) => (entry && typeof entry === 'object' && 'note' in entry ? String(entry.note) : ''))
    .filter(Boolean)
    .join('\n\n')
}

async function withRetries<T>(operation: () => Promise<T>, attempts: number): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1_000))
      }
    }
  }
  throw lastError
}
