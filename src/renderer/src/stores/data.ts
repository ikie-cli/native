import { create } from 'zustand'
import type {
  AccountInfo,
  AppSettings,
  AuthFlowState,
  ContentUpdatesResult,
  CrashInfo,
  DownloadTaskProgress,
  InstanceConfig,
  JavaDownloadRequest,
  LogLine,
  NewsItem,
  RunningGame,
  UpdaterState,
  VersionManifest
} from '@shared/types'
import { DEFAULT_SETTINGS } from '@shared/types'

/* ---------------- settings ---------------- */

interface SettingsState {
  settings: AppSettings
  loaded: boolean
  set: (patch: Partial<AppSettings>) => Promise<void>
}

export const useSettings = create<SettingsState>((set) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  set: async (patch) => {
    const next = await window.native.settings.set(patch)
    set({ settings: next })
  }
}))

/* ---------------- accounts ---------------- */

interface AccountsState {
  accounts: AccountInfo[]
  flow: AuthFlowState
  active: () => AccountInfo | null
  refresh: () => Promise<void>
  setFlow: (f: AuthFlowState) => void
}

export const useAccounts = create<AccountsState>((set, get) => ({
  accounts: [],
  flow: { step: 'idle' },
  active: () => get().accounts.find((a) => a.active) ?? null,
  refresh: async () => set({ accounts: await window.native.auth.list() }),
  setFlow: (f) => set({ flow: f })
}))

/* ---------------- instances ---------------- */

interface InstancesState {
  instances: InstanceConfig[]
  loaded: boolean
  byId: (id: string) => InstanceConfig | undefined
  refresh: () => Promise<void>
}

export const useInstances = create<InstancesState>((set, get) => ({
  instances: [],
  loaded: false,
  byId: (id) => get().instances.find((i) => i.id === id),
  refresh: async () => set({ instances: await window.native.instances.list(), loaded: true })
}))

/* ---------------- running games + logs ---------------- */

const LOG_CAP = 5000

interface RunningState {
  running: RunningGame[]
  logs: Record<string, LogLine[]>
  crash: CrashInfo | null
  isRunning: (id: string) => boolean
  appendLogs: (id: string, lines: LogLine[]) => void
  loadLogs: (id: string) => Promise<void>
  clearCrash: () => void
}

export const useRunning = create<RunningState>((set, get) => ({
  running: [],
  logs: {},
  crash: null,
  isRunning: (id) => get().running.some((r) => r.instanceId === id),
  appendLogs: (id, lines) =>
    set((s) => {
      const cur = s.logs[id] ?? []
      const next = cur.length + lines.length > LOG_CAP
        ? [...cur, ...lines].slice(-LOG_CAP)
        : [...cur, ...lines]
      return { logs: { ...s.logs, [id]: next } }
    }),
  loadLogs: async (id) => {
    const lines = await window.native.running.logs(id)
    set((s) => ({ logs: { ...s.logs, [id]: lines } }))
  },
  clearCrash: () => set({ crash: null })
}))

/* ---------------- downloads ---------------- */

interface DownloadsState {
  tasks: DownloadTaskProgress[]
}

export const useDownloads = create<DownloadsState>(() => ({ tasks: [] }))

/** True while this instance has an active launch/install/loader download. */
export function useInstanceBusy(id: string): boolean {
  return useDownloads((s) =>
    s.tasks.some(
      (t) =>
        t.state === 'running' &&
        (t.id === `launch:${id}` || t.id === `install:${id}` || t.id === `loader:${id}`)
    )
  )
}

/* ---------------- content updates ---------------- */

/** Re-check an instance at most every 30 min unless forced. */
const UPDATE_CHECK_TTL = 30 * 60_000

interface ContentUpdatesState {
  byInstance: Record<string, ContentUpdatesResult>
  lastAttempt: Record<string, number>
  /** Load the cached (offline-safe) results. */
  refresh: (instanceId: string) => Promise<void>
  /** Network check, throttled; offline silently keeps the cache. */
  check: (instanceId: string, opts?: { force?: boolean }) => Promise<ContentUpdatesResult | null>
}

export const useContentUpdates = create<ContentUpdatesState>((set, get) => ({
  byInstance: {},
  lastAttempt: {},
  refresh: async (instanceId) => {
    try {
      const result = await window.native.content.updates(instanceId)
      set((s) => ({ byInstance: { ...s.byInstance, [instanceId]: result } }))
    } catch {
      /* keep whatever we have */
    }
  },
  check: async (instanceId, opts) => {
    const now = Date.now()
    if (!opts?.force && now - (get().lastAttempt[instanceId] ?? 0) < UPDATE_CHECK_TTL) return null
    set((s) => ({ lastAttempt: { ...s.lastAttempt, [instanceId]: now } }))
    try {
      const result = await window.native.content.checkUpdates(instanceId)
      set((s) => ({ byInstance: { ...s.byInstance, [instanceId]: result } }))
      return result
    } catch {
      // offline or instance gone — cached results stay visible
      return null
    }
  }
}))

