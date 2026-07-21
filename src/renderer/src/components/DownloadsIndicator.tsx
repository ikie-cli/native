import { AnimatePresence, motion } from 'framer-motion'
import { ArrowDownToLine, X } from 'lucide-react'
import { useRef } from 'react'
import { useDownloads } from '@/stores/data'
import { ProgressBar } from '@/components/ui/ui'
import { formatBytes, formatEta, formatSpeed } from '@/lib/util'

/** Tasks shorter than this never show a card — quick fetches (loader profiles,
 * small mods) already have inline feedback and would only flash the UI. */
const SHOW_AFTER_MS = 1200

/**
 * Floating download progress card (bottom of content area). Progress arrives
 * over throttled IPC; bars animate with transform only — no layout thrash.
 */
export function DownloadsIndicator(): React.JSX.Element {
  const tasks = useDownloads((s) => s.tasks)
  const firstSeen = useRef(new Map<string, number>())

  const now = Date.now()
  const running = new Set(tasks.filter((t) => t.state === 'running').map((t) => t.id))
  for (const id of running) {
    if (!firstSeen.current.has(id)) firstSeen.current.set(id, now)
  }
  for (const id of [...firstSeen.current.keys()]) {
    if (!running.has(id)) firstSeen.current.delete(id)
  }
  // Progress ticks at 10 Hz keep re-rendering this component, so a task
  // naturally crosses the threshold without a timer.
  const active = tasks.filter(
    (t) => t.state === 'running' && now - (firstSeen.current.get(t.id) ?? now) >= SHOW_AFTER_MS
  )

  return (
    <div className="pointer-events-none absolute bottom-4 left-1/2 z-30 w-[480px] max-w-[90%] -translate-x-1/2">
      <AnimatePresence>
        {active.map((t) => {
          const pct = t.totalBytes > 0 ? t.doneBytes / t.totalBytes : 0
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 20, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 400, damping: 34 }}
              className="pointer-events-auto mt-2 rounded-card border border-line-subtle bg-surface-raised p-4 shadow-popover"
              data-testid={`download-${t.id}`}
            >
              <div className="flex items-center gap-3">
                <ArrowDownToLine size={18} className="shrink-0 text-accent" />
                <div className="min-w-0 flex-1 truncate text-body font-semibold text-content-primary">
                  {t.label}
                  <span className="ml-2 text-small font-medium capitalize text-content-muted">{t.phase}</span>
                </div>
                <div className="shrink-0 text-small tabular-nums text-content-secondary">
                  {Math.round(pct * 100)}%
                </div>
                <button
                  aria-label="Cancel download"
                  onClick={() => void window.native.downloads.cancel(t.id)}
                  className="shrink-0 text-content-muted transition-colors hover:text-danger"
                >
                  <X size={16} />
                </button>
              </div>
              <ProgressBar className="mt-2.5" value={pct} indeterminate={t.totalBytes === 0} />
              <div className="mt-1.5 flex justify-between text-tiny tabular-nums text-content-muted">
                <span>
                  {formatBytes(t.doneBytes)} / {formatBytes(t.totalBytes)} · {t.doneFiles}/{t.totalFiles} files
                </span>
                <span>
                  {formatSpeed(t.speedBps)} · ETA {formatEta(t.etaSec)}
                </span>
              </div>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
