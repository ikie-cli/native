import { vi } from 'vitest'

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

/** Backward-compatible setup hook; mocks above are hoisted by Vitest. */
export function installLoggerMock(): void {
  // Intentionally empty.
}
