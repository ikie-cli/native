import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * `electron` stand-in for node-side vitest runs (aliased in vitest.config.ts).
 * In a plain node process the real `electron` package resolves to a binary
 * path string, so anything importing { app, safeStorage } needs this stub.
 *
 * safeStorage reports unavailable → token crypto uses its plaintext fallback,
 * which the production code already handles explicitly.
 */
const base = (): string => process.env.NATIVE_DATA_DIR || join(tmpdir(), 'native-test')
const noop = (): void => {}

export const app = {
  getPath: (name: string): string => join(base(), name),
  getName: (): string => 'Native',
  getVersion: (): string => '0.0.0-test',
  getAppPath: (): string => process.cwd(),
  isPackaged: false,
  on: noop,
  whenReady: (): Promise<void> => Promise.resolve(),
  quit: noop,
  requestSingleInstanceLock: (): boolean => true
}

export const safeStorage = {
  isEncryptionAvailable: (): boolean => false,
  encryptString: (s: string): Buffer => Buffer.from(s, 'utf8'),
  decryptString: (b: Buffer): string => b.toString('utf8')
}

export const shell = { openExternal: noop, openPath: noop, showItemInFolder: noop }
export const ipcMain = { handle: noop, on: noop, removeHandler: noop }
export const dialog = { showOpenDialog: noop }
export const nativeTheme = { themeSource: 'dark' }
export class BrowserWindow {
  static getAllWindows(): unknown[] {
    return []
  }
}
export const net = {}

export default { app, safeStorage, shell, ipcMain, dialog, nativeTheme, BrowserWindow, net }
