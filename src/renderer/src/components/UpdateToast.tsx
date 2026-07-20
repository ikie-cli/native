import { AnimatePresence, motion } from 'framer-motion'
import { Download, RefreshCw, Rocket, X } from 'lucide-react'
import { useUpdater } from '@/stores/data'
import { Button, ProgressBar } from '@/components/ui/ui'
import { formatBytes, formatSpeed } from '@/lib/util'

/**
 * Non-intrusive auto-update UI (bottom-left): available → changelog +
 * download; downloading → progress; ready → restart to apply.
 */
export function UpdateToast(): React.JSX.Element {
  const { state, dismissed, dismiss } = useUpdater()

  const visible =
    !dismissed &&
    (state.status === 'available' || state.status === 'downloading' || state.status === 'ready')

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 400, damping: 34 }}
          className="fixed bottom-4 left-20 z-[70] w-[380px] rounded-card border border-line-subtle bg-surface-raised p-4 shadow-modal"
          data-testid="update-toast"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-tint text-accent">
              <Rocket size={20} />
            </div>
            <div className="min-w-0 flex-1">
              {state.status === 'available' && (
                <>
                  <div className="text-body font-bold text-content-primary">
                    Update available — v{state.version}
                  </div>
                  {state.notes && (
                    <div
                      className="mt-1 line-clamp-3 text-small text-content-secondary"
                      dangerouslySetInnerHTML={{ __html: sanitizeNotes(state.notes) }}
                    />
                  )}
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" icon={Download} onClick={() => void window.native.updater.download()}>
                      Download
                    </Button>
                    <Button size="sm" variant="secondary" onClick={dismiss}>
                      Later
                    </Button>
                  </div>
                </>
              )}
              {state.status === 'downloading' && (
                <>
                  <div className="text-body font-bold text-content-primary">
                    Downloading v{state.version}…
                  </div>
                  <ProgressBar className="mt-2.5" value={state.progress.percent / 100} />
                  <div className="mt-1.5 text-tiny text-content-muted">
                    {formatBytes(state.progress.transferred)} of {formatBytes(state.progress.total)} ·{' '}
                    {formatSpeed(state.progress.bytesPerSecond)}
                  </div>
                </>
              )}
              {state.status === 'ready' && (
                <>
                  <div className="text-body font-bold text-content-primary">
                    v{state.version} is ready to install
                  </div>
                  <div className="mt-0.5 text-small text-content-secondary">
                    Restart Native to apply the update.
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" icon={RefreshCw} onClick={() => void window.native.updater.install()}>
                      Restart now
                    </Button>
                    <Button size="sm" variant="secondary" onClick={dismiss}>
                      On next launch
                    </Button>
                  </div>
                </>
              )}
            </div>
            <button
              onClick={dismiss}
              aria-label="Dismiss"
              className="shrink-0 text-content-muted transition-colors hover:text-content-primary"
            >
              <X size={16} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function sanitizeNotes(html: string): string {
  const div = document.createElement('div')
  div.innerHTML = html
  return div.textContent?.slice(0, 400) ?? ''
}
