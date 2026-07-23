import { Compass, Home, Library, LogIn, Plus, Server, Settings } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { motion } from 'framer-motion'
import { useMemo } from 'react'
import { useNav, useModals, type Route } from '@/stores/nav'
import { useAccounts, useInstances, useRunning } from '@/stores/data'
import { InstanceIcon } from '@/components/InstanceIcon'
import { PlayerHead } from '@/components/PlayerHead'
import { Tooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/util'

function RailButton({
  icon: Icon,
  label,
  active,
  onClick,
  className,
  children,
  tour
}: {
  icon?: LucideIcon
  label: string
  active?: boolean
  onClick: () => void
  className?: string
  children?: React.ReactNode
  /** Anchor id for the first-run tour spotlight ([data-tour]). */
  tour?: string
}): React.JSX.Element {
  return (
    <Tooltip label={label} side="right">
      <motion.button
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
        transition={{ duration: 0.12 }}
        aria-label={label}
        aria-current={active ? 'page' : undefined}
        data-tour={tour}
        onClick={onClick}
        className={cn(
          'flex h-10 w-10 items-center justify-center rounded-full transition-colors duration-fast',
          active
            ? 'bg-accent text-accent-contrast'
            : 'text-content-secondary hover:bg-surface-hover hover:text-content-primary',
          className
        )}
      >
        {children ?? (Icon ? <Icon size={22} strokeWidth={2} /> : null)}
      </motion.button>
    </Tooltip>
  )
}

/** 64px icon rail (design-system.md §4): nav, pinned instances, settings, account. */
export function Rail(): React.JSX.Element {
  const { route, go } = useNav()
  const { setSettingsOpen, setCreateOpen, setAccountsOpen } = useModals()
  const instances = useInstances((s) => s.instances)
  const running = useRunning((s) => s.running)
  const accounts = useAccounts((s) => s.accounts)
  const active = accounts.find((a) => a.active)

  const pinned = useMemo(() => instances.slice(0, 5), [instances])
  const is = (name: Route['name']): boolean => route.name === name

  return (
    <aside className="flex w-16 shrink-0 flex-col items-center gap-2 bg-surface-raised py-3">
      <RailButton icon={Home} label="Home" tour="home" active={is('home')} onClick={() => go({ name: 'home' })} />
      <RailButton
        icon={Compass}
        label="Discover content"
        tour="discover"
        active={route.name === 'discover' && !route.instanceId}
        onClick={() => go({ name: 'discover' })}
      />
      <RailButton icon={Library} label="Library" tour="library" active={is('library')} onClick={() => go({ name: 'library' })} />
      <RailButton icon={Server} label="Servers" tour="servers" active={is('servers')} onClick={() => go({ name: 'servers' })} />

      <div className="my-1 h-px w-8 bg-line-subtle" />

      {/* self-stretch: span the full 64px rail so the active ring and the
          hover scale-up never clip against this scroll container's edges. */}
      <div className="scrollbar-none flex min-h-0 flex-1 select-none flex-col items-center gap-2 self-stretch overflow-y-auto py-2">
        {pinned.map((inst) => {
          const isRunning = running.some((r) => r.instanceId === inst.id)
          const activeInst = route.name === 'instance' && route.id === inst.id
          return (
            <Tooltip
              key={inst.id}
              label={isRunning ? `${inst.name} — running` : inst.name}
              side="right"
            >
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.92 }}
                transition={{ duration: 0.12 }}
                aria-label={inst.name}
                onClick={() => go({ name: 'instance', id: inst.id, tab: 'content' })}
                className={cn(
                  'relative shrink-0 rounded-sm2',
                  (activeInst || isRunning) && 'ring-2 ring-accent ring-offset-2 ring-offset-surface-raised'
                )}
              >
                <InstanceIcon icon={inst.icon} name={inst.name} size={32} />
                {isRunning && (
                  <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface-raised bg-accent" />
                )}
              </motion.button>
            </Tooltip>
          )
        })}
      </div>

      <RailButton icon={Plus} label="Create instance" tour="create" className="shrink-0" onClick={() => setCreateOpen(true)} />

      <RailButton icon={Settings} label="Settings" tour="settings" onClick={() => setSettingsOpen(true)} />
      <RailButton
        icon={active ? undefined : LogIn}
        label={active ? `Accounts — ${active.username}` : 'Sign in'}
        tour="account"
        onClick={() => setAccountsOpen(true)}
      >
        {active ? <PlayerHead account={active} size={22} /> : undefined}
      </RailButton>
    </aside>
  )
}
