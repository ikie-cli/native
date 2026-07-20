import { Box, Gem, Landmark, Leaf, Mountain, Pickaxe, Rocket, Sword, TreePine, Zap } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn, hashHue } from '@/lib/util'

export const BUILTIN_ICONS: Record<string, { icon: LucideIcon; from: string; to: string }> = {
  cube: { icon: Box, from: '#1bd96a', to: '#0e7a3c' },
  sword: { icon: Sword, from: '#ff496e', to: '#8f1d3a' },
  pickaxe: { icon: Pickaxe, from: '#5b9dff', to: '#24457e' },
  leaf: { icon: Leaf, from: '#7ed957', to: '#3d7a24' },
  zap: { icon: Zap, from: '#ffa347', to: '#9c5a17' },
  gem: { icon: Gem, from: '#c084fc', to: '#6b3aa8' },
  mountain: { icon: Mountain, from: '#8b9bb0', to: '#44505f' },
  rocket: { icon: Rocket, from: '#ff7ab0', to: '#9c3563' },
  tree: { icon: TreePine, from: '#2fbf8f', to: '#14614a' },
  landmark: { icon: Landmark, from: '#e8c46b', to: '#8a6d25' }
}

export const BUILTIN_ICON_KEYS = Object.keys(BUILTIN_ICONS)

/**
 * Rounded-square instance icon (design-system.md §3): builtin gradient glyph,
 * or deterministic initials tile derived from the name.
 */
export function InstanceIcon({
  icon,
  name,
  size = 40,
  className
}: {
  icon: string | null
  name: string
  size?: number
  className?: string
}): React.JSX.Element {
  const radius = size >= 64 ? 16 : size >= 40 ? 12 : 8
  const key = icon?.startsWith('builtin:') ? icon.slice(8) : null
  const builtin = key ? BUILTIN_ICONS[key] : null

  if (builtin) {
    const Icon = builtin.icon
    return (
      <div
        className={cn('mono-media flex shrink-0 items-center justify-center', className)}
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          background: `linear-gradient(135deg, ${builtin.from}, ${builtin.to})`
        }}
      >
        <Icon size={size * 0.52} strokeWidth={2} className="text-white/90" />
      </div>
    )
  }

  const hue = hashHue(name)
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
  return (
    <div
      className={cn('mono-media flex shrink-0 select-none items-center justify-center font-bold', className)}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        fontSize: size * 0.34,
        color: 'rgba(255,255,255,0.92)',
        background: `linear-gradient(135deg, hsl(${hue} 45% 38%), hsl(${(hue + 40) % 360} 50% 22%))`
      }}
    >
      {initials || '?'}
    </div>
  )
}
