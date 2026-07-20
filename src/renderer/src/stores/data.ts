import { create } from 'zustand'
import type {
  AccountInfo,
  AppSettings,
  AuthFlowState,
  CrashInfo,
  DownloadTaskProgress,
  InstanceConfig,
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
  const resolved =
    theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: light)').matches
        ? 'light'
        : 'dark'
      : theme
  document.documentElement.dataset.theme = resolved
}
