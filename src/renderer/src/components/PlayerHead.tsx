import { useState } from 'react'
import { cn } from '@/lib/util'

/** Account shape needed to resolve an avatar (subset of shared AccountInfo). */
export type PlayerHeadAccount = {
  type: 'msa' | 'offline'
  uuid?: string | null
  username: string
} | null

/**
 * Avatar service base. Read once at module load from the preload env bridge so
 * hermetic E2E runs can point it at an unreachable host and force the
 * deterministic FallbackHead. Defaults to the public mc-heads.net service.
 */
const AVATAR_BASE =
  (window as unknown as { native?: { env?: { avatarBase?: string } } }).native?.env?.avatarBase ??
  'https://mc-heads.net'

/** Resolve the skin-head image URL for an account at a given display size. */
function avatarUrl(account: PlayerHeadAccount, size: number): string {
  const px = size * 2
  if (account && account.type === 'msa' && account.uuid) {
    const id = account.uuid.replace(/-/g, '')
    return `${AVATAR_BASE}/avatar/${id}/${px}`
  }
  // Offline profiles (and the signed-out state) all share the 'banks7' head.
  return `${AVATAR_BASE}/avatar/banks7/${px}`
}

/**
 * Real Minecraft skin-head avatar. Fetches the pixel head from the avatar
 * service and falls back to a deterministic procedural face when the image
 * fails to load (e.g. offline, or hermetic E2E with no network).
 */
export function PlayerHead({
  account,
  size = 32,
  className
}: {
  account: PlayerHeadAccount
  size?: number
  className?: string
}): React.JSX.Element {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const src = avatarUrl(account, size)

  // Reset automatically when the resolved src changes (e.g. switching accounts).
  if (failedSrc === src) {
    return <FallbackHead name={account?.username ?? 'banks7'} size={size} className={className} />
  }

  return (
    <img
      src={src}
      width={size}
      height={size}
      alt=""
      draggable={false}
      onError={() => setFailedSrc(src)}
      className={cn('shrink-0 rounded-sm2', className)}
      style={{ width: size, height: size, imageRendering: 'pixelated', borderRadius: Math.max(2, Math.round(size / 5)) }}
    />
  )
}

/**
 * Deterministic pixel-face avatar (no network) in Minecraft-head style.
 * Used as the offline/error fallback for {@link PlayerHead}.
 */
export function FallbackHead({
  name,
  size = 32,
  className
}: {
  name: string
  size?: number
  className?: string
}): React.JSX.Element {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
  const hue = Math.abs(h) % 360
  const skin = `hsl(${25 + (Math.abs(h) % 20)} ${45 + (Math.abs(h >> 3) % 20)}% ${55 + (Math.abs(h >> 5) % 15)}%)`
  const hair = `hsl(${hue} 35% 25%)`
  const eye = `hsl(${(hue + 180) % 360} 60% 45%)`
  const px = size / 8
  return (
    <div
      className={cn('relative shrink-0 overflow-hidden rounded-sm2', className)}
      style={{ width: size, height: size, background: skin, imageRendering: 'pixelated' }}
      aria-hidden
    >
      <div style={{ position: 'absolute', inset: 0, height: px * 2.4, background: hair }} />
      <div style={{ position: 'absolute', left: px, top: px * 3.6, width: px * 1.3, height: px * 1.3, background: eye }} />
      <div style={{ position: 'absolute', right: px, top: px * 3.6, width: px * 1.3, height: px * 1.3, background: eye }} />
      <div
        style={{
          position: 'absolute',
          left: px * 3,
          bottom: px * 1.2,
          width: px * 2,
          height: px,
          background: `hsl(${25 + (Math.abs(h) % 20)} 40% 40%)`
        }}
      />
    </div>
  )
}
