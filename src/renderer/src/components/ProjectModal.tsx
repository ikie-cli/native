import { useEffect, useState } from 'react'
import {
  Check,
  Download,
  ExternalLink,
  FileText,
  Globe,
  Heart,
  Images,
  ListOrdered,
  Package,
  ScrollText,
  User
} from 'lucide-react'
import type { ProjectDetails, ProjectVersion } from '@shared/types'
import { Modal } from '@/components/ui/modal'
import { Button, Chip, EmptyState, Spinner } from '@/components/ui/ui'
import { PillTabs } from '@/components/ui/tabs'
import { RichText } from '@/lib/richtext'
import { useInstances, useToasts, toastError } from '@/stores/data'
import { useModals } from '@/stores/nav'
import { formatCount, formatBytes, timeAgo } from '@/lib/util'

const TABS = [
  { id: 'description' as const, label: 'Description', icon: FileText },
  { id: 'versions' as const, label: 'Versions', icon: ListOrdered },
  { id: 'gallery' as const, label: 'Gallery', icon: Images }
]

function Stat({ icon: Icon, label }: { icon: typeof Download; label: string }): React.JSX.Element {
  return (
    <span className="inline-flex items-center gap-1.5 text-small text-content-secondary">
      <Icon size={14} />
      {label}
    </span>
  )
}

function VersionRow({
  v,
  installed,
  onInstall,
  busy
}: {
  v: ProjectVersion
  installed: boolean
  onInstall: () => void
  busy: boolean
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-3 rounded-md2 bg-surface-raised px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="truncate text-body font-semibold text-content-primary">{v.name}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-tiny text-content-muted">
          <span>{v.gameVersions.slice(0, 4).join(', ')}{v.gameVersions.length > 4 ? '…' : ''}</span>
          {v.loaders.length > 0 && <span className="capitalize">{v.loaders.join(', ')}</span>}
          <span>{formatBytes(v.fileSize)}</span>
          <span>{timeAgo(v.datePublished)}</span>
        </div>
      </div>
      {installed ? (
        <Button size="sm" variant="outline" icon={Check} disabled>
          Installed
        </Button>
      ) : (
        <Button size="sm" variant="secondary" icon={busy ? undefined : Download} onClick={onInstall} disabled={busy}>
          {busy ? <Spinner size={14} /> : 'Install'}
        </Button>
      )}
    </div>
  )
}

/**
 * Full project page: description / all versions / gallery, header stats and
 * external links, install straight from the version list.
 */