/** Available-update count for the Content tab badge. */
export function useUpdateCount(instanceId: string): number {
  return useContentUpdates((s) => s.byInstance[instanceId]?.updates.length ?? 0)
}

/* ---------------- java download confirmation ---------------- */

interface JavaAskState {
  request: JavaDownloadRequest | null
  answer: (accepted: boolean) => void
}

export const useJavaAsk = create<JavaAskState>((set, get) => ({
  request: null,
  answer: (accepted) => {
    const req = get().request
    if (!req) return
    set({ request: null })
    void window.native.java.answerDownload(req.requestId, accepted)
  }
}))

/* ---------------- updater ---------------- */

interface UpdaterStoreState {
  state: UpdaterState
  dismissed: boolean
  dismiss: () => void
}

export const useUpdater = create<UpdaterStoreState>((set) => ({
  state: { status: 'idle' },
  dismissed: false,
  dismiss: () => set({ dismissed: true })
}))

/* ---------------- news ---------------- */

interface NewsState {
  items: NewsItem[]
  loaded: boolean
  error: string | null
}

export const useNews = create<NewsState>(() => ({ items: [], loaded: false, error: null }))

/* ---------------- version manifest ---------------- */

interface ManifestState {
  manifest: VersionManifest | null
  error: string | null
  load: (force?: boolean) => Promise<void>
}

export const useManifest = create<ManifestState>((set) => ({
  manifest: null,
  error: null,
  load: async (force) => {
    try {
      set({ manifest: await window.native.versions.manifest(force), error: null })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    }
  }
}))

/* ---------------- toasts ---------------- */

export interface Toast {
  id: number
  kind: 'info' | 'success' | 'error'
  title: string
  detail?: string
}

interface ToastState {
  toasts: Toast[]
  push: (t: Omit<Toast, 'id'>) => void
  dismiss: (id: number) => void
}

let toastId = 1
export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (t) => {
    const id = toastId++
    set((s) => ({ toasts: [...s.toasts.slice(-3), { ...t, id }] }))
    setTimeout(() => {
      useToasts.getState().dismiss(id)
    }, t.kind === 'error' ? 8000 : 4500)
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }))
}))

export function toastError(err: unknown, title = 'Something went wrong'): void {
  const detail = err instanceof Error ? err.message : String(err)
  useToasts.getState().push({ kind: 'error', title, detail: detail.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') })
}

/* ---------------- bootstrap: initial fetch + event subscriptions ---------------- */

let booted = false
export async function bootstrapStores(): Promise<void> {
  if (booted) return
  booted = true
  const n = window.native

  n.settings.onChanged((s) => useSettings.setState({ settings: s }))
  n.auth.onChanged((accounts) => useAccounts.setState({ accounts }))
  n.auth.onFlow((flow) => useAccounts.setState({ flow }))
  n.instances.onChanged((instances) => useInstances.setState({ instances }))
  n.running.onChanged((running) => useRunning.setState({ running }))
  n.running.onLog((id, lines) => useRunning.getState().appendLogs(id, lines))
  n.running.onCrash((crash) => useRunning.setState({ crash }))
  n.downloads.onProgress((tasks) => useDownloads.setState({ tasks }))
  n.content.onUpdatesChanged((instanceId, result) =>
    useContentUpdates.setState((s) => ({ byInstance: { ...s.byInstance, [instanceId]: result } }))
  )
  n.java.onAskDownload((request) => useJavaAsk.setState({ request }))
  n.updater.onState((state) => useUpdater.setState({ state, dismissed: false }))

  const [settings, accounts, instances, running, tasks, updater] = await Promise.all([
    n.settings.get(),
    n.auth.list(),
    n.instances.list(),
    n.running.list(),
    n.downloads.active(),
    n.updater.state()
  ])
  useSettings.setState({ settings, loaded: true })
  useAccounts.setState({ accounts })
  useInstances.setState({ instances, loaded: true })
  useRunning.setState({ running })
  useDownloads.setState({ tasks })
  useUpdater.setState({ state: updater })

  // Theme wiring
  applyTheme(settings.theme)
  useSettings.subscribe((s) => applyTheme(s.settings.theme))

  // Non-blocking: news + manifest warm-up
  void n.news
    .fetch()
    .then((items) => useNews.setState({ items, loaded: true, error: null }))
    .catch((err) =>
      useNews.setState({ loaded: true, error: err instanceof Error ? err.message : String(err) })
    )
  void useManifest.getState().load()
}

function applyTheme(theme: AppSettings['theme']): void {
  // `system` follows the OS within the mono (black & white) identity.
  const resolved =
    theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: light)').matches
        ? 'mono-light'
        : 'mono'
      : theme
  document.documentElement.dataset.theme = resolved
}
