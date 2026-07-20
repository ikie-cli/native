import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  Box,
  FileUp,
  Package,
  PlusCircle,
  Puzzle,
  Sparkles,
  Trash2
} from 'lucide-react'
import type { ContentKind, InstanceConfig, LocalContentFile } from '@shared/types'
import { useToasts, toastError } from '@/stores/data'
import { useNav } from '@/stores/nav'
import { Button, EmptyState, Spinner, Toggle } from '@/components/ui/ui'
import { PillTabs } from '@/components/ui/tabs'
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
  onDelete
}: {
  file: LocalContentFile
  onToggle: (v: boolean) => void
  onDelete: () => void
}): React.JSX.Element {
  return (
    <motion.div
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, height: 0 }}
      className="group flex items-center gap-3 rounded-md2 bg-surface-raised px-4 py-3 transition-colors duration-fast hover:bg-surface-hover"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm2 bg-surface-inset text-content-secondary">
        <Package size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`truncate text-body font-semibold ${file.enabled ? 'text-content-primary' : 'text-content-muted line-through'}`}>
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
  const { go } = useNav()
  const push = useToasts((s) => s.push)
  const scrollRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    setFiles(null)
    try {
      setFiles(await window.native.content.listLocal(inst.id, kind))
    } catch (err) {
      toastError(err)
      setFiles([])
    }
  }, [inst.id, kind])

  useEffect(() => {
    void load()
  }, [load])

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
        <div className="flex gap-2">
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
