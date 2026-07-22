import { motion } from 'framer-motion'
import { ChevronRight, Clock, Download, MoreVertical, PackageOpen, Play, Plus, Square } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { InstanceConfig, SearchHit } from '@shared/types'
import { LOADER_LABELS } from '@shared/types'
import { useInstanceBusy, useInstances, useRunning, toastError, useToasts } from '@/stores/data'
import { useModals, useNav } from '@/stores/nav'
import { InstanceIcon } from '@/components/InstanceIcon'
import { LoaderMark } from '@/components/LoaderMark'
import { Button, EmptyState } from '@/components/ui/ui'
import { DropMenu } from '@/components/ui/menu'
import { IconButton } from '@/components/ui/ui'
import { formatCount, timeAgo } from '@/lib/util'
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
  const busy = useInstanceBusy(inst.id)
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
          <span className="inline-flex min-w-0 items-center gap-1.5 truncate">
            <LoaderMark loader={inst.loader} size={14} className="shrink-0" />
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
            disabled={busy}
            data-testid={`play-${inst.id}`}
            className="group-hover:bg-accent group-hover:text-accent-contrast"
          >
            {busy ? 'Downloading…' : 'Play'}
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

function BestModpacks(): React.JSX.Element {
  const { go } = useNav()
  const openProject = useModals((s) => s.openProject)
  const [packs, setPacks] = useState<SearchHit[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    window.native.content
      .search({
        query: '',
        type: 'modpack',
        platform: 'modrinth',
        sort: 'downloads',
        offset: 0,
        limit: 3
      })
      .then((result) => {
        if (!cancelled) setPacks(result.hits.slice(0, 3))
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section className="mt-8" data-testid="best-modpacks">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <button
            className="group flex items-center gap-1 text-h2 font-bold text-content-primary hover:text-accent"
            onClick={() => go({ name: 'discover', contentType: 'modpack' })}
          >
            Best modpacks
            <ChevronRight size={20} className="transition-transform duration-fast group-hover:translate-x-0.5" />
          </button>
          <p className="mt-1 text-small text-content-secondary">Popular packs players love on Modrinth.</p>
        </div>
        <button
          className="text-small font-semibold text-content-secondary hover:text-accent"
          onClick={() => go({ name: 'discover', contentType: 'modpack' })}
        >
          Browse all
        </button>
      </div>

      {packs === null && !failed && (
        <div className="grid grid-cols-3 gap-4" aria-label="Loading best modpacks">
          {[0, 1, 2].map((key) => (
            <div key={key} className="h-40 animate-pulse rounded-card bg-surface-raised p-4">
              <div className="h-12 w-12 rounded-md2 bg-surface-input" />
              <div className="mt-4 h-4 w-2/3 rounded-full bg-surface-input" />
              <div className="mt-2 h-3 w-full rounded-full bg-surface-inset" />
            </div>
          ))}
        </div>
      )}

      {packs && packs.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          {packs.map((pack) => (
            <button
              key={pack.projectId}
              onClick={() =>
                openProject({ platform: 'modrinth', projectId: pack.projectId, instanceId: null })
              }
              className="group min-w-0 rounded-card bg-surface-raised p-4 text-left transition-all duration-fast hover:-translate-y-0.5 hover:bg-surface-hover hover:shadow-card"
              data-testid={`best-modpack-${pack.projectId}`}
            >
              <div className="flex items-start gap-3">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md2 bg-surface-inset text-content-muted">
                  {pack.icon ? (
                    <img src={pack.icon} alt="" loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <PackageOpen size={24} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-body font-bold text-content-primary group-hover:text-accent">
                    {pack.title}
                  </div>
                  <div className="mt-0.5 truncate text-tiny text-content-muted">by {pack.author}</div>
                  <div className="mt-2 inline-flex items-center gap-1 text-tiny font-semibold text-content-secondary">
                    <Download size={13} /> {formatCount(pack.downloads)}
                  </div>
                </div>
              </div>
              <p className="mt-3 line-clamp-2 text-small leading-relaxed text-content-secondary">
                {pack.description}
              </p>
            </button>
          ))}
        </div>
      )}

      {(failed || packs?.length === 0) && (
        <button
          onClick={() => go({ name: 'discover', contentType: 'modpack' })}
          className="flex w-full items-center justify-center gap-2 rounded-card bg-surface-raised px-4 py-8 text-body font-semibold text-content-secondary hover:bg-surface-hover hover:text-accent"
        >
          <PackageOpen size={20} /> Browse modpacks
        </button>
      )}
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
        .slice(0, 3),
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

      <BestModpacks />
    </div>
  )
}
