import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Download, ExternalLink, Loader2, PackageSearch, ThumbsUp } from 'lucide-react'
import type {
  InstanceConfig,
  ProjectType,
  ProjectVersion,
  SearchHit,
  SearchResult
} from '@shared/types'
import { useInstances, useToasts, toastError } from '@/stores/data'
import { useModals, useNav } from '@/stores/nav'
import { Button, EmptyState, SearchInput, Spinner } from '@/components/ui/ui'
import { PillTabs } from '@/components/ui/tabs'
import { Select } from '@/components/ui/menu'
import { formatCount, timeAgo } from '@/lib/util'
import { Boxes, Layers, Package, Sparkles } from 'lucide-react'

const TYPE_TABS = [
  { id: 'mod' as const, label: 'Mods', icon: Package },
  { id: 'modpack' as const, label: 'Modpacks', icon: Layers },
  { id: 'resourcepack' as const, label: 'Resource Packs', icon: Boxes },
  { id: 'shader' as const, label: 'Shaders', icon: Sparkles }
]

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

function InstallButton({
  hit,
  instance,
  installed,
  onInstalled
}: {
  hit: SearchHit
  instance: InstanceConfig | null
  installed: boolean
  onInstalled: (projectId: string) => void
}): React.JSX.Element {
  const push = useToasts((s) => s.push)
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle')

  if (installed && state === 'idle') {
    return (
      <Button size="sm" variant="outline" icon={Check} disabled data-testid={`install-${hit.projectId}`}>
        Installed
      </Button>
    )
  }

  const install = async (): Promise<void> => {
    if (!instance) {
      push({ kind: 'error', title: 'Pick an instance first', detail: 'Choose where to install above.' })
      return
    }
    setState('loading')
    try {
      const loader = instance.loader === 'vanilla' ? null : instance.loader
      const versions = await window.native.content.versions(
        hit.platform,
        hit.projectId,
        instance.mcVersion,
        hit.type === 'mod' ? loader : null
      )
      const version: ProjectVersion | undefined = versions[0]
      if (!version) {
        push({
          kind: 'error',
          title: 'No compatible version',
          detail: `${hit.title} has no build for ${instance.loader} ${instance.mcVersion}.`
        })
        setState('idle')
        return
      }
      const kind = hit.type === 'shader' ? 'shaderpack' : hit.type === 'resourcepack' ? 'resourcepack' : 'mod'
      await window.native.content.install({
        instanceId: instance.id,
        platform: hit.platform,
        projectId: hit.projectId,
        version,
        kind,
        displayName: hit.title,
        mcVersion: instance.mcVersion,
        loader,
        iconUrl: hit.icon
      })
      setState('done')
      onInstalled(hit.projectId)
      push({ kind: 'success', title: `Installed ${hit.title}`, detail: `Added to ${instance.name}` })
    } catch (err) {
      toastError(err, `Couldn't install ${hit.title}`)
      setState('idle')
    }
  }

  return (
    <Button
      size="sm"
      variant={state === 'done' ? 'outline' : 'secondary'}
      icon={state === 'loading' ? undefined : state === 'done' ? Check : Download}
      onClick={install}
      disabled={state !== 'idle'}
      data-testid={`install-${hit.projectId}`}
    >
      {state === 'loading' ? <Spinner size={16} /> : state === 'done' ? 'Installed' : 'Install'}
    </Button>
  )
}

