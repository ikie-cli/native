import type { LoaderKind } from '@shared/types'

/**
 * Hand-drawn minimal marks for each loader — single-stroke currentColor SVGs
 * so they inherit theme tokens everywhere (no emojis, no brand bitmaps).
 *
 *  vanilla   grass block: cube with a distinct top layer
 *  fabric    folded cloth / thread loop
 *  quilt     four patch squares with stitch ticks
 *  forge     anvil
 *  neoforge  fox head (NeoForge's mascot), geometric
 */
export function LoaderMark({
  loader,
  size = 20,
  className
}: {
  loader: LoaderKind
  size?: number
  className?: string
}): React.JSX.Element {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    'aria-hidden': true
  }
  switch (loader) {
    case 'vanilla':
      return (
        <svg {...common}>
          <path d="M12 3 4 7.5v9L12 21l8-4.5v-9L12 3Z" />
          <path d="M4 7.5 12 12l8-4.5" />
          <path d="M12 12v9" />
          <path d="M8 5.75 16 10.25" strokeDasharray="1.5 2.6" />
        </svg>
      )
    case 'fabric':
      return (
        <svg {...common}>
          <path d="M5 15.5V7.2c0-.9.5-1.6 1.3-1.9L12 3.4l5.7 1.9c.8.3 1.3 1 1.3 1.9v8.3" />
          <path d="M5 15.5c0 1.2 1 2.2 2.2 2.2h9.6c1.2 0 2.2-1 2.2-2.2" />
          <path d="M12 3.4v14.3" strokeDasharray="2 2.4" />
          <path d="M8.5 20.6h7" />
        </svg>
      )
    case 'quilt':
      return (
        <svg {...common}>
          <rect x="4" y="4" width="7.2" height="7.2" rx="1.6" />
          <rect x="12.8" y="4" width="7.2" height="7.2" rx="1.6" />
          <rect x="4" y="12.8" width="7.2" height="7.2" rx="1.6" />
          <rect x="12.8" y="12.8" width="7.2" height="7.2" rx="3.6" />
          <path d="M7.6 6.4v2.4M6.4 7.6h2.4" strokeWidth={1.4} />
        </svg>
      )
    case 'forge':
      return (
        <svg {...common}>
          <path d="M4 7h13.5c-.4 2.4-2 3.8-4.5 4.3v3.2c1.6.5 2.6 1.6 3 3.5H7c.4-1.9 1.4-3 3-3.5v-3C6.4 11 4.4 9.4 4 7Z" />
          <path d="M17.5 7H20v2h-2" />
        </svg>
      )
    case 'neoforge':
      return (
        <svg {...common}>
          <path d="M5 5.5 8.4 8h7.2L19 5.5V11c0 4.5-3 7.5-7 8.5-4-1-7-4-7-8.5V5.5Z" />
          <path d="M9 12.2h.01M15 12.2h.01" strokeWidth={2.6} />
          <path d="M10.6 15.4c.9.7 1.9.7 2.8 0" />
        </svg>
      )
  }
}
