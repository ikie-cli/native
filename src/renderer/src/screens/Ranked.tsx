import { motion } from 'framer-motion'
import {
  Activity,
  CircleDot,
  Crown,
  Flag,
  Play,
  RefreshCw,
  Sparkles,
  Timer,
  Trophy
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { RankedPlayer, RankedStatus } from '@shared/types'
import { Button, Chip } from '@/components/ui/ui'
import { toastError, useInstances, useRunning, useToasts } from '@/stores/data'
import findArt from '@/assets/ranked/find.png'
import inviteArt from '@/assets/ranked/invite.png'

const EMPTY: RankedStatus = {
  configured: false,
  online: false,
  instance: null,
  player: null,
  leaderboard: [],
  service: null
}

export function RankedScreen(): React.JSX.Element {
  const [status, setStatus] = useState<RankedStatus>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const refreshInstances = useInstances((s) => s.refresh)
  const running = useRunning((s) => s.running)
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

  return (
    <div className="min-h-full px-8 py-7" data-testid="ranked-screen">
      {/* ---------- Hero ---------- */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: [0.25, 1, 0.5, 1] }}
        className="relative overflow-hidden rounded-card border border-line-subtle bg-surface-raised"
      >
        <div className="pointer-events-none absolute inset-y-0 right-0 w-2/3 bg-gradient-to-l from-accent/[0.06] via-accent/[0.02] to-transparent" />
        <div className="pointer-events-none absolute -right-10 top-1/2 h-[360px] w-[360px] -translate-y-1/2 rounded-full bg-accent/[0.06] blur-3xl" />
        <div className="relative grid grid-cols-[1.14fr_0.86fr] items-center gap-4">
          <div className="min-w-0 px-9 py-9">
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <Chip icon={CircleDot} className={status.online ? 'text-content-primary' : 'text-danger'}>
                {status.online ? 'SERVICE ONLINE' : 'SERVICE OFFLINE'}
              </Chip>
              <Chip>1.16.1 · FABRIC</Chip>
            </div>
            <h1 className="max-w-[520px] text-[38px] font-extrabold leading-[1.04] tracking-[-0.045em] text-content-primary">
              Find a rival.{' '}
              <span className="text-content-secondary">Race the same seed.</span>
            </h1>
            <p className="mt-4 max-w-[430px] text-body leading-6 text-content-secondary">
              Two runners, one identical world. Native locks movement until a synchronized countdown, then tracks every milestone through the dragon.
            </p>
            <div className="mt-7 flex items-center gap-3">
              <Button
                icon={isRunning ? Activity : status.configured ? Play : Sparkles}
                onClick={() => void action()}
                disabled={working || loading || !status.online || isRunning}
                className="min-w-[190px]"
                data-testid="ranked-primary-action"
              >
                {actionLabel}
              </Button>
              <Button icon={RefreshCw} variant="ghost" onClick={() => void refresh()} disabled={loading}>
                Refresh
              </Button>
            </div>
            <LiveStats service={status.service} online={status.online} />
            {status.error && <p className="mt-4 text-small text-danger">{status.error}</p>}
          </div>

          <div className="relative flex h-full min-h-[248px] items-center justify-center pr-6">
            <motion.img
              src={findArt}
              alt=""
              draggable={false}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1, y: [0, -7, 0] }}
              transition={{
                opacity: { duration: 0.5 },
                scale: { duration: 0.5, ease: [0.25, 1, 0.5, 1] },
                y: { duration: 5.5, repeat: Infinity, ease: 'easeInOut' }
              }}
              className="pointer-events-none w-[266px] max-w-full select-none object-contain drop-shadow-[0_24px_44px_rgba(0,0,0,0.55)]"
            />
          </div>
        </div>
      </motion.section>

      {/* ---------- Profile + Leaderboard ---------- */}
      <div className="mt-5 grid grid-cols-[0.8fr_1.2fr] gap-5">
        <PlayerCard player={status.player} rank={playerRank} configured={status.configured} loading={loading} />
        <Leaderboard players={status.leaderboard} loading={loading} currentId={status.player?.id} />
      </div>

      {/* ---------- How a race works ---------- */}
      <section className="mt-5 grid grid-cols-[0.82fr_1.18fr] overflow-hidden rounded-card border border-line-subtle bg-surface-raised">
        <div className="relative flex items-end justify-center overflow-hidden border-r border-line-subtle bg-surface-inset/60 px-4 pt-6">
          <div className="pointer-events-none absolute -left-8 top-4 h-40 w-40 rounded-full bg-accent/[0.06] blur-2xl" />
          <div className="absolute left-5 top-5">
            <div className="text-tiny font-bold uppercase tracking-[0.16em] text-content-muted">1 versus 1</div>
            <div className="mt-1 text-h3 leading-tight text-content-primary">Bring a<br />challenger</div>
          </div>
          <img
            src={inviteArt}
            alt=""
            draggable={false}
            className="pointer-events-none max-h-[188px] w-auto select-none object-contain drop-shadow-[0_18px_32px_rgba(0,0,0,0.5)]"
          />
        </div>
        <div className="grid grid-rows-3">
          <Step
            index="01"
            icon={Sparkles}
            title="Same seed, same second"
            detail="Both players generate one signed world and stay frozen until the countdown hits zero."
          />
          <Step
            index="02"
            icon={Timer}
            title="Live milestones"
            detail="Nether, pearls, blaze rods, eyes — your pace and your rival's stream into the in-game HUD."
            divided
          />
          <Step
            index="03"
            icon={Flag}
            title="First to the dragon"
            detail="The opening dragon kill takes the win. Ranked results settle Elo the moment it lands."
            divided
          />
        </div>
      </section>
    </div>
  )
}

