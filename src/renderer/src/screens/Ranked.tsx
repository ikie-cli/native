import { Activity, Crown, Flag, Play, RefreshCw, Shield, Sparkles, Swords, Trophy } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { RankedMatchSummary, RankedPlayer, RankedProfile, RankedStatus } from '@shared/types'
import { Button, Chip, EmptyState, IconButton, Spinner } from '@/components/ui/ui'
import { Modal } from '@/components/ui/modal'
import type { PlayerHeadAccount } from '@/components/PlayerHead'
import { SkinViewer3D } from '@/components/SkinViewer'
import { toastError, useAccounts, useInstances, useRunning, useToasts } from '@/stores/data'
import { timeAgo } from '@/lib/util'

const EMPTY: RankedStatus = {
  configured: false,
  online: false,
  instance: null,
  player: null,
  leaderboard: [],
  history: [],
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
function tierName(rating: number): string {
  let name = TIERS[0].name
  for (const t of TIERS) if (rating >= t.min) name = t.name
  return name
}
function raceTime(ms: number | null): string {
  if (!ms || ms < 0) return '—'
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function RankedScreen(): React.JSX.Element {
  const [status, setStatus] = useState<RankedStatus>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [profileId, setProfileId] = useState<string | null>(null)
  const refreshInstances = useInstances((s) => s.refresh)
  const running = useRunning((s) => s.running)
  const account = useAccounts((s) => s.accounts.find((a) => a.active) ?? null)
  const push = useToasts((s) => s.push)

  const refresh = useCallback(async () => {
    try {
      setStatus(await window.native.ranked.status())
    } catch (error) {
      setStatus((c) => ({ ...c, online: false, error: error instanceof Error ? error.message : String(error) }))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => void refresh(), 10_000)
    return () => window.clearInterval(timer)
  }, [refresh])

  const isRunning = status.instance ? running.some((g) => g.instanceId === status.instance?.id) : false
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
    const i = status.leaderboard.findIndex((e) => e.id === status.player?.id)
    return i < 0 ? null : i + 1
  }, [status.leaderboard, status.player])

  const actionLabel = working
    ? status.configured ? 'Launching…' : 'Setting up…'
    : isRunning ? 'Race client running' : status.configured ? 'Launch ranked' : 'Set up ranked'

  const subtitle =
    status.online && status.service
      ? `Same seed, same second — 1v1 to the dragon · ${status.service.players.toLocaleString()} online · ${status.service.activeMatches} racing now`
      : 'Same seed, same second — a fair 1v1 speedrun to the Ender Dragon.'

  return (
    <div className="flex h-full flex-col p-6" data-testid="ranked-screen">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-display text-content-primary">Native Ranked</h1>
          <p className="mt-1 truncate text-small text-content-secondary">{subtitle}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <IconButton icon={RefreshCw} label="Refresh" variant="ghost" onClick={() => void refresh()} />
          <Button
            icon={isRunning ? Activity : status.configured ? Play : Sparkles}
            onClick={() => void action()}
            disabled={working || loading || !status.online || isRunning}
            data-testid="ranked-primary-action"
          >
            {actionLabel}
          </Button>
        </div>
      </div>

      {status.error && !status.online && (
        <p className="mt-3 text-small text-danger">{status.error}</p>
      )}

      <div className="mt-5 min-h-0 flex-1 overflow-y-auto pr-0.5">
        <div className="grid grid-cols-1 gap-4 min-[1080px]:grid-cols-[0.95fr_1.05fr]">
          <ProfileCard
            account={account}
            player={status.player}
            rank={playerRank}
            configured={status.configured}
            loading={loading}
          />
          <Leaderboard
            players={status.leaderboard}
            loading={loading}
            currentId={status.player?.id}
            onSelect={setProfileId}
          />
        </div>

        <RecentRaces history={status.history} currentId={status.player?.id} loading={loading} />

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Feature icon={Shield} title="Fair start" detail="Movement locked till zero" />
          <Feature icon={Activity} title="Live pace" detail="Milestones in your HUD" />
          <Feature icon={Swords} title="Same seed" detail="One identical world" />
          <Feature icon={Flag} title="First to the dragon" detail="Wins the race & Elo" />
        </div>
      </div>

      <PlayerProfileModal playerId={profileId} onClose={() => setProfileId(null)} />
    </div>
  )
}

