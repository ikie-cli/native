import { afterEach, describe, expect, it, vi } from 'vitest'

const autoUpdater = vi.hoisted(() => ({
  logger: null as unknown,
  autoDownload: true,
  autoInstallOnAppQuit: false,
  forceDevUpdateConfig: false,
  allowDowngrade: false,
  allowPrerelease: false,
  channel: 'latest',
  updateConfigPath: '',
  on: vi.fn(),
  checkForUpdates: vi.fn(async () => null),
  downloadUpdate: vi.fn(async () => []),
  quitAndInstall: vi.fn()
}))

vi.mock('electron-updater', () => ({ autoUpdater }))

import { UpdaterService } from '../../src/main/services/updater'

describe('UpdaterService automatic checks', () => {
  afterEach(() => {
    delete process.env.NATIVE_UPDATER_DEV
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('delays the startup check and applies runtime toggle changes immediately', async () => {
    vi.useFakeTimers()
    process.env.NATIVE_UPDATER_DEV = '1'
    const service = new UpdaterService()
    await service.init({ autoCheck: true, autoDownload: true, channel: 'latest' })

    await vi.advanceTimersByTimeAsync(7_999)
    expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1)

    service.setAutoCheck(false)
    await vi.advanceTimersByTimeAsync(8 * 60 * 60 * 1000)
    expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1)

    service.setAutoCheck(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(2)
  })
})