/** Modpacks install as a brand-new instance (Modrinth .mrpack). */
function InstallPackButton({ hit }: { hit: SearchHit }): React.JSX.Element {
  const push = useToasts((s) => s.push)
  const { go } = useNav()
  const openProject = useModals((s) => s.openProject)
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle')

  if (hit.platform === 'curseforge') {
    return (
      <Button
        size="sm"
        variant="secondary"
        icon={ExternalLink}
        onClick={() =>
          openProject({
            platform: hit.platform,
            projectId: hit.projectId,
            instanceId: null,
            projectType: 'modpack'
          })
        }
      >
        View
      </Button>
    )
  }

  const install = async (): Promise<void> => {
    setState('loading')
    try {
      const versions = await window.native.content.versions(hit.platform, hit.projectId, null, null)
      const version: ProjectVersion | undefined = versions[0]
      if (!version) {
        push({ kind: 'error', title: 'No installable version', detail: `${hit.title} has no pack files.` })
        setState('idle')
        return
      }
      push({ kind: 'info', title: `Installing ${hit.title}…`, detail: 'Creating a new instance' })
      const res = await window.native.packs.installModrinth({
        projectId: hit.projectId,
        version,
        displayName: hit.title,
        iconUrl: hit.icon
      })
      setState('done')
      push({
        kind: 'success',
        title: `Installed ${hit.title}`,
        detail: `Created instance ${res.instance.name}`
      })
      go({ name: 'instance', id: res.instance.id, tab: 'content' })
    } catch (err) {
      toastError(err, `Couldn't install ${hit.title}`)
      setState('idle')
    }
  }

  return (
    <Button
      size="sm"
      variant={state === 'done' ? 'outline' : 'secondary'}
      icon={state === 'loading' ? undefined : state === 'done' ? Check : Download}
      onClick={install}
      disabled={state !== 'idle'}
      data-testid={`install-${hit.projectId}`}
    >
      {state === 'loading' ? <Spinner size={16} /> : state === 'done' ? 'Installed' : 'Install'}
    </Button>
  )
}

