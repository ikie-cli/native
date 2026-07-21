import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ChevronRight,
  File,
  FileText,
  Folder,
  FolderOpen,
  Trash2,
  X
} from 'lucide-react'
import type { FileEntry, InstanceConfig } from '@shared/types'
import { toastError, useToasts } from '@/stores/data'
import { IconButton, Spinner } from '@/components/ui/ui'
import { cn, formatBytes, timeAgo } from '@/lib/util'

/** Files we can preview inline — mirrors FilesService.readText's allow-list. */
const TEXT_PREVIEW_RE = /\.(txt|json|properties|toml|log|yml|cfg)$/i

function joinRel(dir: string, name: string): string {
  return dir === '' ? name : `${dir}/${name}`
}

function Breadcrumbs({
  instName,
  path,
  onNavigate
}: {
  instName: string
  path: string
  onNavigate: (rel: string) => void
}): React.JSX.Element {
  const segments = path === '' ? [] : path.split('/')
  return (
    <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto scrollbar-none whitespace-nowrap">
      <button
        onClick={() => onNavigate('')}
        className={cn(
          'flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-small font-semibold transition-colors duration-fast',
          path === ''
            ? 'text-content-primary'
            : 'text-content-secondary hover:bg-surface-hover hover:text-content-primary'
        )}
      >
        <FolderOpen size={15} strokeWidth={2} />
        {instName}
      </button>
      {segments.map((seg, i) => {
        const target = segments.slice(0, i + 1).join('/')
        const last = i === segments.length - 1
        return (
          <span key={target} className="flex shrink-0 items-center gap-0.5">
            <ChevronRight size={14} className="shrink-0 text-content-muted" />
            <button
              onClick={() => onNavigate(target)}
              disabled={last}
              className={cn(
                'rounded-full px-2.5 py-1 text-small font-semibold transition-colors duration-fast',
                last
                  ? 'text-content-primary'
                  : 'text-content-secondary hover:bg-surface-hover hover:text-content-primary'
              )}
            >
              {seg}
            </button>
          </span>
        )
      })}
    </div>
  )
}

function FileRow({
  entry,
  compact,
  onOpen,
  onPreview,
  onReveal,
  onDelete
}: {
  entry: FileEntry
  compact: boolean
  onOpen: () => void
  onPreview: (() => void) | null
  onReveal: () => void
  onDelete: () => void
}): React.JSX.Element {
  return (
    <motion.div
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, height: 0 }}
      onDoubleClick={onOpen}
      onClick={onPreview ?? undefined}
      className={cn(
        'group flex select-none items-center gap-3 rounded-md2 bg-surface-raised px-4 py-2.5 transition-colors duration-fast hover:bg-surface-hover',
        (entry.dir || onPreview) && 'cursor-pointer'
      )}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm2 bg-surface-inset">
        {entry.dir ? (
          <Folder size={18} className="text-accent" />
        ) : TEXT_PREVIEW_RE.test(entry.name) ? (
          <FileText size={18} className="text-content-secondary" />
        ) : (
          <File size={18} className="text-content-muted" />
        )}
      </div>
      <div className="min-w-0 flex-1 truncate text-body font-semibold text-content-primary">
        {entry.name}
      </div>
      <div className="w-20 shrink-0 text-right text-small tabular-nums text-content-muted">
        {entry.dir ? '—' : formatBytes(entry.size)}
      </div>
      {!compact && (
        <div className="w-36 shrink-0 text-right text-small text-content-muted">
          {timeAgo(entry.mtimeMs)}
        </div>
      )}
      <div className="flex w-[72px] shrink-0 items-center justify-end gap-1 opacity-0 transition-opacity duration-fast group-hover:opacity-100">
        <button
          aria-label={`Reveal ${entry.name} in folder`}
          title="Reveal in folder"
          onClick={(e) => {
            e.stopPropagation()
            onReveal()
          }}
          className="flex h-8 w-8 items-center justify-center rounded-full text-content-muted transition-colors duration-fast hover:bg-surface-active hover:text-content-primary"
        >
          <FolderOpen size={16} />
        </button>
        <button
          aria-label={`Delete ${entry.name}`}
          title="Delete"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className="flex h-8 w-8 items-center justify-center rounded-full text-content-muted transition-colors duration-fast hover:bg-danger hover:text-white"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </motion.div>
  )
}

