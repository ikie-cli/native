import { create } from 'zustand'
import type { ProjectType } from '@shared/types'

export type InstanceTab = 'content' | 'worlds' | 'screenshots' | 'files' | 'logs' | 'options'

export type Route =
  | { name: 'home' }
  | { name: 'library' }
  | { name: 'discover'; instanceId?: string; contentType?: ProjectType }
  | { name: 'instance'; id: string; tab: InstanceTab }
  | { name: 'servers' }
  | { name: 'ranked' }

interface NavState {
  route: Route
  stack: Route[]
  index: number
  go: (route: Route) => void
  back: () => void
  forward: () => void
  canBack: () => boolean
  canForward: () => boolean
}

function sameRoute(a: Route, b: Route): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export const useNav = create<NavState>((set, get) => ({
  route: { name: 'home' },
  stack: [{ name: 'home' }],
  index: 0,
  go: (route) => {
    const { stack, index, route: cur } = get()
    if (sameRoute(cur, route)) return
    const next = [...stack.slice(0, index + 1), route]
    set({ route, stack: next, index: next.length - 1 })
  },
  back: () => {
    const { stack, index } = get()
    if (index > 0) set({ index: index - 1, route: stack[index - 1] })
  },
  forward: () => {
    const { stack, index } = get()
    if (index < stack.length - 1) set({ index: index + 1, route: stack[index + 1] })
  },
  canBack: () => get().index > 0,
  canForward: () => get().index < get().stack.length - 1
}))

/** Modal layer state (settings/create/login are overlays, like the reference). */
interface ModalState {
  settingsOpen: boolean
  createOpen: boolean
  accountsOpen: boolean
  logsExpanded: boolean
  /** News article open in the reader modal (id from useNews items). */
  newsItemId: string | null
  /** Project open in the mod detail modal. */
  projectRef: {
    platform: 'modrinth' | 'curseforge'
    projectId: string
    instanceId: string | null
    projectType?: ProjectType
  } | null
  setSettingsOpen: (v: boolean) => void
  setCreateOpen: (v: boolean) => void
  setAccountsOpen: (v: boolean) => void
  setLogsExpanded: (v: boolean) => void
  openNews: (id: string | null) => void
  openProject: (ref: ModalState['projectRef']) => void
}

export const useModals = create<ModalState>((set) => ({
  settingsOpen: false,
  createOpen: false,
  accountsOpen: false,
  logsExpanded: false,
  newsItemId: null,
  projectRef: null,
  setSettingsOpen: (v) => set({ settingsOpen: v }),
  setCreateOpen: (v) => set({ createOpen: v }),
  setAccountsOpen: (v) => set({ accountsOpen: v }),
  setLogsExpanded: (v) => set({ logsExpanded: v }),
  openNews: (id) => set({ newsItemId: id }),
  openProject: (ref) => set({ projectRef: ref })
}))
