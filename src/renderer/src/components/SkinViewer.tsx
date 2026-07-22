import { useEffect, useRef, useState } from 'react'
import { IdleAnimation, SkinViewer } from 'skinview3d'
import { PlayerHead, type PlayerHeadAccount } from '@/components/PlayerHead'
import steveSkin from '@/assets/ranked/steve.png'

/** Avatar/skin service base (mc-heads.net), read from the preload env bridge. */
const AVATAR_BASE =
  (window as unknown as { native?: { env?: { avatarBase?: string } } }).native?.env?.avatarBase ??
  'https://mc-heads.net'

/** Full-skin PNG URL for an account — real skin for MSA, shared 'banks7' otherwise. */
function skinUrl(account: PlayerHeadAccount): string {
  if (account && account.type === 'msa' && account.uuid) {
    return `${AVATAR_BASE}/skin/${account.uuid.replace(/-/g, '')}`
  }
  return `${AVATAR_BASE}/skin/banks7`
}

/**
 * Interactive 3D viewer of the player's Minecraft skin (skinview3d/three).
 * Renders the bundled Steve skin immediately so something always shows, then
 * upgrades to the account's real skin when the network resolves. Falls back to
 * the 2D head if WebGL is unavailable.
 */
export function SkinViewer3D({
  account,
  width = 300,
  height = 440,
  className
}: {
  account: PlayerHeadAccount
  width?: number
  height?: number
  className?: string
}): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let viewer: SkinViewer | null = null
    try {
      viewer = new SkinViewer({ canvas, width, height, skin: steveSkin })
      viewer.animation = new IdleAnimation()
      viewer.autoRotate = true
      viewer.autoRotateSpeed = 0.5
      viewer.zoom = 0.82
      viewer.fov = 42
      viewer.controls.enableZoom = false
      viewer.controls.enablePan = false
      // Upgrade Steve → the account's real skin when reachable (kept on failure).
      void viewer.loadSkin(skinUrl(account), { model: 'auto-detect' }).catch(() => undefined)
    } catch {
      setFailed(true)
    }
    return () => viewer?.dispose()
  }, [account?.uuid, account?.type, width, height])

  if (failed) {
    return (
      <div className={className} style={{ width, height }}>
        <div className="flex h-full items-center justify-center">
          <PlayerHead account={account} size={Math.round(Math.min(width, height) * 0.55)} />
        </div>
      </div>
    )
  }
  return <canvas ref={canvasRef} className={className} aria-hidden />
}
