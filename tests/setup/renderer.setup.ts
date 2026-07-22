import { vi, beforeEach } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/types'

/**
 * Renderer stores call window.native.* (the preload bridge). Under happy-dom
 * there's no preload, so we install a fully-stubbed bridge whose methods are
 * vi.fn()s returning sensible empties. Individual tests override specific
 * methods via (window.native.<domain>.<fn> as Mock).mockResolvedValue(...).
 */
function noopUnsub(): () => void {
  return () => {}
}

function makeNativeStub() {
  const listeners = <T extends unknown[]>() => vi.fn((_cb: (...a: T) => void) => noopUnsub())
  return {
    window: {
      minimize: vi.fn(),
      toggleMaximize: vi.fn(),
      close: vi.fn(),
      isMaximized: vi.fn().mockResolvedValue(false),
      onMaximized: listeners()
    },
    app: {
      info: vi.fn().mockResolvedValue({ version: '0.0.0-test', platform: 'linux', arch: 'x64', dataDir: '/tmp' }),
      openExternal: vi.fn().mockResolvedValue(undefined),
      openPath: vi.fn().mockResolvedValue(''),
      revealFile: vi.fn().mockResolvedValue(undefined),
      systemMemory: vi.fn().mockResolvedValue({ totalMB: 16384, freeMB: 8192 }),
      pickFile: vi.fn().mockResolvedValue([]),
      pathForFile: vi.fn().mockReturnValue('')
    },
    auth: {
      beginMsa: vi.fn().mockResolvedValue(undefined),
      cancelMsa: vi.fn().mockResolvedValue(undefined),
      addOffline: vi.fn(),
      list: vi.fn().mockResolvedValue([]),
      setActive: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
      onFlow: listeners(),
      onChanged: listeners()
    },
    versions: {
      manifest: vi.fn().mockResolvedValue({ latest: { release: '1.21.4', snapshot: '1.21.4' }, versions: [] }),
      loaderVersions: vi.fn().mockResolvedValue([])
    },
    instances: {
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn().mockResolvedValue(undefined),
      duplicate: vi.fn(),
      install: vi.fn().mockResolvedValue(undefined),
      validate: vi.fn().mockResolvedValue({ ok: true, checks: [] }),
      launch: vi.fn(),
      kill: vi.fn().mockResolvedValue(true),
      openFolder: vi.fn().mockResolvedValue(''),
      onChanged: listeners()
    },
    running: {
      list: vi.fn().mockResolvedValue([]),
      logs: vi.fn().mockResolvedValue([]),
      onChanged: listeners(),
      onLog: listeners(),
      onCrash: listeners()
    },
    content: {
      search: vi.fn().mockResolvedValue({ hits: [], total: 0 }),
      versions: vi.fn().mockResolvedValue([]),
      install: vi.fn().mockResolvedValue(undefined),
      listLocal: vi.fn().mockResolvedValue([]),
      toggle: vi.fn().mockResolvedValue(undefined),
      removeLocal: vi.fn().mockResolvedValue(undefined),
      addLocalFiles: vi.fn().mockResolvedValue(0),
      updates: vi
        .fn()
        .mockResolvedValue({ instanceId: '', checkedAt: null, fromCache: false, updates: [] }),
      checkUpdates: vi
        .fn()
        .mockResolvedValue({ instanceId: '', checkedAt: null, fromCache: false, updates: [] }),
      applyUpdate: vi.fn().mockResolvedValue(undefined),
      updateAll: vi.fn().mockResolvedValue({ applied: 0, failed: [] }),
      onLocalChanged: listeners(),
      onUpdatesChanged: listeners()
    },
    packs: {
      installModrinth: vi.fn(),
      importFile: vi.fn()
    },
    worlds: {
      list: vi.fn().mockResolvedValue([]),
      backup: vi.fn().mockResolvedValue(''),
      remove: vi.fn().mockResolvedValue(undefined)
    },
    screenshots: {
      list: vi.fn().mockResolvedValue([]),
      data: vi.fn().mockResolvedValue(null),
      remove: vi.fn().mockResolvedValue(undefined)
    },
    servers: {
      list: vi.fn().mockResolvedValue([]),
      add: vi.fn(),
      update: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
      ping: vi.fn(),
      quickJoin: vi.fn(),
      onChanged: listeners()
    },
    ranked: {
      status: vi.fn().mockResolvedValue({
        configured: false,
        online: true,
        instance: null,
        player: null,
        leaderboard: [],
        service: { players: 0, queued: 0, activeMatches: 0, completedMatches: 0 }
      }),
      provision: vi.fn(),
      launch: vi.fn()
    },
    news: { fetch: vi.fn().mockResolvedValue([]) },
    java: {
      list: vi.fn().mockResolvedValue([]),
      test: vi.fn().mockResolvedValue(null),
      download: vi.fn()
    },
    settings: {
      get: vi.fn().mockResolvedValue(defaultSettings()),
      set: vi.fn(async (patch) => ({ ...defaultSettings(), ...patch })),
      onChanged: listeners()
    },
    downloads: {
      active: vi.fn().mockResolvedValue([]),
      cancel: vi.fn().mockResolvedValue(undefined),
      onProgress: listeners()
    },
    updater: {
      state: vi.fn().mockResolvedValue({ status: 'idle' }),
      check: vi.fn().mockResolvedValue(undefined),
      download: vi.fn().mockResolvedValue(undefined),
      install: vi.fn().mockResolvedValue(undefined),
      onState: listeners()
    }
  }
}

export function defaultSettings(): typeof DEFAULT_SETTINGS {
  return { ...DEFAULT_SETTINGS }
}

const dom = globalThis as unknown as {
  window: Window & { matchMedia: unknown }
  ResizeObserver?: unknown
}

function setNative(): void {
  ;(dom.window as unknown as Record<string, unknown>).native = makeNativeStub()
}

beforeEach(() => {
  // fresh stub each test so mock call counts don't leak
  setNative()
})

// happy-dom lacks these; framer-motion + theme code touch them.
if (!dom.window.matchMedia) {
  dom.window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  }))
}

if (!dom.ResizeObserver) {
  dom.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
}

// Install once synchronously too (some stores read window.native at import).
setNative()