function HitCard({
  hit,
  instance,
  installed,
  onInstalled
}: {
  hit: SearchHit
  instance: InstanceConfig | null
  installed: boolean
  onInstalled: (projectId: string) => void
}): React.JSX.Element {
  const openProject = useModals((s) => s.openProject)
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="flex gap-4 rounded-card bg-surface-raised p-4 transition-colors duration-fast hover:bg-surface-hover"
    >
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md2 bg-surface-inset">
        {hit.icon ? (
          <img src={hit.icon} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-content-muted">
            <Package size={26} />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <button
              className="truncate text-body font-bold text-content-primary hover:text-accent"
              onClick={() =>
                openProject({
                  platform: hit.platform,
                  projectId: hit.projectId,
                  instanceId: instance?.id ?? null,
                  projectType: hit.type
                })
              }
              data-testid={`open-project-${hit.projectId}`}
            >
              {hit.title}
            </button>
            <span className="ml-2 text-tiny text-content-muted">by {hit.author}</span>
          </div>
          {hit.type === 'modpack' ? (
            <InstallPackButton hit={hit} />
          ) : (
            <InstallButton hit={hit} instance={instance} installed={installed} onInstalled={onInstalled} />
          )}
        </div>
        <p className="mt-1 line-clamp-2 text-small text-content-secondary">{hit.description}</p>
        <div className="mt-2 flex items-center gap-3 text-tiny text-content-muted">
          <span className="inline-flex items-center gap-1">
            <Download size={13} /> {formatCount(hit.downloads)}
          </span>
          <span className="inline-flex items-center gap-1">
            <ThumbsUp size={13} /> {formatCount(hit.follows)}
          </span>
          <span>Updated {timeAgo(hit.updated)}</span>
          <span className="ml-auto rounded-full bg-surface-inset px-2 py-0.5 capitalize">{hit.platform}</span>
        </div>
      </div>
    </motion.div>
  )
}

export function DiscoverScreen({
  instanceId,
  contentType = 'mod'
}: {
  instanceId?: string
  contentType?: ProjectType
}): React.JSX.Element {
  const instances = useInstances((s) => s.instances)
  const [selectedId, setSelectedId] = useState<string | null>(instanceId ?? instances[0]?.id ?? null)
  const instance = instances.find((i) => i.id === selectedId) ?? null

  const [type, setType] = useState<ProjectType>(contentType)
  const [platform, setPlatform] = useState<'modrinth' | 'curseforge'>('modrinth')
  const [sort, setSort] = useState<'relevance' | 'downloads' | 'follows' | 'newest'>('relevance')
  const [query, setQuery] = useState('')
  const debounced = useDebounced(query, 350)
  // Modpack installs create their own instance, so no instance filter applies.
  const isPack = type === 'modpack'

  const [result, setResult] = useState<SearchResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [installedIds, setInstalledIds] = useState<Set<string>>(new Set())
  const scrollRef = useRef<HTMLDivElement>(null)

  // Mark search results already present in the selected instance, and keep the
  // set fresh when content changes elsewhere (Content tab deletes, installs).
  useEffect(() => {
    let cancelled = false
    const refresh = (): void => {
      if (!selectedId) {
        setInstalledIds(new Set())
        return
      }
      window.native.content
        .installedProjects(selectedId)
        .then((ids) => !cancelled && setInstalledIds(new Set(ids)))
        .catch(() => undefined)
    }
    refresh()
    const off = window.native.content.onLocalChanged((instanceId) => {
      if (instanceId === selectedId) refresh()
    })
    return () => {
      cancelled = true
      off()
    }
  }, [selectedId])

  const search = useCallback(
    async (offset: number) => {
      setLoading(true)
      setError(null)
      try {
        const res = await window.native.content.search({
          query: debounced,
          type,
          platform,
          sort,
          mcVersion: type === 'modpack' ? null : (instance?.mcVersion ?? null),
          loader: type === 'mod' && instance && instance.loader !== 'vanilla' ? instance.loader : null,
          offset,
          limit: 20
        })
        setResult((prev) =>
          offset > 0 && prev ? { ...res, hits: [...prev.hits, ...res.hits] } : res
        )
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    },
    [debounced, type, platform, sort, instance]
  )

  useEffect(() => {
    void search(0)
  }, [search])

  const hits = result?.hits ?? []
  const canLoadMore = result ? hits.length < result.total : false

  return (
    <div className="flex h-full flex-col p-6" data-testid="screen-discover">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-display text-content-primary">Discover content</h1>
        {!isPack && (
          <div className="flex items-center gap-2">
            <span className="text-small text-content-secondary">Install to</span>
            <Select
              value={selectedId ?? ''}
              onChange={(v) => setSelectedId(v)}
              minWidth={200}
              options={
                instances.length
                  ? instances.map((i) => ({ value: i.id, label: `${i.name} (${i.mcVersion})` }))
                  : [{ value: '', label: 'No instances' }]
              }
            />
          </div>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <PillTabs items={TYPE_TABS} value={type} onChange={setType} />
        <div className="ml-auto flex items-center gap-3">
          <Select
            value={platform}
            onChange={setPlatform}
            options={[
              { value: 'modrinth', label: 'Modrinth' },
              { value: 'curseforge', label: 'CurseForge' }
            ]}
          />
          <Select
            label="Sort"
            value={sort}
            onChange={setSort}
            options={[
              { value: 'relevance', label: 'Relevance' },
              { value: 'downloads', label: 'Downloads' },
              { value: 'follows', label: 'Follows' },
              { value: 'newest', label: 'Newest' }
            ]}
          />
        </div>
      </div>

      <SearchInput
        placeholder={`Search ${
          type === 'mod'
            ? 'mods'
            : type === 'modpack'
              ? 'modpacks'
              : type === 'shader'
                ? 'shaders'
                : 'resource packs'
        }…`}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mt-3"
        data-testid="discover-search"
        autoFocus
      />

      {isPack ? (
        <div className="mt-2 text-small text-content-muted">
          {platform === 'modrinth'
            ? "Installing a modpack creates a new instance with the pack's loader and version."
            : 'CurseForge packs are browsable here and open on CurseForge for installation.'}
        </div>
      ) : (
        instance && (
          <div className="mt-2 text-small text-content-muted">
            Showing results compatible with{' '}
            {instance.loader !== 'vanilla' ? `${instance.loader} ` : ''}
            {instance.mcVersion}
          </div>
        )
      )}

      <div ref={scrollRef} className="mt-4 min-h-0 flex-1 overflow-y-auto">
        {error && (
          <EmptyState
            icon={PackageSearch}
            title="Search unavailable"
            detail={error}
            action={<Button onClick={() => void search(0)}>Retry</Button>}
          />
        )}
        {!error && (
          <div className="flex flex-col gap-3">
            <AnimatePresence mode="popLayout">
              {hits.map((hit) => (
                <HitCard
                  key={`${hit.platform}:${hit.projectId}`}
                  hit={hit}
                  instance={instance}
                  installed={installedIds.has(hit.projectId)}
                  onInstalled={(pid) => setInstalledIds((prev) => new Set(prev).add(pid))}
                />
              ))}
            </AnimatePresence>
            {loading && (
              <div className="flex justify-center py-6">
                <Spinner size={24} />
              </div>
            )}
            {!loading && hits.length === 0 && (
              <EmptyState icon={PackageSearch} title="No results" detail="Try a different search or platform." />
            )}
            {canLoadMore && !loading && (
              <Button variant="secondary" icon={Loader2} onClick={() => void search(hits.length)} className="mx-auto">
                Load more
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
