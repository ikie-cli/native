import { motion } from 'framer-motion'
import {
  Activity,
  Check,
  CircleDot,
  Crown,
  Gauge,
  LoaderCircle,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Swords,
  Trophy,
  Users
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { RankedPlayer, RankedStatus } from '@shared/types'
import { Button, Chip } from '@/components/ui/ui'
import { toastError, useInstances, useRunning, useToasts } from '@/stores/data'

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

  return (
    <div className="min-h-full px-8 py-7" data-testid="ranked-screen">
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: [0.25, 1, 0.5, 1] }}
        className="relative overflow-hidden rounded-card border border-line-subtle bg-surface-raised"
      >
        <div className="pointer-events-none absolute -right-28 -top-36 h-96 w-96 rounded-full bg-accent/[0.07] blur-3xl" />
        <div className="relative grid min-h-[300px] grid-cols-[1.25fr_0.75fr]">
          <div className="flex flex-col justify-center px-9 py-8">
            <div className="mb-5 flex items-center gap-2">
              <Chip icon={CircleDot} className={status.online ? 'text-content-primary' : 'text-danger'}>
                {status.online ? 'SERVICE ONLINE' : 'SERVICE OFFLINE'}
              </Chip>
              <Chip>1.16.1 · FABRIC</Chip>
            </div>
            <h1 className="max-w-[570px] text-[38px] font-extrabold leading-[1.05] tracking-[-0.04em] text-content-primary">
              Same seed. Same second. <span className="text-content-secondary">Pure speed.</span>
            </h1>
            <p className="mt-4 max-w-[560px] text-body leading-6 text-content-secondary">
              Native creates an isolated race world for both players, locks movement until the synchronized countdown, and tracks the run through the dragon kill.
            </p>
            <div className="mt-7 flex items-center gap-3">
              <Button
                icon={isRunning ? Activity : status.configured ? Play : Sparkles}
                onClick={() => void action()}
                disabled={working || loading || !status.online || isRunning}
                className="min-w-[190px]"
                data-testid="ranked-primary-action"
              >
                {working
                  ? status.configured
                    ? 'Launching…'
                    : 'Setting up…'
                  : isRunning
                    ? 'Race client running'
                    : status.configured
                      ? 'Launch ranked'
                      : 'Set up ranked'}
              </Button>
              <Button icon={RefreshCw} variant="ghost" onClick={() => void refresh()} disabled={loading}>
                Refresh
              </Button>
            </div>
            {status.error && <p className="mt-4 text-small text-danger">{status.error}</p>}
          </div>

          <div className="relative flex items-center justify-center border-l border-line-subtle bg-surface-inset/70 p-7">
            <motion.div
              animate={{ rotate: [0, 2, -2, 0], y: [0, -5, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
              className="relative flex h-48 w-48 items-center justify-center rounded-full border border-line-strong bg-surface-raised shadow-popover"
            >
              <div className="absolute inset-5 rounded-full border border-dashed border-line-strong" />
              <Swords size={74} strokeWidth={1.25} className="text-content-primary" />
              <span className="absolute bottom-6 rounded-full bg-accent px-3 py-1 text-tiny font-extrabold tracking-widest text-accent-contrast">
                RANKED
              </span>
            </motion.div>
          </div>
        </div>
      </motion.section>

      <div className="mt-5 grid grid-cols-[0.78fr_1.22fr] gap-5">
        <PlayerCard player={status.player} rank={playerRank} configured={status.configured} loading={loading} />
        <Leaderboard players={status.leaderboard} loading={loading} currentId={status.player?.id} />
      </div>

      <div className="mt-5 grid grid-cols-4 gap-4">
        <Feature icon={ShieldCheck} title="Fair start" detail="Movement locked until zero" />
        <Feature icon={Gauge} title="Live pace" detail="Race progress in your HUD" />
        <Feature icon={Users} title="Native identity" detail="Online or offline profiles" />
        <Feature icon={Check} title="Automatic" detail="World, seed, and result handled" />
      </div>
    </div>
  )
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
  return (
    <section className="rounded-card border border-line-subtle bg-surface-raised p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-tiny font-bold uppercase tracking-[0.16em] text-content-muted">Your profile</div>
          <div className="mt-2 text-h2 text-content-primary">
            {loading ? 'Loading…' : player?.username ?? (configured ? 'Reconnect required' : 'Not set up')}
          </div>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-md2 bg-surface-input text-content-primary">
          <Crown size={22} />
        </div>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3">
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
        <Trophy size={21} className="text-content-secondary" />
      </div>
      <div className="px-3 py-2">
        {loading && (
          <div className="flex h-40 items-center justify-center text-content-muted">
            <LoaderCircle className="animate-spin" size={22} />
          </div>
        )}
        {!loading && players.length === 0 && (
          <div className="flex h-40 flex-col items-center justify-center text-content-muted">
            <Trophy size={28} strokeWidth={1.5} />
            <span className="mt-2 text-small">The first race claims the first rank.</span>
          </div>
        )}
        {!loading &&
          players.slice(0, 7).map((player, index) => (
            <motion.div
              key={player.id}
              initial={{ opacity: 0, x: 6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.035 }}
              className={`grid grid-cols-[40px_1fr_80px_64px] items-center rounded-sm2 px-3 py-2.5 text-small ${
                player.id === currentId ? 'bg-accent-tint' : 'odd:bg-surface-inset/60'
              }`}
            >
              <span className="font-mono text-content-muted">{String(index + 1).padStart(2, '0')}</span>
              <span className="truncate font-semibold text-content-primary">{player.username}</span>
              <span className="text-right text-content-secondary">{player.wins}W</span>
              <span className="text-right font-mono font-semibold text-content-primary">{player.rating}</span>
            </motion.div>
          ))}
      </div>
    </section>
  )
}

function Feature({ icon: Icon, title, detail }: { icon: typeof ShieldCheck; title: string; detail: string }): React.JSX.Element {
  return (
    <div className="rounded-card border border-line-subtle bg-surface-raised p-4 transition-colors hover:bg-surface-hover">
      <Icon size={19} className="text-content-primary" />
      <div className="mt-3 text-small font-bold text-content-primary">{title}</div>
      <div className="mt-0.5 text-tiny text-content-muted">{detail}</div>
    </div>
  )
}
