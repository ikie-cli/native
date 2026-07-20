import { motion } from 'framer-motion'
import { LayoutGrid, List, Play, Plus, Search, Square } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { InstanceConfig, LoaderKind } from '@shared/types'
import { LOADER_LABELS } from '@shared/types'
import { useInstances, useRunning, useToasts, toastError } from '@/stores/data'
import { useModals, useNav } from '@/stores/nav'
import { InstanceIcon } from '@/components/InstanceIcon'
import { Button, Chip, EmptyState, IconButton, SearchInput } from '@/components/ui/ui'
import { Select } from '@/components/ui/menu'
import { InstanceKebab } from '@/screens/Home'
import { cn, formatPlaytime, timeAgo } from '@/lib/util'

type SortKey = 'recent' | 'name' | 'played'

function InstanceCard({ inst }: { inst: InstanceConfig }): React.JSX.Element {
  const { go } = useNav()
  const running = useRunning((s) => s.isRunning(inst.id))
  const push = useToasts((s) => s.push)

  const launch = (): void => {
    push({ kind: 'info', title: `Launching ${inst.name}…` })
    window.native.instances.launch(inst.id).catch((err) => toastError(err, `Couldn't launch ${inst.name}`))
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 500, damping: 40, mass: 0.8 }}
      whileHover={{ y: -3 }}
      className="group relative flex cursor-pointer flex-col overflow-hidden rounded-card bg-surface-raised transition-colors duration-fast hover:bg-surface-hover"
      onClick={() => go({ name: 'instance', id: inst.id, tab: 'content' })}
      data-testid="instance-card"
    >
      <div className="relative flex items-center justify-center bg-gradient-to-b from-surface-inset to-surface-raised pb-6 pt-8">
        <InstanceIcon icon={inst.icon} name={inst.name} size={80} />
        <motion.div
          className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 backdrop-blur-[1px] transition-opacity duration-fast group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation()
            running ? void window.native.instances.kill(inst.id) : launch()
          }}
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-contrast shadow-lg">
            {running ? <Square size={24} /> : <Play size={24} className="ml-0.5" />}
          </div>
        </motion.div>
        {running && (
          <span className="absolute right-3 top-3 h-3 w-3 rounded-full bg-accent shadow" title="Running" />
        )}
      </div>
      <div className="flex flex-1 flex-col p-3.5">
        <div className="truncate text-body font-bold text-content-primary">{inst.name}</div>
        <div className="mt-1 flex items-center gap-1.5">
          <Chip>{LOADER_LABELS[inst.loader]}</Chip>
          <Chip>{inst.mcVersion}</Chip>
        </div>
        <div className="mt-2 text-tiny text-content-muted">
          {inst.totalPlayMs > 0 ? `${formatPlaytime(inst.totalPlayMs)} played` : 'Never played'}
          {inst.lastPlayedAt ? ` · ${timeAgo(inst.lastPlayedAt)}` : ''}
        </div>
      </div>
      <div
        className="absolute right-2 top-2 opacity-0 transition-opacity duration-fast group-hover:opacity-100"
        onClick={(e) => e.stopPropagation()}
      >
        <InstanceKebab inst={inst} />
      </div>
    </motion.div>
  )
}

function InstanceRow({ inst }: { inst: InstanceConfig }): React.JSX.Element {
  const { go } = useNav()
  const running = useRunning((s) => s.isRunning(inst.id))
  const push = useToasts((s) => s.push)
  const launch = (): void => {
    push({ kind: 'info', title: `Launching ${inst.name}…` })
    window.native.instances.launch(inst.id).catch((err) => toastError(err, `Couldn't launch ${inst.name}`))
  }
  return (
    <div
      className="group flex cursor-pointer items-center gap-3 rounded-md2 bg-surface-raised px-3 py-2.5 transition-colors duration-fast hover:bg-surface-hover"
      onClick={() => go({ name: 'instance', id: inst.id, tab: 'content' })}
    >
      <InstanceIcon icon={inst.icon} name={inst.name} size={40} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-body font-semibold text-content-primary">{inst.name}</div>
        <div className="text-small text-content-secondary">
          {LOADER_LABELS[inst.loader]} {inst.mcVersion}
        </div>
      </div>
      <div className="text-small text-content-muted">
        {inst.totalPlayMs > 0 ? formatPlaytime(inst.totalPlayMs) : '—'}
      </div>
      <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-1">
        <IconButton
          icon={running ? Square : Play}
          label={running ? 'Stop' : 'Play'}
          variant={running ? 'danger' : 'input'}
          onClick={() => (running ? void window.native.instances.kill(inst.id) : launch())}
        />
        <InstanceKebab inst={inst} />
      </div>
    </div>
  )
}

