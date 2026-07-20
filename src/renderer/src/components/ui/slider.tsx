import { useCallback, useRef } from 'react'
import { cn } from '@/lib/util'

/**
 * Accessible range slider with an accent fill. Pure transform/width visuals;
 * keyboard operable (arrow keys via native input range under the hood).
 */
export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  formatValue,
  className,
  label
}: {
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  formatValue?: (v: number) => string
  className?: string
  label?: string
}): React.JSX.Element {
  const ref = useRef<HTMLInputElement>(null)
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0

  const handle = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => onChange(Number(e.target.value)),
    [onChange]
  )

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div className="relative h-6 flex-1">
        <div className="absolute top-1/2 h-1.5 w-full -translate-y-1/2 rounded-full bg-surface-input" />
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-accent"
          style={{ width: `${pct}%` }}
        />
        <div
          className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow"
          style={{ left: `${pct}%` }}
        />
        <input
          ref={ref}
          type="range"
          aria-label={label}
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={handle}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>
      {formatValue && (
        <span className="w-20 shrink-0 text-right text-body tabular-nums text-content-primary">
          {formatValue(value)}
        </span>
      )}
    </div>
  )
}
