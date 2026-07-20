import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ExternalLink, Image as ImageIcon, Trash2, X } from 'lucide-react'
import type { InstanceConfig, ScreenshotInfo } from '@shared/types'
import { useToasts, toastError } from '@/stores/data'
import { EmptyState, IconButton, Spinner } from '@/components/ui/ui'
import { formatBytes, timeAgo } from '@/lib/util'
import { createPortal } from 'react-dom'

/** Lazy thumbnail — reads the image as a data URL through IPC on mount. */
function Thumb({
  shot,
  instanceId,
  onOpen
}: {
  shot: ScreenshotInfo
  instanceId: string
  onOpen: (src: string) => void
}): React.JSX.Element {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    window.native.screenshots.data(instanceId, shot.name).then((d) => !cancelled && setSrc(d))
    return () => {
      cancelled = true
    }
  }, [instanceId, shot.name])

  // Raised card wrapping the shot — the gallery-tile motif from ref-113501.
  return (
    <motion.button
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.18 }}
      onClick={() => src && onOpen(src)}
      className="group rounded-md2 bg-surface-raised p-2 text-left transition-colors duration-fast hover:bg-surface-hover"
    >
      <div className="relative aspect-video overflow-hidden rounded-sm2 bg-surface-inset">
        {src ? (
          <img
            src={src}
            alt={shot.name}
            className="mono-media h-full w-full object-cover transition-transform duration-page group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Spinner size={18} />
          </div>
        )}
      </div>
      <div className="truncate px-1 pt-2 text-tiny text-content-muted">
        {timeAgo(shot.mtime)} · {formatBytes(shot.sizeBytes)}
      </div>
    </motion.button>
  )
}

export function ScreenshotsTab({ inst }: { inst: InstanceConfig }): React.JSX.Element {
  const [shots, setShots] = useState<ScreenshotInfo[] | null>(null)
  const [lightbox, setLightbox] = useState<{ src: string; name: string } | null>(null)
  const push = useToasts((s) => s.push)

  const load = useCallback(async () => {
    try {
      setShots(await window.native.screenshots.list(inst.id))
    } catch {
      setShots([])
    }
  }, [inst.id])

  useEffect(() => {
    void load()
  }, [load])

  if (shots === null) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size={24} />
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto px-6 pb-6">
      {shots.length === 0 ? (
        <EmptyState
          icon={ImageIcon}
          title="No screenshots yet"
          detail="Press F2 in game to capture a screenshot. They'll appear here automatically."
        />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 pt-1">
          <AnimatePresence initial={false}>
            {shots.map((shot) => (
              <Thumb
                key={shot.name}
                shot={shot}
                instanceId={inst.id}
                onOpen={(src) => setLightbox({ src, name: shot.name })}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {lightbox &&
        createPortal(
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] flex items-center justify-center bg-black/85 p-8"
            onClick={() => setLightbox(null)}
          >
            <motion.img
              initial={{ scale: 0.94 }}
              animate={{ scale: 1 }}
              src={lightbox.src}
              alt={lightbox.name}
              className="max-h-full max-w-full rounded-md2 object-contain shadow-modal"
              onClick={(e) => e.stopPropagation()}
            />
            <div className="absolute right-4 top-4 flex gap-2" onClick={(e) => e.stopPropagation()}>
              <IconButton
                icon={ExternalLink}
                label="Open file location"
                onClick={() => {
                  const shot = shots.find((s) => s.name === lightbox.name)
                  if (shot) void window.native.app.revealFile(shot.path)
                }}
              />
              <IconButton
                icon={Trash2}
                label="Delete screenshot"
                variant="danger"
                onClick={() => {
                  window.native.screenshots
                    .remove(inst.id, lightbox.name)
                    .then(() => {
                      setLightbox(null)
                      push({ kind: 'info', title: 'Screenshot deleted' })
                      return load()
                    })
                    .catch(toastError)
                }}
              />
              <IconButton icon={X} label="Close" onClick={() => setLightbox(null)} />
            </div>
          </motion.div>,
          document.body
        )}
    </div>
  )
}
