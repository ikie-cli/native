import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Play, Plus, RefreshCw, Server, Sparkles, Trash2, Users } from 'lucide-react'
import type { ServerEntry, ServerStatus } from '@shared/types'
import { useInstances, useServers, useToasts, toastError } from '@/stores/data'
import { Button, EmptyState, IconButton, Input, Spinner } from '@/components/ui/ui'
import { Modal, FieldLabel } from '@/components/ui/modal'
import { Select } from '@/components/ui/menu'
import { cn, formatPlaytime, timeAgo } from '@/lib/util'

function latencyColor(ms: number | null): string {
  if (ms === null) return 'text-content-muted'
  if (ms < 100) return 'text-accent'
  if (ms < 250) return 'text-warning'
  return 'text-danger'
}

function ServerCard({
  entry,
  instanceName,
  onRemove,
  onJoin
}: {
  entry: ServerEntry
  instanceName: string | null
  onRemove: () => void
  onJoin: () => void
}): React.JSX.Element {
  const [status, setStatus] = useState<ServerStatus | null>(null)
  const [pinging, setPinging] = useState(false)

  const ping = useCallback(async () => {
    setPinging(true)
    try {
      setStatus(await window.native.servers.ping(entry.address))
    } catch {
      setStatus({ online: false, latencyMs: null, motd: null, players: null, version: null, favicon: null, error: 'Ping failed' })
    } finally {
      setPinging(false)
    }
  }, [entry.address])

  useEffect(() => {
    void ping()
  }, [ping])

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      className="group flex min-h-[238px] flex-col rounded-card border border-line-subtle bg-surface-raised p-4 transition-all duration-fast hover:border-line-strong hover:bg-surface-hover"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-[52px] w-[52px] shrink-0 items-center justify-center overflow-hidden rounded-md2 bg-surface-inset ring-1 ring-line-subtle">
          {status?.favicon ? (
            <img src={status.favicon} alt="" className="h-full w-full object-cover" style={{ imageRendering: 'pixelated' }} />
          ) : (
            <Server size={22} className="text-content-muted" />
          )}
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="truncate text-h3 text-content-primary">{entry.name}</div>
          <div className="mt-0.5 truncate font-mono text-tiny text-content-muted">{entry.address}</div>
        </div>
        {pinging ? (
          <span className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-surface-inset px-2.5 text-tiny font-semibold text-content-muted">
            <Spinner size={10} /> Checking
          </span>
        ) : (
          <span
            className={cn(
              'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-surface-inset px-2.5 text-tiny font-semibold',
              status?.online ? latencyColor(status.latencyMs) : 'text-content-muted'
            )}
          >
            <span className={cn('h-1.5 w-1.5 rounded-full', status?.online ? 'bg-current' : 'bg-content-muted')} />
            {status?.online ? `${status.latencyMs ?? '—'} ms` : 'Offline'}
          </span>
        )}
      </div>

      <div className="mt-3 min-h-[38px] text-small text-content-secondary">
        {pinging ? (
          <span className="text-content-muted">Reaching the server…</span>
        ) : status?.online ? (
          <div className="flex items-start justify-between gap-3">
            <span className="line-clamp-2">{status.motd || status.version || 'Online and ready to join'}</span>
            {status.players && (
              <span className="inline-flex shrink-0 items-center gap-1 font-semibold text-content-primary">
                <Users size={13} /> {status.players.online}/{status.players.max}
              </span>
            )}
          </div>
        ) : (
          <span className="line-clamp-2 text-content-muted">{status?.error ?? 'This server did not respond.'}</span>
        )}
      </div>

      <div className="mt-3 grid grid-cols-3 divide-x divide-line-subtle rounded-md2 bg-surface-inset py-2.5">
        <div className="min-w-0 px-3">
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-content-muted">Last played</div>
          <div className="mt-0.5 truncate text-small font-semibold text-content-primary">
            {entry.lastPlayedAt ? timeAgo(entry.lastPlayedAt) : 'Never'}
          </div>
        </div>
        <div className="min-w-0 px-3">
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-content-muted">Playtime</div>
          <div className="mt-0.5 truncate text-small font-semibold text-content-primary">
            {entry.totalPlayMs > 0 ? formatPlaytime(entry.totalPlayMs) : '—'}
          </div>
        </div>
        <div className="min-w-0 px-3">
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-content-muted">Visits</div>
          <div className="mt-0.5 truncate text-small font-semibold text-content-primary">
            {entry.playCount > 0 ? entry.playCount : '—'}
          </div>
        </div>
      </div>

      <div className="mt-auto flex items-center gap-2 border-t border-line-subtle pt-3">
        <div className="min-w-0 flex-1 truncate text-tiny text-content-muted">
          {entry.detected ? (
            <span className="inline-flex items-center gap-1.5">
              <Sparkles size={11} /> Found while playing
            </span>
          ) : (
            <span>Saved server</span>
          )}
          {instanceName && <span> · {instanceName}</span>}
        </div>
        <IconButton icon={RefreshCw} label="Refresh server" variant="ghost" size={32} iconSize={15} onClick={() => void ping()} />
        <IconButton icon={Trash2} label={`Remove ${entry.name}`} variant="ghost" size={32} iconSize={15} onClick={onRemove} />
        <Button size="sm" icon={Play} onClick={onJoin} disabled={!status?.online} data-testid={`join-${entry.id}`}>
          Join
        </Button>
      </div>
    </motion.article>
  )
}

