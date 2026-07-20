import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Archive, Globe2, Trash2 } from 'lucide-react'
import type { InstanceConfig, WorldInfo } from '@shared/types'
import { useToasts, toastError } from '@/stores/data'
import { Button, EmptyState, IconButton, Spinner } from '@/components/ui/ui'
import { formatBytes, timeAgo } from '@/lib/util'

export function WorldsTab({ inst }: { inst: InstanceConfig }): React.JSX.Element {
  const [worlds, setWorlds] = useState<WorldInfo[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const push = useToasts((s) => s.push)

  const load = useCallback(async () => {
    try {
      setWorlds(await window.native.worlds.list(inst.id))
    } catch (err) {
      toastError(err)
      setWorlds([])
    }
  }, [inst.id])

  useEffect(() => {
    void load()
  }, [load])

  const backup = async (folder: string): Promise<void> => {
    setBusy(folder)
    try {
      const path = await window.native.worlds.backup(inst.id, folder)
      push({ kind: 'success', title: 'World backed up', detail: path })
    } catch (err) {
      toastError(err)
    } finally {
      setBusy(null)
    }
  }

  if (worlds === null) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size={24} />
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto px-6 pb-6">
      {worlds.length === 0 ? (
        <EmptyState
          icon={Globe2}
          title="No worlds yet"
          detail="Singleplayer worlds you create in this instance will show up here, where you can back them up or remove them."
        />
      ) : (
        <div className="flex flex-col gap-2 pt-1">
          <AnimatePresence initial={false}>
            {worlds.map((w) => (
              <motion.div
                key={w.folder}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                className="group flex items-center gap-3 rounded-md2 bg-surface-raised px-4 py-3 transition-colors duration-fast hover:bg-surface-hover"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-sm2 bg-surface-inset">
                  {w.icon ? (
                    <img src={`file://${w.icon}`} alt="" className="mono-media h-full w-full object-cover" />
                  ) : (
                    <Globe2 size={20} className="text-content-muted" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-body font-semibold text-content-primary">{w.name}</div>
                  <div className="text-tiny text-content-muted">
                    {formatBytes(w.sizeBytes)} · last played {timeAgo(w.lastPlayed)}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={busy === w.folder ? undefined : Archive}
                  onClick={() => void backup(w.folder)}
                  disabled={busy === w.folder}
                >
                  {busy === w.folder ? <Spinner size={16} /> : 'Backup'}
                </Button>
                <IconButton
                  icon={Trash2}
                  label={`Delete ${w.name}`}
                  variant="danger"
                  onClick={() => {
                    if (!window.confirm(`Delete world "${w.name}"? This cannot be undone.`)) return
                    window.native.worlds
                      .remove(inst.id, w.folder)
                      .then(load)
                      .then(() => push({ kind: 'info', title: `Deleted ${w.name}` }))
                      .catch(toastError)
                  }}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