function LiveStats({
  service,
  online
}: {
  service: RankedStatus['service']
  online: boolean
}): React.JSX.Element | null {
  if (!online || !service) return null
  const items = [
    { label: 'online', value: service.players },
    { label: 'racing now', value: service.activeMatches },
    { label: 'races run', value: service.completedMatches }
  ]
  return (
    <div className="mt-6 flex items-center gap-5 text-small text-content-muted">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
      </span>
      {items.map((item, index) => (
        <span key={item.label} className="flex items-center gap-1.5">
          {index > 0 && <span className="mr-3 text-line-strong">·</span>}
          <span className="font-mono font-semibold text-content-secondary">{item.value.toLocaleString()}</span>
          {item.label}
        </span>
      ))}
    </div>
  )
}

function rankTier(rating: number): string {
  if (rating >= 1800) return 'Native Master'
  if (rating >= 1500) return 'Diamond'
  if (rating >= 1250) return 'Platinum'
  if (rating >= 1050) return 'Gold'
  if (rating >= 850) return 'Silver'
  return 'Bronze'
}

function PlayerCard({
  player,
  rank,
  configured,
  loading
}: {
  player: RankedPlayer | null
  rank: number | null
  configured: boolean
  loading: boolean
}): React.JSX.Element {
  const total = player ? player.wins + player.losses : 0
  const winRate = total > 0 && player ? Math.round((player.wins / total) * 100) : 0
  const name = loading ? 'Loading…' : (player?.username ?? (configured ? 'Reconnect required' : 'Not set up'))
  return (
    <section className="rounded-card border border-line-subtle bg-surface-raised p-5">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div className="text-tiny font-bold uppercase tracking-[0.16em] text-content-muted">Your profile</div>
          <div className="mt-2 truncate text-h2 text-content-primary">{name}</div>
          {player && <div className="mt-0.5 text-small text-content-secondary">{rankTier(player.rating)}</div>}
        </div>
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md2 bg-surface-input text-content-primary">
          <Crown size={22} />
        </div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <Metric label="Rating" value={player?.rating ?? '—'} />
        <Metric label="Global rank" value={rank ? `#${rank}` : '—'} />
        <Metric label="Wins" value={player?.wins ?? 0} />
        <Metric label="Win rate" value={`${winRate}%`} />
      </div>
    </section>
  )
}

function Metric({ label, value }: { label: string; value: string | number }): React.JSX.Element {
  return (
    <div className="rounded-md2 bg-surface-inset px-4 py-3">
      <div className="text-tiny font-semibold uppercase tracking-wider text-content-muted">{label}</div>
      <div className="mt-1 text-h3 text-content-primary">{value}</div>
    </div>
  )
}

function Leaderboard({
  players,
  loading,
  currentId
}: {
  players: RankedPlayer[]
  loading: boolean
  currentId?: string
}): React.JSX.Element {
  return (
    <section className="overflow-hidden rounded-card border border-line-subtle bg-surface-raised">
      <div className="flex items-center justify-between border-b border-line-subtle px-5 py-4">
        <div>
          <div className="text-tiny font-bold uppercase tracking-[0.16em] text-content-muted">Season zero</div>
          <h2 className="mt-1 text-h3 text-content-primary">Leaderboard</h2>
        </div>
        <Trophy size={20} className="text-content-secondary" />
      </div>
      <div className="px-3 py-2">
        {loading && (
          <div className="flex h-40 items-center justify-center text-content-muted">
            <motion.span
              className="inline-block h-5 w-5 rounded-full border-2 border-content-muted border-t-accent"
              animate={{ rotate: 360 }}
              transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
            />
          </div>
        )}
        {!loading && players.length === 0 && (
          <div className="flex h-40 flex-col items-center justify-center text-content-muted">
            <Trophy size={26} strokeWidth={1.5} />
            <span className="mt-2 text-small">The first race claims the first rank.</span>
          </div>
        )}
        {!loading &&
          players.slice(0, 7).map((player, index) => {
            const mine = player.id === currentId
            return (
              <motion.div
                key={player.id}
                initial={{ opacity: 0, x: 6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.03 }}
                className={`grid grid-cols-[34px_1fr_58px_66px] items-center rounded-sm2 px-3 py-2.5 text-small ${
                  mine ? 'bg-accent-tint' : 'odd:bg-surface-inset/50'
                }`}
              >
                <span
                  className={`font-mono text-tiny font-bold ${index < 3 ? 'text-content-primary' : 'text-content-muted'}`}
                >
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="truncate font-semibold text-content-primary">{player.username}</span>
                <span className="text-right text-content-secondary">{player.wins}W</span>
                <span className="text-right font-mono font-semibold text-content-primary">{player.rating}</span>
              </motion.div>
            )
          })}
      </div>
    </section>
  )
}

function Step({
  index,
  icon: Icon,
  title,
  detail,
  divided
}: {
  index: string
  icon: typeof Sparkles
  title: string
  detail: string
  divided?: boolean
}): React.JSX.Element {
  return (
    <div className={`flex items-start gap-4 px-6 py-5 ${divided ? 'border-t border-line-subtle' : ''}`}>
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md2 bg-surface-input text-content-primary">
        <Icon size={17} strokeWidth={2} />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-tiny font-bold text-content-muted">{index}</span>
          <span className="text-body font-bold text-content-primary">{title}</span>
        </div>
        <p className="mt-1 text-small leading-5 text-content-secondary">{detail}</p>
      </div>
    </div>
  )
}