function AddServerModal({
  open,
  onClose,
  onAdded
}: {
  open: boolean
  onClose: () => void
  onAdded: () => void
}): React.JSX.Element {
  const instances = useInstances((s) => s.instances)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [instanceId, setInstanceId] = useState<string>('')

  useEffect(() => {
    if (open) {
      setName('')
      setAddress('')
      setInstanceId(instances[0]?.id ?? '')
    }
  }, [open, instances])

  const add = (): void => {
    window.native.servers
      .add(name.trim() || address, address.trim(), instanceId || null)
      .then(() => {
        onAdded()
        onClose()
      })
      .catch(toastError)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={460}
      title="Add server"
      titleIcon={<Server size={20} className="text-accent" />}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={add} disabled={!address.trim()} data-testid="server-add-confirm">
            Add server
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <FieldLabel>Server name</FieldLabel>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Hypixel" autoFocus />
        </div>
        <div>
          <FieldLabel>Address</FieldLabel>
          <Input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="mc.hypixel.net"
            data-testid="server-address"
            onKeyDown={(e) => e.key === 'Enter' && address.trim() && add()}
          />
        </div>
        {instances.length > 0 && (
          <div>
            <FieldLabel>Launch with instance</FieldLabel>
            <Select
              value={instanceId}
              onChange={setInstanceId}
              minWidth={280}
              options={instances.map((i) => ({ value: i.id, label: `${i.name} (${i.mcVersion})` }))}
            />
          </div>
        )}
      </div>
    </Modal>
  )
}

export function ServersScreen(): React.JSX.Element {
  const { servers, loaded, refresh } = useServers()
  const instances = useInstances((s) => s.instances)
  const [addOpen, setAddOpen] = useState(false)
  const push = useToasts((s) => s.push)

  useEffect(() => {
    if (!loaded) void refresh()
  }, [loaded, refresh])

  const ordered = [...servers].sort(
    (a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0) || a.sortIndex - b.sortIndex
  )

  const join = (entry: ServerEntry): void => {
    push({ kind: 'info', title: `Joining ${entry.name}…` })
    window.native.servers.quickJoin(entry.id).catch((err) => toastError(err, `Couldn't join ${entry.name}`))
  }

  return (
    <div className="flex h-full flex-col p-6" data-testid="screen-servers">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-display text-content-primary">Servers</h1>
          <p className="mt-1 text-small text-content-secondary">Your multiplayer history, captured automatically while you play.</p>
        </div>
        <Button icon={Plus} onClick={() => setAddOpen(true)} data-testid="servers-add">
          Add server
        </Button>
      </div>

      <div className="mt-5 min-h-0 flex-1 overflow-y-auto">
        {!loaded ? (
          <div className="flex justify-center py-10">
            <Spinner size={24} />
          </div>
        ) : ordered.length === 0 ? (
          <EmptyState
            icon={Server}
            title="No servers added"
            detail="Join any multiplayer server in Minecraft and Native will remember it automatically, or add one yourself."
            action={<Button icon={Plus} onClick={() => setAddOpen(true)}>Add server</Button>}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 min-[920px]:grid-cols-2">
            <AnimatePresence initial={false}>
              {ordered.map((entry) => (
                <ServerCard
                  key={entry.id}
                  entry={entry}
                  instanceName={instances.find((instance) => instance.id === entry.instanceId)?.name ?? null}
                  onJoin={() => join(entry)}
                  onRemove={() => {
                    window.native.servers.remove(entry.id).catch(toastError)
                  }}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      <AddServerModal open={addOpen} onClose={() => setAddOpen(false)} onAdded={() => void refresh()} />
    </div>
  )
}
