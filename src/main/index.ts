import { BrowserWindow, app, nativeTheme, shell } from 'electron'
import { join } from 'node:path'
import { ensureDirs } from './paths'
import { initLogger, log } from './logger'
import { buildServices, registerIpc } from './ipc'
import { seedFromEnv } from './seed'
import { io } from './core/io'
import { closeDb } from './db'

const isDev = !app.isPackaged

// Test isolation: when a custom data dir is set, keep the Chromium profile
// (and its single-instance lock) inside it so parallel/sequential test apps
// never share state.
if (process.env.NATIVE_DATA_DIR) {
  app.setPath('userData', join(process.env.NATIVE_DATA_DIR, 'electron-profile'))
}

// Single instance lock — second launches focus the existing window.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  let win: BrowserWindow | null = null

  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
    }
  })

  const createWindow = (): void => {
    // Test hook: exact window geometry for visual QA (e.g. "1366x728").
    const sizeOverride = /^(\d+)x(\d+)$/.exec(process.env.NATIVE_WIN_SIZE ?? '')
    win = new BrowserWindow({
      width: sizeOverride ? Number(sizeOverride[1]) : 1366,
      height: sizeOverride ? Number(sizeOverride[2]) : 768,
      useContentSize: Boolean(sizeOverride),
      minWidth: 1000,
      minHeight: 640,
      show: false,
      frame: false,
      titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : undefined,
      backgroundColor: '#111317',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        spellcheck: false,
        // Keep progress UI + transitions running when minimized/occluded.
        backgroundThrottling: false
      }
    })

    win.once('ready-to-show', () => win?.show())

    // All external links open in the OS browser, never in-app.
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//.test(url)) void shell.openExternal(url)
      return { action: 'deny' }
    })
    win.webContents.on('will-navigate', (e, url) => {
      if (!url.startsWith('http://localhost') && !url.startsWith('file://')) e.preventDefault()
    })

    const services = buildServices()
    registerIpc(win, services)
    const settings = services.settings.get()
    void services.updater.init({
      autoCheck: settings.autoUpdateCheck && !process.env.NATIVE_E2E,
      autoDownload: settings.autoUpdateDownload
    })

    if (isDev && process.env.ELECTRON_RENDERER_URL) {
      void win.loadURL(process.env.ELECTRON_RENDERER_URL)
    } else {
      void win.loadFile(join(__dirname, '../renderer/index.html'))
    }
  }

  void app.whenReady().then(() => {
    ensureDirs()
    initLogger()
    seedFromEnv()
    nativeTheme.themeSource = 'dark'
    log.info(`Native ${app.getVersion()} starting (${process.platform}/${process.arch})`)
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    // Cross-platform-safe: on macOS the app conventionally stays alive; that
    // phase is planned, so for now we quit uniformly.
    app.quit()
  })

  app.on('before-quit', () => {
    io.shutdown()
    closeDb()
  })
}
