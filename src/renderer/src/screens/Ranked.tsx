import { motion } from 'framer-motion'
import { Activity, Play, RefreshCw, Shield, Sparkles, Trophy } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { RankedPlayer, RankedStatus } from '@shared/types'
import { Button, Chip } from '@/components/ui/ui'
import type { PlayerHeadAccount } from '@/components/PlayerHead'
import { SkinViewer3D } from '@/components/SkinViewer'
import { toastError, useAccounts, useInstances, useRunning, useToasts } from '@/stores/data'

const EMPTY: RankedStatus = {
  configured: false,
  online: false,
  instance: null,
  player: null,
  leaderboard: [],
  service: null
}

const TIERS = [
  { name: 'Bronze', min: 0 },
  { name: 'Silver', min: 850 },
  { name: 'Gold', min: 1050 },
  { name: 'Platinum', min: 1250 },
  { name: 'Diamond', min: 1500 },
  { name: 'Native Master', min: 1800 }
]

function tierInfo(rating: number): { name: string; progress: number } {
  let index = 0
  for (let i = 0; i < TIERS.length; i++) if (rating >= TIERS[i].min) index = i
  const current = TIERS[index]
  const next = TIERS[index + 1]
  const progress = next
    ? Math.max(4, Math.min(100, ((rating - current.min) / (next.min - current.min)) * 100))
    : 100
  return { name: current.name, progress }
}

export function RankedScreen(): React.JSX.Element {
  const [status, setStatus] = useState<RankedStatus>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const refreshInstances = useInstances((s) => s.refresh)
  const running = useRunning((s) => s.running)
  const account = useAccounts((s) => s.accounts.find((a) => a.active) ?? null)
  const push = useToasts((s) => s.push)

  const refresh = useCallback(async () => {
    try {
      setStatus(await window.native.ranked.status())
    } catch (error) {
      setStatus((current) => ({ ...current, online: false, error: error instanceof Error ? error.message : String(error) }))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => void refresh(), 10_000)
    return () => window.clearInterval(timer)
  }, [refresh])

  const isRunning = status.instance ? running.some((game) => game.instanceId === status.instance?.id) : false
  const action = async (): Promise<void> => {
    setWorking(true)
    try {
      if (!status.configured) {
        const next = await window.native.ranked.provision()
        setStatus(next)
        await refreshInstances()
        push({ kind: 'success', title: 'Native Ranked is ready' })
      } else {
        push({ kind: 'info', title: 'Launching Native Ranked…' })
        await window.native.ranked.launch()
      }
    } catch (error) {
      toastError(error, status.configured ? "Couldn't launch Native Ranked" : "Couldn't set up Native Ranked")
    } finally {
      setWorking(false)
    }
  }

  const playerRank = useMemo(() => {
    if (!status.player) return null
    const index = status.leaderboard.findIndex((entry) => entry.id === status.player?.id)
    return index < 0 ? null : index + 1
  }, [status.leaderboard, status.player])

  const actionLabel = working
    ? status.configured
      ? 'Launching…'
      : 'Setting up…'
    : isRunning
      ? 'Race client running'
      : status.configured
        ? 'Launch ranked'
        : 'Set up ranked'

  const displayName = loading
    ? 'Loading…'
    : (status.player?.username ?? account?.username ?? (status.configured ? 'Reconnect required' : 'Not set up'))
  const tier = status.player ? tierInfo(status.player.rating) : null

  return (
    <div className="min-h-full px-8 py-7" data-testid="ranked-screen">
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.25, 1, 0.5, 1] }}
        className="relative flex min-h-[600px] flex-col overflow-hidden rounded-card border border-line-subtle bg-surface-inset"
      >
        {/* Arena backdrop: a single spotlit stage, no busy imagery. */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-[58%] rounded-full bg-accent/[0.06] blur-[100px]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-line-strong to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black/55 to-transparent" />

        {/* Top bar */}
        <header className="relative z-10 flex items-center justify-between px-7 py-5">
          <div className="flex items-center gap-3">
            <span className="text-h3 font-extrabold tracking-tight text-content-primary">NATIVE RANKED</span>
            <Chip>SEASON ZERO</Chip>
          </div>
          <Chip>1.16.1 · FABRIC</Chip>
        </header>

        {/* Stage: rank/stats · skin · standings */}
        <div className="relative z-10 grid flex-1 grid-cols-[minmax(0,0.92fr)_minmax(0,1fr)_minmax(0,0.96fr)] items-center gap-5 px-7">
          <div className="flex flex-col gap-3">
            <RankBadge player={status.player} rank={playerRank} tier={tier} configured={status.configured} />
            <StatStrip player={status.player} />
          </div>

          <CharacterStage account={account} name={displayName} tierName={tier?.name ?? null} rating={status.player?.rating ?? null} />

          <Standings players={status.leaderboard} loading={loading} currentId={status.player?.id} />
        </div>

        {/* Bottom bar: the play CTA + live service pulse */}
        <footer className="relative z-10 flex flex-col items-center gap-3 px-7 pb-8 pt-3">
          <Button
            icon={isRunning ? Activity : status.configured ? Play : Sparkles}
            onClick={() => void action()}
            disabled={working || loading || !status.online || isRunning}
            data-testid="ranked-primary-action"
            className="h-14 min-w-[300px] rounded-full px-10 text-[16px] font-extrabold shadow-popover"
          >
            {actionLabel}
          </Button>
          <div className="flex items-center gap-4 text-small text-content-muted">
            <LivePulse service={status.service} online={status.online} />
            <button
              onClick={() => void refresh()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 text-content-secondary transition-colors hover:text-content-primary disabled:opacity-40"
            >
              <RefreshCw size={14} strokeWidth={2} />
              Refresh
            </button>
          </div>
          {status.error && <p className="text-small text-danger">{status.error}</p>}
        </footer>
      </motion.section>
    </div>
  )
}

