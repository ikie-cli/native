import { motion } from 'framer-motion'
import { ChevronRight, Clock, MoreVertical, Play, Plus, Square } from 'lucide-react'
import { useMemo } from 'react'
import type { InstanceConfig } from '@shared/types'
import { LOADER_LABELS } from '@shared/types'
import { useInstances, useNews, useRunning, toastError, useToasts } from '@/stores/data'
import { useModals, useNav } from '@/stores/nav'
import { InstanceIcon } from '@/components/InstanceIcon'
import { Button, EmptyState } from '@/components/ui/ui'
import { DropMenu } from '@/components/ui/menu'
import { IconButton } from '@/components/ui/ui'
import { timeAgo } from '@/lib/util'
import { Copy, FolderOpen, Trash2 } from 'lucide-react'

function useLaunch(): (inst: InstanceConfig) => void {
  const push = useToasts((s) => s.push)
  return (inst) => {
    push({ kind: 'info', title: `Launching ${inst.name}…` })
    window.native.instances.launch(inst.id).catch((err) => toastError(err, `Couldn't launch ${inst.name}`))
  }
}

function JumpBackRow({ inst }: { inst: InstanceConfig }): React.JSX.Element {
  const { go } = useNav()
  const running = useRunning((s) => s.isRunning(inst.id))
  const launch = useLaunch()

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 500, damping: 38, mass: 0.8 }}
      className="group flex cursor-pointer items-center gap-4 rounded-card bg-surface-raised p-4 transition-colors duration-fast hover:bg-surface-hover"
      onClick={() => go({ name: 'instance', id: inst.id, tab: 'content' })}
      data-testid="jump-back-row"
    >
      <InstanceIcon icon={inst.icon} name={inst.name} size={56} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-h3 text-content-primary">{inst.name}</div>
        <div className="mt-1 flex items-center gap-2 text-small text-content-secondary">
          {inst.lastPlayedAt && (
            <span className="inline-flex items-center gap-1.5">
              <Clock size={14} />
              Played {timeAgo(inst.lastPlayedAt)}
            </span>
          )}
          <span className="text-content-muted">•</span>
          <span className="truncate">
            {LOADER_LABELS[inst.loader]} {inst.mcVersion}
          </span>
        </div>
      </div>
      <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-2">
        {running ? (
          <Button
            variant="danger"
            icon={Square}
            onClick={() => void window.native.instances.kill(inst.id)}
            data-testid={`stop-${inst.id}`}
          >
            Stop
          </Button>
        ) : (
          <Button
            variant="secondary"
            icon={Play}
            onClick={() => launch(inst)}
            data-testid={`play-${inst.id}`}
            className="group-hover:bg-accent group-hover:text-accent-contrast"
          >
            Play
          </Button>
        )}
        <InstanceKebab inst={inst} />
      </div>
    </motion.div>
  )
}

export function InstanceKebab({ inst }: { inst: InstanceConfig }): React.JSX.Element {
  const { go, route } = useNav()
  const refresh = useInstances((s) => s.refresh)
  const push = useToasts((s) => s.push)
  return (
    <DropMenu
      items={[
        {
          label: 'Duplicate',
          icon: Copy,
          onClick: () => {
            window.native.instances
              .duplicate(inst.id)
              .then(() => push({ kind: 'success', title: `Duplicated ${inst.name}` }))
              .catch(toastError)
          }
        },
        {
          label: 'Open folder',
          icon: FolderOpen,
          onClick: () => void window.native.instances.openFolder(inst.id)
        },
        {
          label: 'Delete',
          icon: Trash2,
          danger: true,
          onClick: () => {
            if (!window.confirm(`Delete "${inst.name}" and all of its files? This cannot be undone.`)) return
            window.native.instances
              .remove(inst.id)
              .then(async () => {
                await refresh()
                if (route.name === 'instance' && route.id === inst.id) go({ name: 'library' })
                push({ kind: 'info', title: `Deleted ${inst.name}` })
              })
              .catch(toastError)
          }
        }
      ]}
      trigger={({ ref, onClick }) => (
        <IconButton ref={ref} icon={MoreVertical} label="Instance options" variant="ghost" onClick={onClick} />
      )}
    />
  )
}

function DiscoverStrip(): React.JSX.Element {
  const { go } = useNav()
  const news = useNews((s) => s.items)
  const imgs = news.filter((n) => n.image).slice(0, 3)
  if (imgs.length === 0) return <></>
  return (
    <section className="mt-8">
      <button
        className="group mb-4 flex items-center gap-1 text-h2 font-bold text-content-primary hover:text-accent"
        onClick={() => go({ name: 'discover' })}
      >
        Discover mods
        <ChevronRight size={20} className="transition-transform duration-fast group-hover:translate-x-0.5" />
      </button>
      <div className="grid grid-cols-3 gap-4">
        {imgs.map((n) => (
          <button
            key={n.id}
            onClick={() => void window.native.app.openExternal(n.url)}
            className="group aspect-[16/9] overflow-hidden rounded-card bg-surface-raised"
          >
            <img
              src={n.image!}
              alt={n.title}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-page ease-out-quart group-hover:scale-105"
            />
          </button>
        ))}
      </div>
    </section>
  )
}

export function HomeScreen(): React.JSX.Element {
  const { instances, loaded } = useInstances()
  const setCreateOpen = useModals((s) => s.setCreateOpen)

  const recent = useMemo(
    () =>
      [...instances]
        .sort((a, b) => (b.lastPlayedAt ?? b.createdAt) - (a.lastPlayedAt ?? a.createdAt))
        .slice(0, 5),
    [instances]
  )

  return (
    <div className="p-6" data-testid="screen-home">
      <h1 className="text-display text-content-primary">Welcome back!</h1>

      <h2 className="mt-4 text-h2 font-bold text-content-secondary">Jump back in</h2>
      <div className="mt-4 flex flex-col gap-3">
        {loaded && recent.length === 0 && (
          <EmptyState
            icon={Play}
            title="No instances yet"
            detail="Create your first instance to start playing — pick a Minecraft version and a mod loader, and Native handles the rest."
            action={
              <Button icon={Plus} onClick={() => setCreateOpen(true)} data-testid="home-create">
                Create instance
              </Button>
            }
          />
        )}
        {recent.map((inst) => (
          <JumpBackRow key={inst.id} inst={inst} />
        ))}
      </div>

      <DiscoverStrip />
    </div>
  )
}
