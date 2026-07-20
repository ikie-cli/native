import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/util'
import { IconButton } from './ui'

/**
 * Modal per design-system.md §6: raised header/footer, inset body, ✕ circle,
 * backdrop dim+blur, 180ms scale/fade enter — transform+opacity only.
 */
export function Modal({
  open,
  onClose,
  title,
  titleIcon,
  children,
  footer,
  width = 520,
  bodyClassName
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  titleIcon?: ReactNode
  children: ReactNode
  footer?: ReactNode
  width?: number
  bodyClassName?: string
}): React.JSX.Element {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <motion.div
            className="absolute inset-0 bg-[rgba(8,9,11,0.42)] backdrop-blur-[8px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal
            className="relative flex max-h-full flex-col overflow-hidden rounded-card bg-surface-inset shadow-modal"
            style={{ width, maxWidth: '94vw' }}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 4 }}
            transition={{ duration: 0.18, ease: [0.25, 1, 0.5, 1] }}
          >
            <div className="flex shrink-0 items-center justify-between gap-4 bg-surface-raised px-6 py-4">
              <div className="flex items-center gap-3 text-h1 text-content-primary">
                {titleIcon}
                {title}
              </div>
              <IconButton icon={X} label="Close" onClick={onClose} />
            </div>
            <div className={cn('min-h-0 flex-1 overflow-y-auto p-6', bodyClassName)}>{children}</div>
            {footer && (
              <div className="flex shrink-0 items-center justify-between gap-3 bg-surface-raised px-6 py-4">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  )
}

export function FieldLabel({ children, className }: { children: ReactNode; className?: string }): React.JSX.Element {
  return (
    <div className={cn('mb-2 text-body font-bold text-content-primary', className)}>{children}</div>
  )
}
