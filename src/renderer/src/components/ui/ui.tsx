import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import { motion, type HTMLMotionProps } from 'framer-motion'
import { Search, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/util'

/* ---------------- Button (design-system.md §6) ---------------- */

type ButtonVariant = 'primary' | 'danger' | 'secondary' | 'outline' | 'ghost'

export interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  variant?: ButtonVariant
  size?: 'md' | 'sm'
  icon?: LucideIcon
  children?: ReactNode
}

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-contrast hover:bg-accent-hover font-semibold',
  danger: 'bg-danger text-accent-contrast font-semibold hover:brightness-110',
  secondary: 'bg-surface-input text-content-primary font-semibold hover:bg-surface-active',
  outline:
    'border-[1.5px] border-accent bg-accent-tint text-accent font-semibold hover:bg-accent/20',
  ghost: 'text-content-secondary hover:bg-surface-hover hover:text-content-primary font-semibold'
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', icon: Icon, className, children, disabled, ...rest },
  ref
) {
  return (
    <motion.button
      ref={ref}
      whileHover={disabled ? undefined : { scale: 1.02 }}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      transition={{ duration: 0.12 }}
      className={cn(
        'inline-flex select-none items-center justify-center gap-2 rounded-full text-body transition-colors duration-fast',
        size === 'md' ? 'h-10 px-5' : 'h-9 px-4',
        buttonVariants[variant],
        disabled && 'pointer-events-none opacity-40',
        className
      )}
      disabled={disabled}
      {...rest}
    >
      {Icon && <Icon size={size === 'md' ? 20 : 18} strokeWidth={2.2} />}
      {children}
    </motion.button>
  )
})

/* ---------------- IconButton (circle) ---------------- */

export interface IconButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  icon: LucideIcon
  label: string
  size?: number
  variant?: 'input' | 'ghost' | 'danger'
  iconSize?: number
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon: Icon, label, size = 36, iconSize = 18, variant = 'input', className, ...rest },
  ref
) {
  return (
    <motion.button
      ref={ref}
      whileHover={{ scale: 1.06 }}
      whileTap={{ scale: 0.94 }}
      transition={{ duration: 0.12 }}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full transition-colors duration-fast',
        variant === 'input' && 'bg-surface-input text-content-primary hover:bg-surface-active',
        variant === 'ghost' &&
          'text-content-secondary hover:bg-surface-hover hover:text-content-primary',
        variant === 'danger' && 'bg-surface-input text-content-primary hover:bg-danger hover:text-white',
        className
      )}
      style={{ width: size, height: size }}
      {...rest}
    >
      <Icon size={iconSize} strokeWidth={2} />
    </motion.button>
  )
})

/* ---------------- Chip ---------------- */

export function Chip({
  children,
  icon: Icon,
  className
}: {
  children: ReactNode
  icon?: LucideIcon
  className?: string
}): React.JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex h-[26px] items-center gap-1.5 rounded-full bg-chip-bg px-3 text-small font-medium text-chip-text',
        className
      )}
    >
      {Icon && <Icon size={14} strokeWidth={2} />}
      {children}
    </span>
  )
}

/* ---------------- Toggle switch ---------------- */

export function Toggle({
  checked,
  onChange,
  disabled,
  label
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  label?: string
}): React.JSX.Element {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-[22px] w-10 shrink-0 rounded-full transition-colors duration-base',
        checked ? 'bg-accent' : 'bg-surface-active',
        disabled && 'pointer-events-none opacity-40'
      )}
    >
      <span
        className="absolute left-[3px] top-[3px] h-4 w-4 rounded-full bg-white shadow transition-transform duration-base ease-out-quart"
        style={{ transform: checked ? 'translateX(18px)' : 'translateX(0)' }}
      />
    </button>
  )
}

/* ---------------- Inputs ---------------- */

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, ...rest },
  ref
) {
  return (
    <input
      ref={ref}
      className={cn(
        'h-10 w-full rounded-full bg-surface-input px-4 text-body text-content-primary placeholder:text-content-muted',
        'border border-transparent transition-colors duration-fast focus:border-accent focus:outline-none',
        className
      )}
      {...rest}
    />
  )
})

export const SearchInput = forwardRef<HTMLInputElement, InputProps>(function SearchInput(
  { className, ...rest },
  ref
) {
  return (
    <div className={cn('relative', className)}>
      <Search
        size={18}
        strokeWidth={2}
        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-content-muted"
      />
      <input
        ref={ref}
        type="search"
        className="h-10 w-full rounded-full bg-surface-input pl-11 pr-4 text-body text-content-primary placeholder:text-content-muted border border-transparent transition-colors duration-fast focus:border-accent focus:outline-none"
        {...rest}
      />
    </div>
  )
})

/* ---------------- Progress bar (transform-based, 60fps) ---------------- */

export function ProgressBar({
  value,
  className,
  indeterminate
}: {
  /** 0..1 */
  value: number
  className?: string
  indeterminate?: boolean
}): React.JSX.Element {
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-surface-input', className)}>
      {indeterminate ? (
        <motion.div
          className="progress-fill h-full w-1/3 rounded-full bg-accent"
          animate={{ x: ['-100%', '300%'] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
        />
      ) : (
        <div
          className="progress-fill h-full w-full rounded-full bg-accent transition-transform duration-fast ease-linear"
          style={{ transform: `scaleX(${Math.min(1, Math.max(0, value))})` }}
        />
      )}
    </div>
  )
}

/* ---------------- Spinner ---------------- */

export function Spinner({ size = 18, className }: { size?: number; className?: string }): React.JSX.Element {
  return (
    <motion.span
      className={cn('inline-block rounded-full border-2 border-content-muted border-t-accent', className)}
      style={{ width: size, height: size }}
      animate={{ rotate: 360 }}
      transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
    />
  )
}

/* ---------------- Empty state ---------------- */

export function EmptyState({
  icon: Icon,
  title,
  detail,
  action,
  className
}: {
  icon: LucideIcon
  title: string
  detail?: string
  action?: ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 py-16 text-center', className)}>
      <Icon size={48} strokeWidth={1.2} className="text-content-muted" />
      <div>
        <div className="text-h3 text-content-primary">{title}</div>
        {detail && <div className="mt-1 max-w-md text-body text-content-secondary">{detail}</div>}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

/* ---------------- Section label ---------------- */

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }): React.JSX.Element {
  return <div className={cn('text-h3 font-bold text-content-primary', className)}>{children}</div>
}

/* ---------------- Plain circle button for window controls ---------------- */

export interface WinButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon
  danger?: boolean
}

export function WinControl({ icon: Icon, danger, className, ...rest }: WinButtonProps): React.JSX.Element {
  return (
    <button
      className={cn(
        'no-drag inline-flex h-full w-[46px] items-center justify-center text-content-secondary transition-colors duration-fast',
        danger ? 'hover:bg-danger hover:text-white' : 'hover:bg-surface-hover hover:text-content-primary',
        className
      )}
      {...rest}
    >
      <Icon size={16} strokeWidth={2} />
    </button>
  )
}
