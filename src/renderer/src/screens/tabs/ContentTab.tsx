import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  Box,
  CircleArrowUp,
  FileUp,
  Package,
  PlusCircle,
  Puzzle,
  RefreshCw,
  Sparkles,
  Trash2
} from 'lucide-react'
import type { ContentKind, InstanceConfig, LocalContentFile } from '@shared/types'
import { useContentUpdates, useToasts, useUpdateCount, toastError } from '@/stores/data'
import { useModals, useNav } from '@/stores/nav'
import { Button, EmptyState, IconButton, Spinner, Toggle } from '@/components/ui/ui'
import { PillTabs } from '@/components/ui/tabs'
import { Tooltip } from '@/components/ui/tooltip'
import { formatBytes } from '@/lib/util'

const KIND_TABS = [
  { id: 'mod' as const, label: 'Mods', icon: Puzzle },
  { id: 'resourcepack' as const, label: 'Resource Packs', icon: Box },
  { id: 'shaderpack' as const, label: 'Shaders', icon: Sparkles }
]

const KIND_FILTERS: Record<ContentKind, { name: string; extensions: string[] }[]> = {
  mod: [{ name: 'Mod', extensions: ['jar'] }],
  resourcepack: [{ name: 'Resource pack', extensions: ['zip'] }],
  shaderpack: [{ name: 'Shader pack', extensions: ['zip'] }]
}

function ContentRow({
  file,
  onToggle,
  onDelete,
  onOpen,
  onUpdate,
  updating
}: {
  file: LocalContentFile
  onToggle: (v: boolean) => void
  onDelete: () => void
  onOpen: (() => void) | null
  onUpdate: (() => void) | null
  updating: boolean
}): React.JSX.Element {
  return (
    <motion.div
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, height: 0 }}
      className="group flex items-center gap-3 rounded-md2 bg-surface-raised px-4 py-3 transition-colors duration-fast hover:bg-surface-hover"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-sm2 bg-surface-inset text-content-secondary">
        {file.icon ? (
          <img
            src={file.icon}
            alt=""
            className={`h-full w-full object-cover ${file.enabled ? '' : 'opacity-40 grayscale'}`}
          />
        ) : (
          <Package size={18} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            onClick={onOpen ?? undefined}
            className={`truncate text-body font-semibold ${file.enabled ? 'text-content-primary' : 'text-content-muted line-through'} ${onOpen ? 'cursor-pointer hover:text-accent hover:underline' : ''}`}
          >
            {file.meta?.name ?? file.fileName}
          </span>
          {file.meta?.version && (
            <span className="shrink-0 text-tiny text-content-muted">{file.meta.version}</span>
          )}
        </div>
        <div className="truncate text-tiny text-content-muted">
          {file.fileName} · {formatBytes(file.sizeBytes)}
        </div>
      </div>
      {file.update && onUpdate && (
        <Tooltip
          label={`${file.meta?.version ?? 'installed'} → ${file.update.versionNumber}`}
          side="top"
        >
          <Button
            size="sm"
            icon={updating ? undefined : CircleArrowUp}
            onClick={onUpdate}
            disabled={updating}
            data-testid={`update-${file.fileName}`}
          >
            {updating ? <Spinner size={14} /> : 'Update'}
          </Button>
        </Tooltip>
      )}
      <Toggle checked={file.enabled} onChange={onToggle} label={`Enable ${file.fileName}`} />
      <button
        aria-label={`Delete ${file.fileName}`}
        onClick={onDelete}
        className="flex h-8 w-8 items-center justify-center rounded-full text-content-muted opacity-0 transition-all duration-fast hover:bg-danger hover:text-white group-hover:opacity-100"
      >
        <Trash2 size={16} />
      </button>
    </motion.div>
  )
}

