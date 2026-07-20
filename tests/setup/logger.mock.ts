import { vi } from 'vitest'

/**
 * Replaces electron-log with silent no-ops so importing src/main/logger never
 * touches electron app paths. vi.mock factories are hoisted, so everything
 * they reference must live inside the factory body.
 */
export function installLoggerMock(): void {
  vi.mock('electron-log/main', () => {
    const noop = {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
      verbose: () => {},
      silly: () => {}
    }
    return {
      default: {
        ...noop,
        transports: { file: {}, console: {} },
        errorHandler: { startCatching: () => {} }
      }
    }
  })
  vi.mock('electron-log', () => {
    const noop = {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
      verbose: () => {},
      silly: () => {}
    }
    return { default: { ...noop, transports: { file: {}, console: {} } } }
  })
}
