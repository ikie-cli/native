import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { useToasts } from '@/stores/data'
import { cn } from '@/lib/util'

const ICONS = { info: Info, success: CheckCircle2, error: AlertCircle }
const COLORS = { info: 'text-info', success: 'text-accent', error: 'text-danger' }

export function ToastLayer(): React.JSX.Element {
  const { toasts, dismiss } = useToasts()
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[80] flex w-[360px] flex-col gap-2">
      <AnimatePresence>
        {toasts.map((t) => {
          const Icon = ICONS[t.kind]
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 40, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 500, damping: 38, mass: 0.8 }}
              className="pointer-events-auto flex items-start gap-3 rounded-card border border-line-subtle bg-surface-raised p-4 shadow-popover"
            >
              <Icon size={20} className={cn('mt-0.5 shrink-0', COLORS[t.kind])} />
              <div className="min-w-0 flex-1">
                <div className="text-body font-bold text-content-primary">{t.title}</div>
                {t.detail && (
                  <div className="mt-0.5 break-words text-small text-content-secondary">{t.detail}</div>
                )}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                className="shrink-0 text-content-muted transition-colors hover:text-content-primary"
                aria-label="Dismiss"
              >
                <X size={16} />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
