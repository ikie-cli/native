import { ArrowLeft, ArrowRight, ChevronRight, Copy, Minus, Square, StopCircle, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useNav, type Route } from '@/stores/nav'
import { useInstances, useRunning, toastError } from '@/stores/data'
import { cn } from '@/lib/util'
import { WinControl } from '@/components/ui/ui'

function crumbsFor(route: Route, instName: (id: string) => string): string[] {
  switch (route.name) {
    case 'home':
      return ['Home']
    case 'library':
      return ['Library']
    case 'discover':
      return route.instanceId ? [instName(route.instanceId), 'Discover content'] : ['Discover content']
    case 'instance': {
      const tab = { content: 'Content', worlds: 'Worlds', screenshots: 'Screenshots', logs: 'Logs', options: 'Options' }[
        route.tab
      ]
      return ['Library', instName(route.id), tab]
    }
    case 'servers':
      return ['Servers']
  }
}

/** Frameless-window titlebar: wordmark, nav arrows, breadcrumb, running chip, window controls. */
export function Titlebar(): React.JSX.Element {
  const { route, back, forward, canBack, canForward, go } = useNav()
  const byId = useInstances((s) => s.byId)
  const running = useRunning((s) => s.running)
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    void window.native.window.isMaximized().then(setMaximized)
    return window.native.window.onMaximized(setMaximized)
  }, [])

  const crumbs = crumbsFor(route, (id) => byId(id)?.name ?? 'Instance')
  const firstRunning = running[0]
  const runningInst = firstRunning ? byId(firstRunning.instanceId) : null

  return (
    <header className="drag relative z-40 flex h-12 shrink-0 items-center gap-3 bg-surface-raised pl-4">
      {/* Wordmark */}
      <button
        className="no-drag flex items-center gap-2"
        onClick={() => go({ name: 'home' })}
        aria-label="Home"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="2.5" y="2.5" width="19" height="19" rx="6" fill="var(--accent)" />
          <path
            d="M8 16V8.6c0-.5.6-.8 1-.4l6.4 6.9c.4.4 1 .1 1-.4V8"
            stroke="var(--accent-contrast)"
            strokeWidth="2.1"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="text-[17px] font-extrabold tracking-tight text-accent">
          native <span className="font-medium text-content-primary">app</span>
        </span>
      </button>

      {/* Back / forward */}
      <div className="no-drag ml-2 flex items-center gap-1.5">
        <button
          onClick={back}
          disabled={!canBack()}
          aria-label="Back"
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-full bg-surface-input transition-colors duration-fast',
            canBack() ? 'text-content-primary hover:bg-surface-active' : 'text-content-muted opacity-50'
          )}
        >
          <ArrowLeft size={16} strokeWidth={2.2} />
        </button>
        <button
          onClick={forward}
          disabled={!canForward()}
          aria-label="Forward"
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-full bg-surface-input transition-colors duration-fast',
            canForward() ? 'text-content-primary hover:bg-surface-active' : 'text-content-muted opacity-50'
          )}
        >
          <ArrowRight size={16} strokeWidth={2.2} />
        </button>
      </div>

      {/* Breadcrumb */}
      <nav className="flex min-w-0 items-center gap-1.5 text-body font-semibold">
        {crumbs.map((c, i) => (
          <span key={i} className="flex min-w-0 items-center gap-1.5">
            {i > 0 && <ChevronRight size={14} className="shrink-0 text-content-muted" />}
            <span
              className={cn(
                'truncate',
                i === crumbs.length - 1 ? 'text-content-primary' : 'text-content-secondary'
              )}
            >
              {c}
            </span>
          </span>
        ))}
      </nav>

      <div className="min-w-0 flex-1" />

      {/* Running instance chip */}
      {runningInst && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="no-drag mr-2 flex h-9 items-center gap-2 rounded-full border border-line-strong bg-surface-base pl-3 pr-1.5"
        >
          <span className="h-2 w-2 rounded-full bg-accent" />
          <button
            className="max-w-[180px] truncate text-body font-semibold text-content-primary hover:text-accent"
            onClick={() => go({ name: 'instance', id: runningInst.id, tab: 'logs' })}
          >
            {runningInst.name}
          </button>
          <button
            aria-label="Stop game"
            title="Stop game"
            onClick={() => {
              void window.native.instances.kill(runningInst.id).catch(toastError)
            }}
            className="flex h-6 w-6 items-center justify-center rounded-full text-danger transition-colors duration-fast hover:bg-danger hover:text-white"
          >
            <StopCircle size={16} strokeWidth={2.2} />
          </button>
        </motion.div>
      )}

      {/* Window controls */}
      <div className="flex h-full items-stretch">
        <WinControl icon={Minus} aria-label="Minimize" onClick={() => window.native.window.minimize()} />
        <WinControl
          icon={maximized ? Copy : Square}
          aria-label="Maximize"
          onClick={() => window.native.window.toggleMaximize()}
        />
        <WinControl icon={X} danger aria-label="Close" onClick={() => window.native.window.close()} />
      </div>
    </header>
  )
}
