import { AnimatePresence, motion } from 'framer-motion'
import {
  cloneElement,
  useCallback,
  useRef,
  useState,
  type ReactElement
} from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/util'

type Side = 'right' | 'top' | 'bottom' | 'left'

/**
 * Custom tooltip — no native `title` bubbles. Renders in a portal beside the
 * anchor after a short hover delay; transform/opacity only.
 */
export function Tooltip({
  label,
  side = 'right',
  delay = 350,
  children
}: {
  label: string
  side?: Side
  delay?: number
  children: ReactElement<Record<string, unknown>>
}): React.JSX.Element {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const anchor = useRef<HTMLElement | null>(null)

  const show = useCallback(() => {
    timer.current = setTimeout(() => {
      const r = anchor.current?.getBoundingClientRect()
      if (!r) return
      const gap = 10
      const p =
        side === 'right'
          ? { x: r.right + gap, y: r.top + r.height / 2 }
          : side === 'left'
            ? { x: r.left - gap, y: r.top + r.height / 2 }
            : side === 'top'
              ? { x: r.left + r.width / 2, y: r.top - gap }
              : { x: r.left + r.width / 2, y: r.bottom + gap }
      setPos(p)
    }, delay)
  }, [side, delay])

  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    setPos(null)
  }, [])

  const child = cloneElement(children, {
    ref: (el: HTMLElement | null) => {
      anchor.current = el
      const orig = (children as { ref?: unknown }).ref
      if (typeof orig === 'function') orig(el)
    },
    onMouseEnter: (e: React.MouseEvent) => {
      show()
      ;(children.props.onMouseEnter as ((e: React.MouseEvent) => void) | undefined)?.(e)
    },
    onMouseLeave: (e: React.MouseEvent) => {
      hide()
      ;(children.props.onMouseLeave as ((e: React.MouseEvent) => void) | undefined)?.(e)
    },
    onMouseDown: (e: React.MouseEvent) => {
      hide()
      ;(children.props.onMouseDown as ((e: React.MouseEvent) => void) | undefined)?.(e)
    }
  })

  const translate =
    side === 'right'
      ? '-translate-y-1/2'
      : side === 'left'
        ? '-translate-x-full -translate-y-1/2'
        : side === 'top'
          ? '-translate-x-1/2 -translate-y-full'
          : '-translate-x-1/2'
  const enterOffset =
    side === 'right' ? { x: -6 } : side === 'left' ? { x: 6 } : side === 'top' ? { y: 6 } : { y: -6 }
  const arrowClass =
    side === 'right'
      ? 'left-[-4px] top-1/2 -translate-y-1/2'
      : side === 'left'
        ? 'right-[-4px] top-1/2 -translate-y-1/2'
        : side === 'top'
          ? 'bottom-[-4px] left-1/2 -translate-x-1/2'
          : 'top-[-4px] left-1/2 -translate-x-1/2'

  return (
    <>
      {child}
      {createPortal(
        <AnimatePresence>
          {pos && (
            <motion.div
              initial={{ opacity: 0, ...enterOffset }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.08 } }}
              transition={{ duration: 0.14, ease: [0.25, 1, 0.5, 1] }}
              className={cn('pointer-events-none fixed z-[100]', translate)}
              style={{ left: pos.x, top: pos.y }}
            >
              <div className="relative rounded-md2 border border-line-subtle bg-surface-active px-2.5 py-1.5 text-small font-semibold text-content-primary shadow-popover">
                {label}
                <span
                  aria-hidden
                  className={cn(
                    'absolute h-2 w-2 rotate-45 border-line-subtle bg-surface-active',
                    arrowClass,
                    side === 'right' && 'border-b border-l',
                    side === 'left' && 'border-r border-t',
                    side === 'top' && 'border-b border-r',
                    side === 'bottom' && 'border-l border-t'
                  )}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  )
}