export function ProjectModal(): React.JSX.Element {
  const { projectRef, openProject } = useModals()
  const instances = useInstances((s) => s.instances)
  const push = useToasts((s) => s.push)

  const [details, setDetails] = useState<ProjectDetails | null>(null)
  const [versions, setVersions] = useState<ProjectVersion[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'description' | 'versions' | 'gallery'>('description')
  const [installingId, setInstallingId] = useState<string | null>(null)
  const [installedVersionIds, setInstalledVersionIds] = useState<Set<string>>(new Set())

  const instance = projectRef?.instanceId
    ? instances.find((i) => i.id === projectRef.instanceId) ?? null
    : null

  useEffect(() => {
    setDetails(null)
    setVersions(null)
    setError(null)
    setTab('description')
    setInstalledVersionIds(new Set())
    if (!projectRef) return
    let cancelled = false
    window.native.content
      .project(projectRef.platform, projectRef.projectId)
      .then((d) => !cancelled && setDetails(d))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : String(err)))
    // All versions — unfiltered so the list is complete; instance-compatible
    // ones are what Install uses.
    window.native.content
      .versions(projectRef.platform, projectRef.projectId, null, null)
      .then((v) => !cancelled && setVersions(v))
      .catch(() => !cancelled && setVersions([]))
    return () => {
      cancelled = true
    }
  }, [projectRef])

  const install = async (v: ProjectVersion): Promise<void> => {
    if (!projectRef || !details) return
    // Modpacks become a new instance instead of installing into one.
    if (details.projectType === 'modpack') {
      setInstallingId(v.id)
      try {
        const res = await window.native.packs.installModrinth({
          projectId: projectRef.projectId,
          version: v,
          displayName: details.title,
          iconUrl: details.icon
        })
        setInstalledVersionIds((prev) => new Set(prev).add(v.id))
        push({
          kind: 'success',
          title: `Installed ${details.title}`,
          detail: `Created instance ${res.instance.name}`
        })
      } catch (err) {
        toastError(err, `Couldn't install ${details.title}`)
      } finally {
        setInstallingId(null)
      }
      return
    }
    if (!instance) {
      push({ kind: 'error', title: 'Pick an instance in Discover first' })
      return
    }
    setInstallingId(v.id)
    try {
      const kind =
        details.projectType === 'resourcepack'
          ? ('resourcepack' as const)
          : details.projectType === 'shader'
            ? ('shaderpack' as const)
            : ('mod' as const)
      await window.native.content.install({
        instanceId: instance.id,
        platform: projectRef.platform,
        projectId: projectRef.projectId,
        version: v,
        kind,
        displayName: details.title,
        mcVersion: instance.mcVersion,
        loader: instance.loader === 'vanilla' ? null : instance.loader,
        iconUrl: details.icon
      })
      setInstalledVersionIds((prev) => new Set(prev).add(v.id))
      push({ kind: 'success', title: `Installed ${details.title}`, detail: `Added to ${instance.name}` })
    } catch (err) {
      toastError(err, `Couldn't install ${details.title}`)
    } finally {
      setInstallingId(null)
    }
  }

  const links = details
    ? ([
        ['Website', details.links.website, Globe],
        ['Source', details.links.source, ExternalLink],
        ['Issues', details.links.issues, ExternalLink],
        ['Wiki', details.links.wiki, ScrollText]
      ] as const).filter(([, url]) => url)
    : []

  return (
    <Modal
      open={projectRef !== null}
      onClose={() => openProject(null)}
      width={780}
      bodyClassName="p-0"
      title={
        details ? (
          <span className="flex min-w-0 items-center gap-3">
            <span className="h-10 w-10 shrink-0 overflow-hidden rounded-md2 bg-surface-raised">
              {details.icon ? (
                <img src={details.icon} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-content-muted">
                  <Package size={20} />
                </span>
              )}
            </span>
            <span className="truncate">{details.title}</span>
          </span>
        ) : (
          'Loading…'
        )
      }
    >
      <div data-testid="project-modal" className="flex h-[62vh] flex-col">
        {error && (
          <EmptyState icon={Package} title="Couldn't load project" detail={error} />
        )}
        {!error && !details && (
          <div className="flex flex-1 items-center justify-center">
            <Spinner size={28} />
          </div>
        )}
        {details && (
          <>
            <div className="shrink-0 border-b border-line-subtle bg-surface-base px-6 py-4">
              <p className="text-small leading-relaxed text-content-secondary">{details.summary}</p>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                {details.author && <Stat icon={User} label={details.author} />}
                <Stat icon={Download} label={`${formatCount(details.downloads)} downloads`} />
                <Stat icon={Heart} label={formatCount(details.follows)} />
                <span className="text-small text-content-muted">Updated {timeAgo(details.updated)}</span>
                {details.license && <Chip>{details.license}</Chip>}
                <span className="ml-auto flex items-center gap-1">
                  {links.map(([label, url, Icon]) => (
                    <button
                      key={label}
                      title={label}
                      onClick={() => void window.native.app.openExternal(url!)}
                      className="flex h-8 w-8 items-center justify-center rounded-full text-content-muted transition-colors hover:bg-surface-hover hover:text-content-primary"
                    >
                      <Icon size={16} />
                    </button>
                  ))}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <PillTabs items={TABS} value={tab} onChange={setTab} size="sm" />
                {instance && (
                  <span className="truncate text-tiny text-content-muted">
                    Installing to {instance.name} ({instance.mcVersion})
                  </span>
                )}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-6">
              {tab === 'description' && (
                <RichText body={details.body || details.summary} format={details.bodyFormat} />
              )}
              {tab === 'versions' && (
                <div className="flex flex-col gap-2">
                  {versions === null && (
                    <div className="flex justify-center py-10">
                      <Spinner size={24} />
                    </div>
                  )}
                  {versions && versions.length === 0 && (
                    <EmptyState icon={ListOrdered} title="No versions found" />
                  )}
                  {versions?.slice(0, 100).map((v) => (
                    <VersionRow
                      key={v.id}
                      v={v}
                      installed={installedVersionIds.has(v.id)}
                      busy={installingId === v.id}
                      onInstall={() => void install(v)}
                    />
                  ))}
                  {versions && versions.length > 100 && (
                    <p className="py-2 text-center text-tiny text-content-muted">
                      Showing the 100 most recent versions.
                    </p>
                  )}
                </div>
              )}
              {tab === 'gallery' && (
                <>
                  {details.gallery.length === 0 && <EmptyState icon={Images} title="No images" />}
                  <div className="grid grid-cols-2 gap-3">
                    {details.gallery.map((url) => (
                      <button
                        key={url}
                        onClick={() => void window.native.app.openExternal(url)}
                        className="aspect-video overflow-hidden rounded-md2 bg-surface-raised"
                      >
                        <img src={url} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-page hover:scale-105" />
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
