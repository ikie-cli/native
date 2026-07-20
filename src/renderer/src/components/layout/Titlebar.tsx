import { ArrowLeft, ArrowRight, ChevronRight, Minus, Square, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useNav, type Route } from '@/stores/nav'
import { useInstances, useRunning, toastError } from '@/stores/data'
import { cn } from '@/lib/util'
import { Tooltip } from '@/components/ui/tooltip'
import { InstanceIcon } from '@/components/InstanceIcon'

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

/** The Native mark — same voxel-column N as the app icon, token-driven. */
function Wordmark(): React.JSX.Element {
  return (
    <span className="flex items-center gap-2.5">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect x="1.5" y="1.5" width="21" height="21" rx="6.5" fill="var(--accent)" />
        <g fill="var(--accent-contrast)">
          <rect x="6.2" y="6" width="2.5" height="12" rx="0.6" />
          <rect x="15.3" y="6" width="2.5" height="12" rx="0.6" />
          <rect x="8.5" y="7.6" width="2.4" height="2.4" rx="0.5" />
          <rect x="10.2" y="9.9" width="2.4" height="2.4" rx="0.5" />
          <rect x="11.6" y="12.2" width="2.4" height="2.4" rx="0.5" />
          <rect x="13.2" y="14.4" width="2.4" height="2.4" rx="0.5" />
        </g>
      </svg>
      <span className="text-[16px] font-extrabold tracking-tight text-content-primary">
        Native
      </span>
    </span>
  )
}

/**
 * Frameless titlebar: wordmark home button, segmented history nav, breadcrumb
 * trail with animated segments, live running-game chip, window controls.
 */
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
    <header className="drag relative z-40 flex h-12 shrink-0 items-center gap-3 border-b border-line-subtle bg-surface-window pl-4">
      <Tooltip label="Home" side="bottom">
        <button className="no-drag rounded-md2 transition-opacity duration-fast hover:opacity-80" onClick={() => go({ name: 'home' })} aria-label="Home">
          <Wordmark />
        </button>
      </Tooltip>

      {/* Segmented history nav */}
      <div className="no-drag ml-1 flex h-8 items-center overflow-hidden rounded-full border border-line-subtle bg-surface-raised">
        <button
          onClick={back}
          disabled={!canBack()}
          aria-label="Back"
          className={cn(
            'flex h-full w-9 items-center justify-center transition-colors duration-fast',
            canBack() ? 'text-content-primary hover:bg-surface-active' : 'cursor-default text-content-muted/60'
          )}
        >
          <ArrowLeft size={15} strokeWidth={2.2} />
        </button>
        <span className="h-4 w-px bg-line-subtle" />
        <button
          onClick={forward}
          disabled={!canForward()}
          aria-label="Forward"
          className={cn(
            'flex h-full w-9 items-center justify-center transition-colors duration-fast',
            canForward() ? 'text-content-primary hover:bg-surface-active' : 'cursor-default text-content-muted/60'
          )}
        >
          <ArrowRight size={15} strokeWidth={2.2} />
        </button>
      </div>

      {/* Breadcrumb trail — segments animate in as you navigate deeper */}
      <nav className="flex h-8 min-w-0 items-center gap-1 rounded-full px-2 text-body font-semibold">
        <AnimatePresence initial={false} mode="popLayout">
          {crumbs.map((c, i) => (
            <motion.span
              key={`${i}-${c}`}
              layout
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.08 } }}
              transition={{ duration: 0.16, ease: [0.25, 1, 0.5, 1] }}
              className="flex min-w-0 items-center gap-1"
            >
              {i > 0 && <ChevronRight size={13} className="shrink-0 text-content-muted" />}
              <span
                className={cn(
                  'max-w-[220px] truncate',
                  i === crumbs.length - 1 ? 'text-content-primary' : 'text-content-muted'
                )}
              >
                {c}
              </span>
            </motion.span>
          ))}
        </AnimatePresence>
      </nav>

      <div className="min-w-0 flex-1" />

      {/* Running instance chip: icon, pulsing dot, name, square stop */}
      <AnimatePresence>
        {runningInst && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ type: 'spring', stiffness: 500, damping: 38 }}
            className="no-drag mr-2 flex h-9 items-center gap-2.5 rounded-full border border-line-strong bg-surface-raised py-1 pl-1.5 pr-1.5"
          >
            <InstanceIcon icon={runningInst.icon} name={runningInst.name} size={24} />
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
            </span>
            <button
              className="max-w-[170px] truncate text-small font-semibold text-content-primary hover:underline"
              onClick={() => go({ name: 'instance', id: runningInst.id, tab: 'logs' })}
            >
              {runningInst.name}
            </button>
            <Tooltip label="Stop game" side="bottom">
              <button
                aria-label="Stop game"
                onClick={() => {
                  void window.native.instances.kill(runningInst.id).catch(toastError)
                }}
                className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-input text-content-primary transition-colors duration-fast hover:bg-danger hover:text-white"
              >
                <Square size={11} strokeWidth={2.5} fill="currentColor" />
              </button>
            </Tooltip>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Window controls */}
      <div className="no-drag flex h-full items-stretch">
        <button
          aria-label="Minimize"
          onClick={() => window.native.window.minimize()}
          className="flex w-[46px] items-center justify-center text-content-secondary transition-colors duration-fast hover:bg-surface-hover hover:text-content-primary"
        >
          <Minus size={16} strokeWidth={2} />
        </button>
        <button
          aria-label="Maximize"
          onClick={() => window.native.window.toggleMaximize()}
          className="flex w-[46px] items-center justify-center text-content-secondary transition-colors duration-fast hover:bg-surface-hover hover:text-content-primary"
        >
          {maximized ? (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
              <rect x="1.5" y="4" width="8.5" height="8.5" rx="1.5" />
              <path d="M4.5 4V3a1.5 1.5 0 0 1 1.5-1.5h5A1.5 1.5 0 0 1 12.5 3v5A1.5 1.5 0 0 1 11 9.5h-1" />
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
              <rect x="1.75" y="1.75" width="10.5" height="10.5" rx="2" />
            </svg>
          )}
        </button>
        <button
          aria-label="Close"
          onClick={() => window.native.window.close()}
          className="flex w-[46px] items-center justify-center text-content-secondary transition-colors duration-fast hover:bg-danger hover:text-white"
        >
          <X size={16} strokeWidth={2} />
        </button>
      </div>
    </header>
  )
}