export function FilesTab({ inst }: { inst: InstanceConfig }): React.JSX.Element {
  const [path, setPath] = useState('')
  const [entries, setEntries] = useState<FileEntry[] | null>(null)
  const [preview, setPreview] = useState<{ rel: string; name: string; text: string } | null>(null)
  const push = useToasts((s) => s.push)

  const load = useCallback(async () => {
    setEntries(null)
    try {
      setEntries(await window.native.files.list(inst.id, path))
    } catch (err) {
      toastError(err)
      setEntries([])
    }
  }, [inst.id, path])

  useEffect(() => {
    void load()
  }, [load])

  const navigate = (rel: string): void => {
    setPreview(null)
    setPath(rel)
  }

  const openEntry = (entry: FileEntry): void => {
    const rel = joinRel(path, entry.name)
    if (entry.dir) navigate(rel)
    else void window.native.files.openPath(inst.id, rel).catch(toastError)
  }

  const previewEntry = async (entry: FileEntry): Promise<void> => {
    const rel = joinRel(path, entry.name)
    try {
      const text = await window.native.files.readText(inst.id, rel)
      if (text === null) return
      setPreview({ rel, name: entry.name, text })
    } catch (err) {
      toastError(err)
    }
  }

  const deleteEntry = (entry: FileEntry): void => {
    const label = entry.dir ? 'folder' : 'file'
    if (!window.confirm(`Move ${label} "${entry.name}" to the trash?`)) return
    window.native.files
      .delete(inst.id, joinRel(path, entry.name))
      .then(() => {
        push({ kind: 'info', title: `Moved ${entry.name} to trash` })
        if (preview && preview.rel === joinRel(path, entry.name)) setPreview(null)
      })
      .then(load)
      .catch(toastError)
  }

  return (
    <div className="flex h-full flex-col px-6 pb-6" data-testid="files-tab">
      <div className="flex h-11 items-center py-1">
        <Breadcrumbs instName={inst.name} path={path} onNavigate={navigate} />
      </div>

      <div className="mt-2 flex min-h-0 flex-1 gap-3">
        <div className={cn('min-h-0 flex-1 overflow-y-auto', preview && 'max-w-[45%]')}>
          {entries === null && (
            <div className="flex justify-center py-10">
              <Spinner size={24} />
            </div>
          )}
          {entries && entries.length === 0 && (
            <div className="flex h-full items-center justify-center text-body text-content-muted">
              This folder is empty
            </div>
          )}
          {entries && entries.length > 0 && (
            <div className="flex flex-col gap-2 pt-1">
              <AnimatePresence initial={false}>
                {entries.map((entry) => (
                  <FileRow
                    key={entry.name}
                    entry={entry}
                    compact={preview !== null}
                    onOpen={() => openEntry(entry)}
                    onPreview={
                      !entry.dir && TEXT_PREVIEW_RE.test(entry.name)
                        ? () => void previewEntry(entry)
                        : null
                    }
                    onReveal={() =>
                      void window.native.files
                        .reveal(inst.id, joinRel(path, entry.name))
                        .catch(toastError)
                    }
                    onDelete={() => deleteEntry(entry)}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        {preview && (
          <motion.div
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.16 }}
            className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-card bg-surface-inset"
            data-testid="files-preview"
          >
            <div className="flex shrink-0 items-center gap-2 border-b border-line-subtle px-4 py-2.5">
              <FileText size={16} className="shrink-0 text-content-secondary" />
              <span className="min-w-0 flex-1 truncate text-small font-semibold text-content-primary">
                {preview.name}
              </span>
              <IconButton
                icon={X}
                label="Close preview"
                variant="ghost"
                size={28}
                iconSize={15}
                onClick={() => setPreview(null)}
              />
            </div>
            <pre className="min-h-0 flex-1 select-text overflow-auto whitespace-pre p-4 font-mono text-[12.5px] leading-[18px] text-content-secondary">
              {preview.text}
            </pre>
          </motion.div>
        )}
      </div>
    </div>
  )
}