function ProfileCard({
  account,
  player,
  rank,
  configured,
  loading
}: {
  account: PlayerHeadAccount
  player: RankedPlayer | null
  rank: number | null
  configured: boolean
  loading: boolean
}): React.JSX.Element {
  const total = player ? player.wins + player.losses : 0
  const winRate = total > 0 && player ? Math.round((player.wins / total) * 100) : 0
  const name = loading ? 'Loading…' : (player?.username ?? account?.username ?? (configured ? 'Reconnect required' : 'Not set up'))
  return (
    <section className="rounded-card border border-line-subtle bg-surface-raised p-5">
      <div className="flex items-center justify-between">
        <div className="text-tiny font-bold uppercase tracking-[0.16em] text-content-muted">Your profile</div>
        <div className="flex items-center gap-2">
          <Chip>SEASON ZERO</Chip>
          <Chip>1.16.1 · FABRIC</Chip>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-5">
        <div className="flex h-[184px] w-[132px] shrink-0 items-center justify-center overflow-hidden rounded-md2 bg-surface-inset">
          <SkinViewer3D account={account} width={132} height={184} className="select-none" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-h1 text-content-primary">{name}</div>
          <div className="mt-1 flex items-center gap-1.5 text-small text-content-secondary">
            <Shield size={14} strokeWidth={2} />
            {player ? tierName(player.rating) : 'Unranked'}
            {rank ? <span className="text-content-muted">· #{rank} global</span> : null}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <Metric label="Rating" value={player?.rating ?? '—'} />
            <Metric label="Win rate" value={`${winRate}%`} />
            <Metric label="Wins" value={player?.wins ?? 0} />
            <Metric label="Losses" value={player?.losses ?? 0} />
          </div>
        </div>
      </div>
    </section>
  )
}

function Metric({ label, value }: { label: string; value: string | number }): React.JSX.Element {
  return (
    <div className="rounded-md2 bg-surface-inset px-3 py-2">
      <div className="text-tiny font-semibold uppercase tracking-wider text-content-muted">{label}</div>
      <div className="mt-0.5 text-h3 text-content-primary">{value}</div>
    </div>
  )
}

function Leaderboard({
  players,
  loading,
  currentId,
  onSelect
}: {
  players: RankedPlayer[]
  loading: boolean
  currentId?: string
  onSelect: (id: string) => void
}): React.JSX.Element {
  return (
    <section className="flex flex-col overflow-hidden rounded-card border border-line-subtle bg-surface-raised">
      <header className="flex items-center justify-between border-b border-line-subtle px-5 py-4">
        <div>
          <div className="text-tiny font-bold uppercase tracking-[0.16em] text-content-muted">Season zero</div>
          <h2 className="mt-0.5 text-h3 text-content-primary">Leaderboard</h2>
        </div>
        <Trophy size={18} className="text-content-secondary" />
      </header>
      <div className="min-h-[196px] p-2">
        {loading ? (
          <div className="flex h-[188px] items-center justify-center"><Spinner size={22} /></div>
        ) : players.length === 0 ? (
          <div className="flex h-[188px] flex-col items-center justify-center text-content-muted">
            <Trophy size={26} strokeWidth={1.5} />
            <span className="mt-2 text-small">The first race claims the top seed.</span>
          </div>
        ) : (
          players.slice(0, 8).map((p, i) => (
            <button
              key={p.id}
              onClick={() => onSelect(p.id)}
              className={`grid w-full grid-cols-[28px_1fr_54px_64px] items-center gap-2 rounded-sm2 px-3 py-2 text-left text-small transition-colors duration-fast hover:bg-surface-hover ${
                p.id === currentId ? 'bg-accent-tint' : ''
              }`}
            >
              <span className={`font-mono text-tiny font-bold ${i < 3 ? 'text-content-primary' : 'text-content-muted'}`}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="truncate font-semibold text-content-primary">{p.username}</span>
              <span className="text-right text-content-secondary">{p.wins}W</span>
              <span className="text-right font-mono font-semibold text-content-primary">{p.rating}</span>
            </button>
          ))
        )}
      </div>
    </section>
  )
}

function ResultBadge({ won }: { won: boolean }): React.JSX.Element {
  return (
    <span
      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md2 text-tiny font-extrabold ${
        won ? 'bg-accent-tint text-accent' : 'bg-danger-tint text-danger'
      }`}
    >
      {won ? 'W' : 'L'}
    </span>
  )
}

function RecentRaces({
  history,
  currentId,
  loading
}: {
  history: RankedMatchSummary[]
  currentId?: string
  loading: boolean
}): React.JSX.Element {
  return (
    <section className="mt-4 overflow-hidden rounded-card border border-line-subtle bg-surface-raised">
      <header className="flex items-center justify-between border-b border-line-subtle px-5 py-4">
        <h2 className="text-h3 text-content-primary">Recent races</h2>
        <Swords size={17} className="text-content-secondary" />
      </header>
      {loading ? (
        <div className="flex h-24 items-center justify-center"><Spinner size={20} /></div>
      ) : history.length === 0 ? (
        <div className="px-5 py-8 text-center text-small text-content-muted">
          No races yet — set up and play your first ranked run.
        </div>
      ) : (
        <div>
          {history.slice(0, 8).map((m) => {
            const won = !!currentId && m.winnerId === currentId
            return (
              <div
                key={m.id}
                className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-3 border-b border-line-subtle px-5 py-3 last:border-0"
              >
                <ResultBadge won={won} />
                <span className="min-w-0 truncate text-small text-content-primary">
                  vs <span className="font-semibold">{m.opponent}</span>
                </span>
                <span className="font-mono text-tiny text-content-secondary">{raceTime(m.finishMs)}</span>
                <span className={`font-mono text-tiny font-semibold ${m.ratingDelta >= 0 ? 'text-accent' : 'text-danger'}`}>
                  {m.ratingDelta > 0 ? '+' : ''}{m.ratingDelta}
                </span>
                <span className="text-right text-tiny text-content-muted">
                  {m.finishedAt ? timeAgo(m.finishedAt) : ''}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function Feature({
  icon: Icon,
  title,
  detail
}: {
  icon: typeof Shield
  title: string
  detail: string
}): React.JSX.Element {
  return (
    <div className="rounded-card border border-line-subtle bg-surface-raised p-4">
      <Icon size={18} strokeWidth={2} className="text-content-primary" />
      <div className="mt-2.5 text-small font-bold text-content-primary">{title}</div>
      <div className="mt-0.5 text-tiny text-content-muted">{detail}</div>
    </div>
  )
}

function PlayerProfileModal({
  playerId,
  onClose
}: {
  playerId: string | null
  onClose: () => void
}): React.JSX.Element {
  const [profile, setProfile] = useState<RankedProfile | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!playerId) return
    setProfile(null)
    setLoading(true)
    window.native.ranked
      .profile(playerId)
      .then(setProfile)
      .catch(() => setProfile(null))
      .finally(() => setLoading(false))
  }, [playerId])

  const p = profile?.player
  const total = p ? p.wins + p.losses : 0
  const winRate = total > 0 && p ? Math.round((p.wins / total) * 100) : 0

  return (
    <Modal
      open={!!playerId}
      onClose={onClose}
      width={440}
      title={p?.username ?? 'Player profile'}
      titleIcon={<Crown size={20} className="text-accent" />}
    >
      {loading ? (
        <div className="flex h-40 items-center justify-center"><Spinner size={24} /></div>
      ) : !profile || !p ? (
        <EmptyState icon={Crown} title="Profile unavailable" detail="Couldn't load this player right now." />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-1.5 text-small text-content-secondary">
            <Shield size={14} strokeWidth={2} /> {tierName(p.rating)}
          </div>
          <div className="grid grid-cols-4 gap-2.5">
            <Metric label="Rating" value={p.rating} />
            <Metric label="Wins" value={p.wins} />
            <Metric label="Losses" value={p.losses} />
            <Metric label="Win %" value={`${winRate}%`} />
          </div>
          <div>
            <div className="mb-2 text-tiny font-bold uppercase tracking-[0.16em] text-content-muted">Recent races</div>
            {profile.history.length === 0 ? (
              <div className="rounded-md2 bg-surface-inset px-4 py-6 text-center text-small text-content-muted">
                No finished races yet.
              </div>
            ) : (
              <div className="overflow-hidden rounded-md2 bg-surface-inset">
                {profile.history.slice(0, 6).map((m) => (
                  <div
                    key={m.id}
                    className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 border-b border-line-subtle px-3 py-2 text-small last:border-0"
                  >
                    <ResultBadge won={m.winnerId === p.id} />
                    <span className="min-w-0 truncate text-content-primary">vs {m.opponent}</span>
                    <span className="font-mono text-tiny text-content-secondary">{raceTime(m.finishMs)}</span>
                    <span className={`font-mono text-tiny font-semibold ${m.ratingDelta >= 0 ? 'text-accent' : 'text-danger'}`}>
                      {m.ratingDelta > 0 ? '+' : ''}{m.ratingDelta}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
