import type { LucideIcon } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'
import { cn } from '@/lib/util'

export interface TabItem<T extends string> {
  id: T
  label: string
  icon?: LucideIcon
  /** notification count chip after the label (hidden when 0/undefined) */
  badge?: number
}

/**
 * Pill tab group — the active pill glides between items (design-system.md §6/§7).
 *
 * Implementation note: the glide is a measured translateX/width tween on one
 * absolutely-positioned pill, NOT a framer `layoutId` projection. Shared-layout
 * projections inside exiting AnimatePresence page layers can wedge the exit
 * (layers never unmount and swallow clicks), so page-embedded chrome sticks to
 * plain compositable transitions. The pill is absolutely positioned, so its
 * width tween reflows nothing.
 */
export function PillTabs<T extends string>({
  items,
  value,
  onChange,
  className,
  size = 'md'
}: {
  items: TabItem<T>[]
  value: T
  onChange: (v: T) => void
  className?: string
  size?: 'md' | 'sm'
}): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const btnRefs = useRef(new Map<T, HTMLButtonElement>())
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null)
  const mounted = useRef(false)

  useLayoutEffect(() => {
    const btn = btnRefs.current.get(value)
    const box = containerRef.current
    if (!btn || !box) return
    const update = (): void => {
      setPill({ x: btn.offsetLeft, w: btn.offsetWidth })
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(btn)
    ro.observe(box)
    return () => ro.disconnect()
  }, [value, items.length])

  useLayoutEffect(() => {
    if (pill) mounted.current = true
  }, [pill])

  return (
    <div
      ref={containerRef}
      role="tablist"
      className={cn('relative inline-flex items-center gap-1 rounded-full bg-surface-raised p-1', className)}
    >
      {pill && (
        <span
          aria-hidden
          className="absolute rounded-full bg-accent"
          style={{
            left: 0,
            top: 4,
            bottom: 4,
            width: pill.w,
            transform: `translateX(${pill.x}px)`,
            transition: mounted.current
              ? 'transform 220ms cubic-bezier(0.25, 1, 0.5, 1), width 220ms cubic-bezier(0.25, 1, 0.5, 1)'
              : 'none'
          }}
        />
      )}
      {items.map((item) => {
        const active = item.id === value
        const Icon = item.icon
        return (
          <button
            key={item.id}
            ref={(el) => {
              if (el) btnRefs.current.set(item.id, el)
              else btnRefs.current.delete(item.id)
            }}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            className={cn(
              'relative z-10 inline-flex select-none items-center gap-2 rounded-full font-semibold transition-colors duration-base',
              size === 'md' ? 'h-9 px-4 text-body' : 'h-8 px-3.5 text-small',
              active ? 'text-accent-contrast' : 'text-content-primary hover:bg-surface-hover'
            )}
          >
            {Icon && <Icon size={size === 'md' ? 17 : 15} strokeWidth={2.2} />}
            {item.label}
            {item.badge != null && item.badge > 0 && (
              <span
                data-testid={`tab-badge-${item.id}`}
                className={cn(
                  'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] font-bold leading-none',
                  active ? 'bg-accent-contrast/20 text-accent-contrast' : 'bg-accent text-accent-contrast'
                )}
              >
                {item.badge > 99 ? '99+' : item.badge}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/** Filter chip row: `All | Error | Warn` style single-select chips. */
export function FilterChips<T extends string>({
  items,
  value,
  onChange,
  className
}: {
  items: { id: T; label: string }[]
  value: T
  onChange: (v: T) => void
  className?: string
}): React.JSX.Element {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      {items.map((item) => {
        const active = item.id === value
        return (
          <button
            key={item.id}
            onClick={() => onChange(item.id)}
            className={cn(
              'h-8 rounded-full px-3.5 text-small font-semibold transition-colors duration-fast',
              active
                ? 'bg-accent text-accent-contrast'
                : 'bg-surface-input text-content-primary hover:bg-surface-active'
            )}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
