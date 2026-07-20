import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronDown, type LucideIcon } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode
} from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/util'

interface PopoverPos {
  left: number
  top: number
  width?: number
}

function usePopover(align: 'left' | 'right' = 'left'): {
  open: boolean
  setOpen: (v: boolean) => void
  triggerRef: React.RefObject<HTMLButtonElement>
  pos: PopoverPos
  recalc: () => void
} {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState<PopoverPos>({ left: 0, top: 0 })

  const recalc = useCallback((): void => {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos({
      left: align === 'left' ? r.left : r.right,
      top: r.bottom + 6,
      width: r.width
    })
  }, [align])

  useLayoutEffect(() => {
    if (open) recalc()
  }, [open, recalc])

  useEffect(() => {
    if (!open) return
    const close = (): void => setOpen(false)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => {
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [open])

  return { open, setOpen, triggerRef, pos, recalc }
}

function PopoverLayer({
  onClose,
  pos,
  align,
  minWidth,
  children
}: {
  onClose: () => void
  pos: PopoverPos
  align: 'left' | 'right'
  minWidth?: number
  children: ReactNode
}): React.JSX.Element {
  return createPortal(
    <div className="fixed inset-0 z-[60]" onMouseDown={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: -4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: -2 }}
        transition={{ duration: 0.14, ease: [0.25, 1, 0.5, 1] }}
        onMouseDown={(e) => e.stopPropagation()}
        className="absolute max-h-[60vh] overflow-y-auto rounded-md2 bg-surface-raised p-1.5 shadow-popover border border-line-subtle"
        style={{
          left: align === 'left' ? pos.left : undefined,
          right: align === 'right' ? window.innerWidth - pos.left : undefined,
          top: pos.top,
          minWidth: minWidth ?? pos.width
        }}
      >
        {children}
      </motion.div>
    </div>,
    document.body
  )
}

/* ---------------- Select ("Sort by: Value ⌄") ---------------- */

export interface SelectOption<T extends string> {
  value: T
  label: string
}

export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
  minWidth
}: {
  label?: string
  value: T
  options: SelectOption<T>[]
  onChange: (v: T) => void
  className?: string
  minWidth?: number
}): React.JSX.Element {
  const { open, setOpen, triggerRef, pos } = usePopover('left')
  const current = options.find((o) => o.value === value)
  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        className={cn(
          'inline-flex h-10 items-center gap-2 rounded-full bg-surface-input px-4 text-body font-semibold text-content-primary transition-colors duration-fast hover:bg-surface-active',
          className
        )}
      >
        {label && <span className="text-content-secondary">{label}:</span>}
        <span className="truncate">{current?.label ?? value}</span>
        <ChevronDown size={16} className={cn('text-content-secondary transition-transform duration-base', open && 'rotate-180')} />
      </button>
      <AnimatePresence>
        {open && (
          <PopoverLayer onClose={() => setOpen(false)} pos={pos} align="left" minWidth={minWidth}>
            {options.map((o) => (
              <button
                key={o.value}
                onClick={() => {
                  onChange(o.value)
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full items-center justify-between gap-3 rounded-sm2 px-3 py-2 text-left text-body transition-colors duration-fast',
                  o.value === value
                    ? 'font-semibold text-accent'
                    : 'text-content-primary hover:bg-surface-hover'
                )}
              >
                {o.label}
                {o.value === value && <Check size={16} />}
              </button>
            ))}
          </PopoverLayer>
        )}
      </AnimatePresence>
    </>
  )
}

/* ---------------- Kebab / dropdown menu ---------------- */

export interface MenuItem {
  label: string
  icon?: LucideIcon
  danger?: boolean
  disabled?: boolean
  onClick: () => void
}

export function DropMenu({
  items,
  trigger,
  align = 'right'
}: {
  items: MenuItem[]
  trigger: (props: { ref: React.RefObject<HTMLButtonElement>; onClick: () => void }) => ReactNode
  align?: 'left' | 'right'
}): React.JSX.Element {
  const { open, setOpen, triggerRef, pos } = usePopover(align)
  return (
    <>
      {trigger({ ref: triggerRef, onClick: () => setOpen(!open) })}
      <AnimatePresence>
        {open && (
          <PopoverLayer onClose={() => setOpen(false)} pos={pos} align={align} minWidth={180}>
            {items.map((item, i) => {
              const Icon = item.icon
              return (
                <button
                  key={i}
                  disabled={item.disabled}
                  onClick={() => {
                    setOpen(false)
                    item.onClick()
                  }}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-sm2 px-3 py-2 text-left text-body font-medium transition-colors duration-fast',
                    item.danger
                      ? 'text-danger hover:bg-danger-tint'
                      : 'text-content-primary hover:bg-surface-hover',
                    item.disabled && 'pointer-events-none opacity-40'
                  )}
                >
                  {Icon && <Icon size={16} strokeWidth={2} />}
                  {item.label}
                </button>
              )
            })}
          </PopoverLayer>
        )}
      </AnimatePresence>
    </>
  )
}
