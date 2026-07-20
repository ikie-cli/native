import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Play, Plus, RefreshCw, Server, Signal, Trash2, Users } from 'lucide-react'
import type { ServerEntry, ServerStatus } from '@shared/types'
import { useInstances, useToasts, toastError } from '@/stores/data'
import { Button, EmptyState, IconButton, Input, Spinner } from '@/components/ui/ui'
import { Modal, FieldLabel } from '@/components/ui/modal'
import { Select } from '@/components/ui/menu'
import { cn } from '@/lib/util'

function latencyColor(ms: number | null): string {
  if (ms === null) return 'text-content-muted'
  if (ms < 100) return 'text-accent'
  if (ms < 250) return 'text-warning'
  return 'text-danger'
}

function ServerCard({
  entry,
  onRemove,
  onJoin
}: {
  entry: ServerEntry
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
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      className="group flex items-center gap-4 rounded-card bg-surface-raised p-4 transition-colors duration-fast hover:bg-surface-hover"
    >
      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md2 bg-surface-inset">
        {status?.favicon ? (
          <img src={status.favicon} alt="" className="mono-media h-full w-full object-cover" style={{ imageRendering: 'pixelated' }} />
        ) : (
          <Server size={24} className="text-content-muted" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-body font-bold text-content-primary">{entry.name}</span>
          <span
            className={cn('h-2 w-2 shrink-0 rounded-full', status?.online ? 'bg-accent' : 'bg-content-muted')}
            title={status?.online ? 'Online' : 'Offline'}
          />
        </div>
        <div className="truncate text-small text-content-muted">{entry.address}</div>
        {pinging ? (
          <div className="mt-1 flex items-center gap-1.5 text-tiny text-content-muted">
            <Spinner size={11} /> Pinging…
          </div>
        ) : status?.online ? (
          <div className="mt-1 flex items-center gap-3 text-tiny text-content-secondary">
            {status.motd && <span className="truncate max-w-[280px]">{status.motd}</span>}
            {status.players && (
              <span className="inline-flex shrink-0 items-center gap-1">
                <Users size={12} /> {status.players.online}/{status.players.max}
              </span>
            )}
            <span className={cn('inline-flex shrink-0 items-center gap-1', latencyColor(status.latencyMs))}>
              <Signal size={12} /> {status.latencyMs}ms
            </span>
          </div>
        ) : (
          <div className="mt-1 text-tiny text-content-muted">{status?.error ?? 'Offline'}</div>
        )}
      </div>
      <IconButton icon={RefreshCw} label="Refresh" variant="ghost" onClick={() => void ping()} />
      <Button size="sm" icon={Play} onClick={onJoin} disabled={!status?.online} data-testid={`join-${entry.id}`}>
        Join
      </Button>
      <IconButton
        icon={Trash2}
        label={`Remove ${entry.name}`}
        variant="ghost"
        className="opacity-0 group-hover:opacity-100"
        onClick={onRemove}
      />
    </motion.div>
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
  const [servers, setServers] = useState<ServerEntry[] | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const push = useToasts((s) => s.push)

  const load = useCallback(async () => {
    setServers(await window.native.servers.list())
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const join = (entry: ServerEntry): void => {
    push({ kind: 'info', title: `Joining ${entry.name}…` })
    window.native.servers.quickJoin(entry.id).catch((err) => toastError(err, `Couldn't join ${entry.name}`))
  }

  return (
    <div className="flex h-full flex-col p-6" data-testid="screen-servers">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-display text-content-primary">Servers</h1>
        <Button icon={Plus} onClick={() => setAddOpen(true)} data-testid="servers-add">
          Add server
        </Button>
      </div>

      <div className="mt-5 min-h-0 flex-1 overflow-y-auto">
        {servers === null ? (
          <div className="flex justify-center py-10">
            <Spinner size={24} />
          </div>
        ) : servers.length === 0 ? (
          <EmptyState
            icon={Server}
            title="No servers added"
            detail="Add a Minecraft server to see its status, player count, and latency — then jump straight in."
            action={<Button icon={Plus} onClick={() => setAddOpen(true)}>Add server</Button>}
          />
        ) : (
          <div className="flex flex-col gap-3">
            <AnimatePresence initial={false}>
              {servers.map((entry) => (
                <ServerCard
                  key={entry.id}
                  entry={entry}
                  onJoin={() => join(entry)}
                  onRemove={() => {
                    window.native.servers.remove(entry.id).then(load).catch(toastError)
                  }}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      <AddServerModal open={addOpen} onClose={() => setAddOpen(false)} onAdded={load} />
    </div>
  )
}
