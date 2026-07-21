import { lazy, Suspense, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  Boxes,
  FileText,
  FolderOpen,
  Globe2,
  Image,
  Play,
  Settings2,
  Square
} from 'lucide-react'
import type { InstanceConfig, LaunchValidation } from '@shared/types'
import { LOADER_LABELS } from '@shared/types'
import {
  useContentUpdates,
  useInstanceBusy,
  useInstances,
  useRunning,
  useToasts,
  useUpdateCount,
  toastError
} from '@/stores/data'
import { useNav, type InstanceTab } from '@/stores/nav'
import { InstanceIcon } from '@/components/InstanceIcon'
import { LoaderMark } from '@/components/LoaderMark'
import { Button, Chip, IconButton, Spinner } from '@/components/ui/ui'
import { PillTabs } from '@/components/ui/tabs'
import { formatPlaytime } from '@/lib/util'

const ContentTab = lazy(() => import('@/screens/tabs/ContentTab').then((m) => ({ default: m.ContentTab })))
const WorldsTab = lazy(() => import('@/screens/tabs/WorldsTab').then((m) => ({ default: m.WorldsTab })))
const ScreenshotsTab = lazy(() =>
  import('@/screens/tabs/ScreenshotsTab').then((m) => ({ default: m.ScreenshotsTab }))
)
const LogsTab = lazy(() => import('@/screens/tabs/LogsTab').then((m) => ({ default: m.LogsTab })))
const FilesTab = lazy(() => import('@/screens/tabs/FilesTab').then((m) => ({ default: m.FilesTab })))
const OptionsTab = lazy(() => import('@/screens/tabs/OptionsTab').then((m) => ({ default: m.OptionsTab })))

const TABS = [
  { id: 'content' as const, label: 'Content', icon: Boxes },
  { id: 'worlds' as const, label: 'Worlds', icon: Globe2 },
  { id: 'screenshots' as const, label: 'Screenshots', icon: Image },
  { id: 'files' as const, label: 'Files', icon: FolderOpen },
  { id: 'logs' as const, label: 'Logs', icon: FileText },
  { id: 'options' as const, label: 'Options', icon: Settings2 }
]

function PlayButton({ inst }: { inst: InstanceConfig }): React.JSX.Element {
  const running = useRunning((s) => s.isRunning(inst.id))
  const push = useToasts((s) => s.push)
  const { go } = useNav()
  const [validation, setValidation] = useState<LaunchValidation | null>(null)
  const [launching, setLaunching] = useState(false)
  const busy = useInstanceBusy(inst.id) || launching

  useEffect(() => {
    let cancelled = false
    window.native.instances
      .validate(inst.id)
      .then((v) => !cancelled && setValidation(v))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [inst.id, inst.mcVersion, inst.loader, inst.installed])

  const launch = async (): Promise<void> => {
    setLaunching(true)
    try {
      const v = await window.native.instances.validate(inst.id)
      const blocking = v.problems.find((p) => p.severity === 'error')
      if (blocking) {
        if (blocking.code.startsWith('java')) {
          push({
            kind: 'error',
            title: 'Java problem',
            detail: blocking.message
          })
        } else {
          toastError(new Error(blocking.message), "Can't launch yet")
          setLaunching(false)
          return
        }
      }
      push({ kind: 'info', title: `Launching ${inst.name}…`, detail: 'Preparing game files' })
      await window.native.instances.launch(inst.id)
      go({ name: 'instance', id: inst.id, tab: 'logs' })
    } catch (err) {
      toastError(err, `Couldn't launch ${inst.name}`)
    } finally {
      setLaunching(false)
    }
  }

  if (running) {
    return (
      <Button variant="danger" size="md" icon={Square} onClick={() => void window.native.instances.kill(inst.id)}>
        Stop
      </Button>
    )
  }
  const warn = validation?.problems.find((p) => p.severity === 'warn')
  return (
    <div className="flex items-center gap-2">
      {warn && (
        <span title={warn.message} className="text-warning">
          <AlertTriangle size={18} />
        </span>
      )}
      <Button size="md" icon={busy ? undefined : Play} onClick={launch} disabled={busy} data-testid="instance-play" className="min-w-[130px]">
        {busy ? <Spinner size={16} /> : inst.installed ? 'Play' : 'Install & Play'}
      </Button>
    </div>
  )
}

function InstanceHeader({ inst }: { inst: InstanceConfig }): React.JSX.Element {
  return (
    <div className="flex items-center gap-4 px-6 pt-6">
      <InstanceIcon icon={inst.icon} name={inst.name} size={72} />
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-h1 text-content-primary">{inst.name}</h1>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <Chip>
            <LoaderMark loader={inst.loader} size={13} />
            {LOADER_LABELS[inst.loader]}
          </Chip>
          <Chip>{inst.mcVersion}</Chip>
          {inst.loaderVersion && inst.loader !== 'vanilla' && <Chip>{inst.loaderVersion}</Chip>}
          <span className="text-small text-content-muted">
            {inst.totalPlayMs > 0 ? `${formatPlaytime(inst.totalPlayMs)} played` : 'Never played'}
          </span>
        </div>
      </div>
      <IconButton
        icon={FolderOpen}
        label="Open folder"
        onClick={() => void window.native.instances.openFolder(inst.id)}
      />
      <PlayButton inst={inst} />
    </div>
  )
}

export function InstanceScreen({ id, tab }: { id: string; tab: InstanceTab }): React.JSX.Element {
  const inst = useInstances((s) => s.byId(id))
  const { go } = useNav()
  const updateCount = useUpdateCount(id)

  // Badge data: cached results immediately (works offline), then a throttled
  // background re-check — failures are silent and keep the cache.
  useEffect(() => {
    const store = useContentUpdates.getState()
    void store.refresh(id)
    void store.check(id)
  }, [id])

  if (!inst) {
    return (
      <div className="flex h-full items-center justify-center text-content-secondary">
        This instance no longer exists.
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col" data-testid="screen-instance">
      <InstanceHeader inst={inst} />
      <div className="mt-5 border-b border-line-subtle px-6">
        <PillTabs
          items={TABS.map((t) => (t.id === 'content' ? { ...t, badge: updateCount } : t))}
          value={tab}
          onChange={(t) => go({ name: 'instance', id, tab: t })}
          className="mb-3 bg-transparent p-0"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.16 }}
          className="h-full"
        >
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center">
                <Spinner size={24} />
              </div>
            }
          >
            {tab === 'content' && <ContentTab inst={inst} />}
            {tab === 'worlds' && <WorldsTab inst={inst} />}
            {tab === 'screenshots' && <ScreenshotsTab inst={inst} />}
            {tab === 'files' && <FilesTab inst={inst} />}
            {tab === 'logs' && <LogsTab inst={inst} />}
            {tab === 'options' && <OptionsTab inst={inst} />}
          </Suspense>
        </motion.div>
      </div>
    </div>
  )
}
