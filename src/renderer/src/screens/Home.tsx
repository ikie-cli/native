import { motion } from 'framer-motion'
import {
  ChevronRight,
  Clock,
  Download,
  MoreVertical,
  PackageOpen,
  Play,
  Plus,
  Server,
  Square
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { InstanceConfig, SearchHit, ServerEntry } from '@shared/types'
import { LOADER_LABELS } from '@shared/types'
import {
  useInstanceBusy,
  useInstances,
  useRunning,
  useServers,
  toastError,
  useToasts
} from '@/stores/data'
import { useModals, useNav } from '@/stores/nav'
import { InstanceIcon } from '@/components/InstanceIcon'
import { LoaderMark } from '@/components/LoaderMark'
import { Button, EmptyState } from '@/components/ui/ui'
import { DropMenu } from '@/components/ui/menu'
import { IconButton } from '@/components/ui/ui'
import { formatCount, formatPlaytime, timeAgo } from '@/lib/util'
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
    const query = (platform: 'modrinth' | 'curseforge') =>
      window.native.content.search({
        query: '',
        type: 'modpack',
        platform,
        sort: 'downloads',
        offset: 0,
        limit: 3
      })
    Promise.allSettled([query('modrinth'), query('curseforge')]).then((results) => {
      if (cancelled) return
      const modrinth = results[0].status === 'fulfilled' ? results[0].value.hits : []
      const curseforge = results[1].status === 'fulfilled' ? results[1].value.hits : []
      const mixed: SearchHit[] = []
      for (let i = 0; i < Math.max(modrinth.length, curseforge.length); i++) {
        if (modrinth[i]) mixed.push(modrinth[i])
        if (curseforge[i]) mixed.push(curseforge[i])
      }
      const unique = mixed.filter(
        (pack, index) =>
          mixed.findIndex((other) => other.title.toLowerCase() === pack.title.toLowerCase()) === index
      )
      setPacks(unique.slice(0, 4))
      setFailed(results.every((result) => result.status === 'rejected'))
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section className="mt-8" data-testid="best-modpacks">
      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          <div className="mb-1 text-tiny font-bold uppercase tracking-[0.16em] text-content-muted">Discover</div>
          <button
            className="group flex items-center gap-1 text-h2 font-bold text-content-primary hover:text-accent"
            onClick={() => go({ name: 'discover', contentType: 'modpack' })}
          >
            Best modpacks
            <ChevronRight size={20} className="transition-transform duration-fast group-hover:translate-x-0.5" />
          </button>
        </div>
        <button
          className="rounded-full px-3 py-1.5 text-small font-semibold text-content-secondary transition-colors hover:bg-surface-hover hover:text-content-primary"
          onClick={() => go({ name: 'discover', contentType: 'modpack' })}
        >
          Browse all
        </button>
      </div>

      {packs === null && !failed && (
        <div className="grid grid-cols-4 gap-4" aria-label="Loading best modpacks">
          {[0, 1, 2, 3].map((key) => (
            <div key={key} className="h-44 animate-pulse rounded-card border border-line-subtle bg-surface-raised p-4">
              <div className="h-12 w-12 rounded-md2 bg-surface-input" />
              <div className="mt-4 h-4 w-2/3 rounded-full bg-surface-input" />
              <div className="mt-2 h-3 w-full rounded-full bg-surface-inset" />
            </div>
          ))}
        </div>
      )}

      {packs && packs.length > 0 && (
        <div className="grid grid-cols-4 gap-4">
          {packs.map((pack) => (
            <button
              key={pack.projectId}
              onClick={() =>
                openProject({
                  platform: pack.platform,
                  projectId: pack.projectId,
                  instanceId: null,
                  projectType: 'modpack'
                })
              }
              className="group relative h-44 min-w-0 overflow-hidden rounded-card border border-line-subtle bg-surface-raised p-4 text-left transition-all duration-base hover:-translate-y-0.5 hover:border-line-strong hover:bg-surface-hover hover:shadow-popover"
              data-testid={`best-modpack-${pack.projectId}`}
            >
              {pack.icon && (
                <img
                  src={pack.icon}
                  alt=""
                  aria-hidden="true"
                  className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full object-cover opacity-[0.12] blur-2xl transition-transform duration-page group-hover:scale-110"
                />
              )}
              <div className="relative flex h-full flex-col">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md2 bg-surface-inset text-content-muted shadow-sm ring-1 ring-line-subtle">
                    {pack.icon ? (
                      <img src={pack.icon} alt="" loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      <PackageOpen size={22} />
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 pt-1 text-[11px] font-bold uppercase tracking-[0.1em] text-content-muted">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${pack.platform === 'modrinth' ? 'bg-[#1bd96a]' : 'bg-[#f16436]'}`}
                    />
                    {pack.platform === 'modrinth' ? 'Modrinth' : 'CurseForge'}
                  </div>
                </div>
                <div className="mt-3 min-w-0">
                  <div className="truncate text-body font-bold text-content-primary transition-colors group-hover:text-accent">
                    {pack.title}
                  </div>
                  <div className="mt-0.5 truncate text-tiny text-content-muted">{pack.author}</div>
                </div>
                <div className="mt-auto flex items-center justify-between text-tiny text-content-secondary">
                  <span className="inline-flex items-center gap-1.5 font-semibold">
                    <Download size={13} /> {formatCount(pack.downloads)}
                  </span>
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-input text-content-secondary transition-colors group-hover:bg-accent group-hover:text-accent-contrast">
                    <ChevronRight size={15} />
                  </span>
                </div>
              </div>
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

function RecentServers({ servers }: { servers: ServerEntry[] }): React.JSX.Element | null {
  const { go } = useNav()
  const push = useToasts((s) => s.push)
  const recent = [...servers]
    .filter((server) => server.lastPlayedAt !== null)
    .sort((a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0))
    .slice(0, 3)
  if (recent.length === 0) return null

  const join = (server: ServerEntry): void => {
    push({ kind: 'info', title: `Joining ${server.name}…` })
    window.native.servers.quickJoin(server.id).catch((err) =>
      toastError(err, `Couldn't join ${server.name}`)
    )
  }

  return (
    <section className="mt-7" data-testid="recent-servers">
      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          <div className="mb-1 text-tiny font-bold uppercase tracking-[0.16em] text-content-muted">Multiplayer</div>
          <button
            className="group flex items-center gap-1 text-h2 font-bold text-content-primary hover:text-accent"
            onClick={() => go({ name: 'servers' })}
          >
            Recent servers
            <ChevronRight size={20} className="transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>
        <button
          className="rounded-full px-3 py-1.5 text-small font-semibold text-content-secondary transition-colors hover:bg-surface-hover hover:text-content-primary"
          onClick={() => go({ name: 'servers' })}
        >
          View history
        </button>
      </div>
      <div className="grid grid-cols-3 divide-x divide-line-subtle overflow-hidden rounded-card border border-line-subtle bg-surface-raised">
        {recent.map((server) => (
          <button
            key={server.id}
            onClick={() => join(server)}
            className="group min-w-0 p-4 text-left transition-colors duration-fast hover:bg-surface-hover"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md2 bg-surface-inset text-content-muted ring-1 ring-line-subtle transition-colors group-hover:text-content-primary">
                <Server size={19} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-small font-bold text-content-primary">{server.name}</div>
                <div className="truncate text-tiny text-content-muted">{server.address}</div>
              </div>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-input text-content-secondary transition-colors group-hover:bg-accent group-hover:text-accent-contrast">
                <Play size={14} fill="currentColor" />
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-line-subtle pt-3 text-tiny">
              <span className="inline-flex min-w-0 items-center gap-1.5 truncate text-content-secondary">
                <Clock size={12} className="shrink-0" />
                {server.lastPlayedAt ? timeAgo(server.lastPlayedAt) : 'Not played'}
              </span>
              <span className="shrink-0 font-semibold text-content-primary">
                {formatPlaytime(server.totalPlayMs)} · {server.playCount}×
              </span>
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}

const RANKED_INSTANCE_MARKER = 'native-ranked:managed:v1'

function NativeRankedCard(): React.JSX.Element | null {
  const push = useToasts((s) => s.push)
  const { go } = useNav()
  const instances = useInstances((s) => s.instances)
  const refresh = useInstances((s) => s.refresh)
  const [installing, setInstalling] = useState(false)

  // Once the managed Native Ranked instance exists, the ad has done its job — hide it.
  if (instances.some((i) => i.notes?.includes(RANKED_INSTANCE_MARKER))) return null

  const install = (): void => {
    setInstalling(true)
    window.native.ranked
      .install()
      .then(async (res) => {
        await refresh()
        push({
          kind: 'success',
          title: 'Native Ranked installed',
          detail: `Launch “${res.name}” and sign in to play — premium accounts unlock ranked, offline accounts practice casually.`
        })
        go({ name: 'instance', id: res.instanceId, tab: 'content' })
      })
      .catch((err) => toastError(err, 'Could not install Native Ranked'))
      .finally(() => setInstalling(false))
  }

  return (
    <section className="mt-8" data-testid="native-ranked">
      <div className="flex items-center justify-between gap-4 overflow-hidden rounded-card border border-line-subtle bg-surface-raised px-5 py-4">
        <div className="min-w-0">
          <div className="text-tiny font-bold uppercase tracking-[0.16em] text-content-muted">Compete</div>
          <div className="mt-1 truncate text-body font-bold text-content-primary">
            Native Ranked — 1v1 same-seed speedrun races
          </div>
          <div className="mt-0.5 truncate text-small text-content-secondary">
            Elo matchmaking with seasons, live splits, and a global leaderboard — a standalone 1.16.1 Fabric mod.
          </div>
        </div>
        <Button onClick={install} disabled={installing} data-testid="ranked-install" className="shrink-0">
          {installing ? 'Installing…' : 'Install'}
        </Button>
      </div>
    </section>
  )
}

export function HomeScreen(): React.JSX.Element {
  const { instances, loaded } = useInstances()
  const servers = useServers((s) => s.servers)
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

      <NativeRankedCard />

      <BestModpacks />
      <RecentServers servers={servers} />
    </div>
  )
}