export function LibraryScreen(): React.JSX.Element {
  const { instances, loaded } = useInstances()
  const setCreateOpen = useModals((s) => s.setCreateOpen)
  const [query, setQuery] = useState('')
  const [loader, setLoader] = useState<LoaderKind | 'all'>('all')
  const [sort, setSort] = useState<SortKey>('recent')
  const [view, setView] = useState<'grid' | 'list'>('grid')

  const filtered = useMemo(() => {
    let list = instances
    if (query.trim()) {
      const q = query.toLowerCase()
      list = list.filter((i) => i.name.toLowerCase().includes(q) || i.mcVersion.includes(q))
    }
    if (loader !== 'all') list = list.filter((i) => i.loader === loader)
    const sorted = [...list]
    if (sort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name))
    else if (sort === 'played') sorted.sort((a, b) => b.totalPlayMs - a.totalPlayMs)
    else sorted.sort((a, b) => (b.lastPlayedAt ?? b.createdAt) - (a.lastPlayedAt ?? a.createdAt))
    return sorted
  }, [instances, query, loader, sort])

  return (
    <div className="flex h-full flex-col p-6" data-testid="screen-library">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-display text-content-primary">Library</h1>
        <Button icon={Plus} onClick={() => setCreateOpen(true)} data-testid="library-create">
          New instance
        </Button>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <SearchInput
          placeholder="Search instances"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-64"
          data-testid="library-search"
        />
        <Select
          label="Loader"
          value={loader}
          onChange={setLoader}
          options={[
            { value: 'all', label: 'All' },
            { value: 'vanilla', label: 'Vanilla' },
            { value: 'fabric', label: 'Fabric' },
            { value: 'quilt', label: 'Quilt' },
            { value: 'forge', label: 'Forge' },
            { value: 'neoforge', label: 'NeoForge' }
          ]}
        />
        <Select
          label="Sort"
          value={sort}
          onChange={setSort}
          options={[
            { value: 'recent', label: 'Recently played' },
            { value: 'name', label: 'Name' },
            { value: 'played', label: 'Most played' }
          ]}
        />
        <div className="ml-auto flex items-center gap-1 rounded-full bg-surface-raised p-1">
          <IconButton
            icon={LayoutGrid}
            label="Grid view"
            variant={view === 'grid' ? 'input' : 'ghost'}
            onClick={() => setView('grid')}
            className={cn(view === 'grid' && 'bg-accent text-accent-contrast')}
          />
          <IconButton
            icon={List}
            label="List view"
            variant={view === 'list' ? 'input' : 'ghost'}
            onClick={() => setView('list')}
            className={cn(view === 'list' && 'bg-accent text-accent-contrast')}
          />
        </div>
      </div>

      <div className="mt-5 min-h-0 flex-1 overflow-y-auto">
        {loaded && instances.length === 0 && (
          <EmptyState
            icon={Plus}
            title="Your library is empty"
            detail="Create an instance to install Minecraft with the loader and mods you want."
            action={<Button icon={Plus} onClick={() => setCreateOpen(true)}>Create instance</Button>}
          />
        )}
        {instances.length > 0 && filtered.length === 0 && (
          <EmptyState icon={Search} title="No matches" detail="Try a different search or filter." />
        )}
        {view === 'grid' ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
            {filtered.map((inst) => (
              <InstanceCard key={inst.id} inst={inst} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((inst) => (
              <InstanceRow key={inst.id} inst={inst} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
