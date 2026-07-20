import { Compass, Home, Library, LogIn, Plus, Server, Settings, User } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { motion } from 'framer-motion'
import { useMemo } from 'react'
import { useNav, useModals, type Route } from '@/stores/nav'
import { useAccounts, useInstances, useRunning } from '@/stores/data'
import { InstanceIcon } from '@/components/InstanceIcon'
import { cn } from '@/lib/util'

function RailButton({
  icon: Icon,
  label,
  active,
  onClick
}: {
  icon: LucideIcon
  label: string
  active?: boolean
  onClick: () => void
}): React.JSX.Element {
  return (
    <motion.button
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.92 }}
      transition={{ duration: 0.12 }}
      aria-label={label}
      title={label}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
      className={cn(
        'flex h-10 w-10 items-center justify-center rounded-full transition-colors duration-fast',
        active
          ? 'bg-accent text-accent-contrast'
          : 'text-content-secondary hover:bg-surface-hover hover:text-content-primary'
      )}
    >
      <Icon size={22} strokeWidth={2} />
    </motion.button>
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
      <RailButton icon={Home} label="Home" active={is('home')} onClick={() => go({ name: 'home' })} />
      <RailButton
        icon={Compass}
        label="Discover content"
        active={route.name === 'discover' && !route.instanceId}
        onClick={() => go({ name: 'discover' })}
      />
      <RailButton icon={Library} label="Library" active={is('library')} onClick={() => go({ name: 'library' })} />
      <RailButton icon={Server} label="Servers" active={is('servers')} onClick={() => go({ name: 'servers' })} />

      <div className="my-1 h-px w-8 bg-line-subtle" />

      <div className="flex min-h-0 flex-1 flex-col items-center gap-2 overflow-y-auto">
        {pinned.map((inst) => {
          const isRunning = running.some((r) => r.instanceId === inst.id)
          const activeInst = route.name === 'instance' && route.id === inst.id
          return (
            <motion.button
              key={inst.id}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.92 }}
              transition={{ duration: 0.12 }}
              title={inst.name}
              aria-label={inst.name}
              onClick={() => go({ name: 'instance', id: inst.id, tab: 'content' })}
              className={cn(
                'relative rounded-sm2',
                (activeInst || isRunning) && 'ring-2 ring-accent ring-offset-2 ring-offset-surface-raised'
              )}
            >
              <InstanceIcon icon={inst.icon} name={inst.name} size={32} />
              {isRunning && (
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface-raised bg-accent" />
              )}
            </motion.button>
          )
        })}
        <RailButton icon={Plus} label="Create instance" onClick={() => setCreateOpen(true)} />
      </div>

      <RailButton icon={Settings} label="Settings" onClick={() => setSettingsOpen(true)} />
      <RailButton
        icon={active ? User : LogIn}
        label={active ? `Accounts (${active.username})` : 'Sign in'}
        onClick={() => setAccountsOpen(true)}
      />
    </aside>
  )
}