function CharacterStage({
  account,
  name,
  tierName,
  rating
}: {
  account: PlayerHeadAccount
  name: string
  tierName: string | null
  rating: number | null
}): React.JSX.Element {
  return (
    <div className="relative flex h-full flex-col items-center justify-center">
      {/* Grounding shadow under the model. */}
      <div className="pointer-events-none absolute bottom-[58px] h-5 w-40 rounded-[100%] bg-black/60 blur-md" />
      <SkinViewer3D account={account} width={248} height={370} className="relative select-none" />
      <div className="relative -mt-1 text-center">
        <div className="max-w-[220px] truncate text-h2 font-bold leading-tight text-content-primary">{name}</div>
        <div className="mt-0.5 text-small text-content-secondary">
          {tierName ? `${tierName}${rating != null ? ` · ${rating}` : ''}` : 'Set up to enter the season'}
        </div>
      </div>
    </div>
  )
}

function RankBadge({
  player,
  rank,
  tier,
  configured
}: {
  player: RankedPlayer | null
  rank: number | null
  tier: { name: string; progress: number } | null
  configured: boolean
}): React.JSX.Element {
  return (
    <div className="rounded-card border border-line-subtle bg-surface-raised/90 p-4 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md2 border border-line-strong bg-surface-input text-content-primary">
          <Shield size={24} strokeWidth={1.6} />
        </div>
        <div className="min-w-0">
          <div className="text-tiny font-bold uppercase tracking-[0.16em] text-content-muted">Your rank</div>
          <div className="truncate text-h2 leading-tight text-content-primary">
            {tier ? tier.name : configured ? 'Unranked' : 'Not set up'}
          </div>
        </div>
      </div>
      <div className="mt-4 flex items-end justify-between">
        <span className="font-mono text-[30px] font-extrabold leading-none text-content-primary">
          {player?.rating ?? '—'}
        </span>
        <span className="text-small text-content-secondary">{rank ? `#${rank} global` : 'unranked'}</span>
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-input">
        <div className="h-full rounded-full bg-accent" style={{ width: `${tier ? tier.progress : 0}%` }} />
      </div>
    </div>
  )
}

function StatStrip({ player }: { player: RankedPlayer | null }): React.JSX.Element {
  const total = player ? player.wins + player.losses : 0
  const winRate = total > 0 && player ? Math.round((player.wins / total) * 100) : 0
  return (
    <div className="grid grid-cols-3 overflow-hidden rounded-card border border-line-subtle bg-surface-raised/90 backdrop-blur-sm">
      <Stat label="Wins" value={player?.wins ?? 0} />
      <Stat label="Losses" value={player?.losses ?? 0} divided />
      <Stat label="Win %" value={`${winRate}%`} divided />
    </div>
  )
}

function Stat({ label, value, divided }: { label: string; value: string | number; divided?: boolean }): React.JSX.Element {
  return (
    <div className={`px-3 py-3 text-center ${divided ? 'border-l border-line-subtle' : ''}`}>
      <div className="text-h3 font-bold text-content-primary">{value}</div>
      <div className="mt-0.5 text-tiny font-semibold uppercase tracking-wider text-content-muted">{label}</div>
    </div>
  )
}

function Standings({
  players,
  loading,
  currentId
}: {
  players: RankedPlayer[]
  loading: boolean
  currentId?: string
}): React.JSX.Element {
  return (
    <div className="overflow-hidden rounded-card border border-line-subtle bg-surface-raised/90 backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-line-subtle px-4 py-3">
        <div>
          <div className="text-tiny font-bold uppercase tracking-[0.16em] text-content-muted">Season zero</div>
          <div className="mt-0.5 text-body font-bold text-content-primary">Standings</div>
        </div>
        <Trophy size={17} className="text-content-secondary" />
      </div>
      <div className="p-2">
        {loading && (
          <div className="flex h-[168px] items-center justify-center text-content-muted">
            <motion.span
              className="inline-block h-5 w-5 rounded-full border-2 border-content-muted border-t-accent"
              animate={{ rotate: 360 }}
              transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
            />
          </div>
        )}
        {!loading && players.length === 0 && (
          <div className="flex h-[168px] flex-col items-center justify-center px-4 text-center text-content-muted">
            <Trophy size={24} strokeWidth={1.5} />
            <span className="mt-2 text-small">The first race claims the top seed.</span>
          </div>
        )}
        {!loading &&
          players.slice(0, 6).map((player, index) => {
            const mine = player.id === currentId
            return (
              <div
                key={player.id}
                className={`grid grid-cols-[26px_1fr_auto] items-center gap-2 rounded-sm2 px-2.5 py-2 text-small ${
                  mine ? 'bg-accent-tint' : ''
                }`}
              >
                <span className={`font-mono text-tiny font-bold ${index < 3 ? 'text-content-primary' : 'text-content-muted'}`}>
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="truncate font-semibold text-content-primary">{player.username}</span>
                <span className="font-mono font-semibold text-content-primary">{player.rating}</span>
              </div>
            )
          })}
      </div>
    </div>
  )
}

function LivePulse({
  service,
  online
}: {
  service: RankedStatus['service']
  online: boolean
}): React.JSX.Element | null {
  if (!online || !service) return null
  return (
    <span className="flex items-center gap-2">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
      </span>
      <span>
        <span className="font-mono font-semibold text-content-secondary">{service.players.toLocaleString()}</span> online
        <span className="mx-2 text-line-strong">·</span>
        <span className="font-mono font-semibold text-content-secondary">{service.activeMatches}</span> racing now
      </span>
    </span>
  )
}