export function ContentTab({ inst }: { inst: InstanceConfig }): React.JSX.Element {
  const [kind, setKind] = useState<ContentKind>('mod')
  const [files, setFiles] = useState<LocalContentFile[] | null>(null)
  const [checking, setChecking] = useState(false)
  const [updatingAll, setUpdatingAll] = useState(false)
  const [updatingFiles, setUpdatingFiles] = useState<Set<string>>(new Set())
  const updateCount = useUpdateCount(inst.id)
  const { go } = useNav()
  const openProject = useModals((s) => s.openProject)
  const push = useToasts((s) => s.push)
  const scrollRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      setFiles(await window.native.content.listLocal(inst.id, kind))
    } catch (err) {
      toastError(err)
      setFiles([])
    }
  }, [inst.id, kind])

  useEffect(() => {
    setFiles(null)
    void load()
  }, [load])

  // Installs/updates/removals elsewhere (Discover, project modal, updater)
  // land here live.
  useEffect(() => {
    return window.native.content.onLocalChanged((id) => {
      if (id === inst.id) void load()
    })
  }, [inst.id, load])

  const checkNow = async (): Promise<void> => {
    setChecking(true)
    try {
      const res = await useContentUpdates.getState().check(inst.id, { force: true })
      if (res?.fromCache) {
        push({
          kind: 'info',
          title: "Couldn't reach the update servers",
          detail: 'Showing the last known results.'
        })
      } else if (res && res.updates.length === 0) {
        push({ kind: 'success', title: 'Everything is up to date' })
      }
      await load()
    } finally {
      setChecking(false)
    }
  }

  const updateOne = async (file: LocalContentFile): Promise<void> => {
    setUpdatingFiles((s) => new Set(s).add(file.fileName))
    try {
      await window.native.content.applyUpdate(inst.id, kind, file.fileName)
      push({ kind: 'success', title: `Updated ${file.meta?.name ?? file.fileName}` })
    } catch (err) {
      toastError(err, `Couldn't update ${file.meta?.name ?? file.fileName}`)
    } finally {
      setUpdatingFiles((s) => {
        const next = new Set(s)
        next.delete(file.fileName)
        return next
      })
    }
  }

  const updateAllNow = async (): Promise<void> => {
    setUpdatingAll(true)
    try {
      const res = await window.native.content.updateAll(inst.id)
      if (res.failed.length > 0) {
        push({
          kind: 'error',
          title: `Updated ${res.applied}, ${res.failed.length} failed`,
          detail: res.failed.map((f) => f.fileName).join(', ')
        })
      } else if (res.applied > 0) {
        push({ kind: 'success', title: `Updated ${res.applied} item${res.applied === 1 ? '' : 's'}` })
      }
    } catch (err) {
      toastError(err, "Couldn't update content")
    } finally {
      setUpdatingAll(false)
    }
  }

  const rows = files ?? []
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 68,
    overscan: 8
  })

  const addFromDisk = async (): Promise<void> => {
    const picked = await window.native.app.pickFile({
      title: `Add ${kind}`,
      filters: KIND_FILTERS[kind],
      multi: true
    })
    if (picked.length === 0) return
    const n = await window.native.content.addLocalFiles(inst.id, kind, picked)
    push({ kind: 'success', title: `Added ${n} file${n === 1 ? '' : 's'}` })
    void load()
  }

  return (
    <div className="flex h-full flex-col px-6 pb-6">
      <div className="flex items-center justify-between gap-3 py-1">
        <PillTabs items={KIND_TABS} value={kind} onChange={setKind} size="sm" />
        <div className="flex items-center gap-2">
          {updateCount > 0 && (
            <Button
              size="sm"
              icon={updatingAll ? undefined : CircleArrowUp}
              onClick={updateAllNow}
              disabled={updatingAll}
              data-testid="content-update-all"
            >
              {updatingAll ? <Spinner size={14} /> : `Update all (${updateCount})`}
            </Button>
          )}
          <Tooltip label="Check for updates" side="top">
            <IconButton
              icon={RefreshCw}
              label="Check for updates"
              onClick={() => void checkNow()}
              className={checking ? 'animate-spin' : undefined}
              data-testid="content-check-updates"
            />
          </Tooltip>
          <Button
            size="sm"
            variant="secondary"
            icon={FileUp}
            onClick={() => void addFromDisk().catch(toastError)}
          >
            Add file
          </Button>
          <Button
            size="sm"
            icon={PlusCircle}
            onClick={() => go({ name: 'discover', instanceId: inst.id })}
            data-testid="content-discover"
          >
            Find content
          </Button>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-small text-content-muted">
        <span>
          {rows.length} {rows.length === 1 ? 'item' : 'items'}
          {rows.some((f) => !f.enabled) && ` · ${rows.filter((f) => !f.enabled).length} disabled`}
        </span>
      </div>

      <div ref={scrollRef} className="mt-2 min-h-0 flex-1 overflow-y-auto">
        {files === null && (
          <div className="flex justify-center py-10">
            <Spinner size={24} />
          </div>
        )}
        {files && rows.length === 0 && (
          <EmptyState
            icon={Puzzle}
            title={`No ${KIND_TABS.find((t) => t.id === kind)!.label.toLowerCase()} yet`}
            detail={
              kind === 'mod' && inst.loader === 'vanilla'
                ? 'This is a vanilla instance. Switch to a mod loader in Options to add mods.'
                : 'Find content from Modrinth, or add files from your computer.'
            }
            action={
              <Button icon={PlusCircle} onClick={() => go({ name: 'discover', instanceId: inst.id })}>
                Find content
              </Button>
            }
          />
        )}
        {files && rows.length > 0 && (
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            <AnimatePresence initial={false}>
              {virtualizer.getVirtualItems().map((vi) => {
                const file = rows[vi.index]
                return (
                  <div
                    key={file.fileName}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${vi.start}px)`,
                      paddingBottom: 8
                    }}
                    ref={virtualizer.measureElement}
                    data-index={vi.index}
                  >
                    <ContentRow
                      file={file}
                      onUpdate={file.update ? () => void updateOne(file) : null}
                      updating={updatingFiles.has(file.fileName)}
                      onOpen={
                        file.meta?.projectId
                          ? () =>
                              openProject({
                                platform: file.meta?.platform ?? 'modrinth',
                                projectId: file.meta!.projectId!,
                                instanceId: inst.id
                              })
                          : null
                      }
                      onToggle={(v) => {
                        setFiles((prev) =>
                          prev!.map((f) => (f.fileName === file.fileName ? { ...f, enabled: v } : f))
                        )
                        window.native.content
                          .toggle(inst.id, kind, file.fileName, v)
                          .catch((err) => {
                            toastError(err)
                            void load()
                          })
                      }}
                      onDelete={() => {
                        if (!window.confirm(`Delete ${file.fileName}?`)) return
                        setFiles((prev) => prev!.filter((f) => f.fileName !== file.fileName))
                        window.native.content
                          .removeLocal(inst.id, kind, file.fileName)
                          .catch((err) => {
                            toastError(err)
                            void load()
                          })
                      }}
                    />
                  </div>
                )
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  )
}
