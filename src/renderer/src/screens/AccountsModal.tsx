import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Copy, ExternalLink, LogIn, Plus, Trash2, UserPlus, X } from 'lucide-react'
import { useModals } from '@/stores/nav'
import { useAccounts, useToasts, toastError } from '@/stores/data'
import { Modal } from '@/components/ui/modal'
import { Button, Input, Spinner } from '@/components/ui/ui'
import { PlayerHead } from '@/components/layout/RightSidebar'
import { cn } from '@/lib/util'

type Pane = 'list' | 'device' | 'offline'

const STEP_LABEL: Record<string, string> = {
  xbox: 'Signing in to Xbox Live…',
  minecraft: 'Getting your Minecraft profile…',
  profile: 'Verifying game ownership…'
}

function DevicePane({ onDone }: { onDone: () => void }): React.JSX.Element {
  const flow = useAccounts((s) => s.flow)
  const setFlow = useAccounts((s) => s.setFlow)
  const push = useToasts((s) => s.push)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setFlow({ step: 'polling' })
    window.native.auth.beginMsa().catch(toastError)
    return () => void window.native.auth.cancelMsa()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (flow.step === 'done') {
      push({ kind: 'success', title: `Signed in as ${flow.account.username}` })
      onDone()
    }
  }, [flow, onDone, push])

  if (flow.step === 'device-code') {
    const { code } = flow
    return (
      <div className="flex flex-col items-center gap-5 py-4 text-center">
        <div className="text-body text-content-secondary">
          Go to the Microsoft sign-in page and enter this code:
        </div>
        <div className="flex items-center gap-3">
          <code
            className="rounded-md2 bg-surface-base px-5 py-3 font-mono text-[28px] font-bold tracking-[0.2em] text-accent"
            data-testid="device-code"
          >
            {code.userCode}
          </code>
          <button
            onClick={() => {
              void navigator.clipboard.writeText(code.userCode)
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            }}
            className="flex h-11 w-11 items-center justify-center rounded-md2 bg-surface-input text-content-primary transition-colors hover:bg-surface-active"
            aria-label="Copy code"
          >
            {copied ? <Check size={20} className="text-accent" /> : <Copy size={20} />}
          </button>
        </div>
        <Button icon={ExternalLink} onClick={() => void window.native.app.openExternal(code.verificationUri)}>
          Open Microsoft sign-in
        </Button>
        <div className="flex items-center gap-2 text-small text-content-muted">
          <Spinner size={14} /> Waiting for you to complete sign-in…
        </div>
      </div>
    )
  }

  if (flow.step === 'error') {
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-danger-tint text-danger">
          <X size={26} />
        </div>
        <div className="max-w-sm text-body text-content-secondary">{flow.error}</div>
        <Button onClick={onDone} variant="secondary">
          Back
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <Spinner size={28} />
      <div className="text-body text-content-secondary">
        {STEP_LABEL[flow.step] ?? 'Contacting Microsoft…'}
      </div>
    </div>
  )
}

function OfflinePane({ onDone }: { onDone: () => void }): React.JSX.Element {
  const [name, setName] = useState('')
  const refresh = useAccounts((s) => s.refresh)
  const push = useToasts((s) => s.push)
  const [busy, setBusy] = useState(false)
  const valid = /^[A-Za-z0-9_]{3,16}$/.test(name)

  const add = async (): Promise<void> => {
    setBusy(true)
    try {
      await window.native.auth.addOffline(name)
      await refresh()
      push({ kind: 'success', title: `Added offline profile ${name}` })
      onDone()
    } catch (err) {
      toastError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 py-2">
      <p className="text-small text-content-secondary">
        Offline profiles let you play singleplayer and LAN worlds without signing in. Most online
        servers require a Microsoft account. You must own Minecraft to play.
      </p>
      <div>
        <div className="mb-2 text-body font-bold text-content-primary">Username</div>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Steve"
          maxLength={16}
          autoFocus
          onKeyDown={(e) => e.key === 'Enter' && valid && add()}
          data-testid="offline-name"
        />
        {name && !valid && (
          <p className="mt-1.5 text-tiny text-danger">3–16 characters: letters, numbers, underscores.</p>
        )}
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>
          Back
        </Button>
        <Button onClick={add} disabled={!valid || busy} data-testid="offline-confirm">
          {busy ? <Spinner size={16} /> : 'Add profile'}
        </Button>
      </div>
    </div>
  )
}

function AccountList({ setPane }: { setPane: (p: Pane) => void }): React.JSX.Element {
  const accounts = useAccounts((s) => s.accounts)
  const refresh = useAccounts((s) => s.refresh)
  const push = useToasts((s) => s.push)

  return (
    <div className="flex min-h-[320px] flex-col gap-4">
      <div className="flex flex-1 flex-col gap-2">
        <AnimatePresence initial={false}>
          {accounts.map((a) => (
            <motion.div
              key={a.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ type: 'spring', stiffness: 500, damping: 40, mass: 0.8 }}
              className={cn(
                'group flex items-center gap-3 rounded-md2 border-[1.5px] p-3 transition-colors duration-fast',
                a.active ? 'border-accent bg-accent-tint' : 'border-transparent bg-surface-raised hover:bg-surface-hover'
              )}
            >
              <PlayerHead name={a.username} size={40} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-body font-bold text-content-primary">{a.username}</div>
                <div className="text-small text-content-secondary">
                  {a.type === 'msa' ? 'Microsoft account' : 'Offline profile'}
                </div>
              </div>
              {a.active ? (
                <span className="flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-small font-semibold text-accent-contrast">
                  <Check size={14} strokeWidth={3} /> Active
                </span>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    window.native.auth
                      .setActive(a.id)
                      .then(refresh)
                      .then(() => push({ kind: 'info', title: `Switched to ${a.username}` }))
                      .catch(toastError)
                  }}
                >
                  Use
                </Button>
              )}
              <button
                aria-label={`Remove ${a.username}`}
                onClick={() => {
                  if (!window.confirm(`Remove ${a.username}?`)) return
                  window.native.auth.remove(a.id).then(refresh).catch(toastError)
                }}
                className="flex h-8 w-8 items-center justify-center rounded-full text-content-muted opacity-0 transition-all duration-fast hover:bg-danger hover:text-white group-hover:opacity-100"
              >
                <Trash2 size={16} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
        {accounts.length === 0 && (
          <div className="rounded-md2 bg-surface-base py-8 text-center text-body text-content-secondary">
            No accounts yet. Sign in to start playing.
          </div>
        )}
      </div>

      {/* Option rows in the choose-type pattern of the reference modals. */}
      <div className="flex flex-col gap-2.5">
        <button
          onClick={() => setPane('device')}
          data-testid="add-msa"
          className="flex items-center gap-4 rounded-md2 bg-surface-input p-4 text-left transition-colors duration-fast hover:bg-surface-active"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-active text-accent">
            <LogIn size={22} />
          </span>
          <span>
            <span className="block text-body font-bold text-content-primary">Sign in with Microsoft</span>
            <span className="mt-0.5 block text-small text-content-secondary">
              Play everywhere — servers, Realms, and your skins.
            </span>
          </span>
        </button>
        <button
          onClick={() => setPane('offline')}
          data-testid="add-offline"
          className="flex items-center gap-4 rounded-md2 bg-surface-input p-4 text-left transition-colors duration-fast hover:bg-surface-active"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-active text-content-secondary">
            <UserPlus size={22} />
          </span>
          <span>
            <span className="block text-body font-bold text-content-primary">Offline profile</span>
            <span className="mt-0.5 block text-small text-content-secondary">
              Singleplayer and LAN worlds without an account.
            </span>
          </span>
        </button>
      </div>
    </div>
  )
}

export function AccountsModal(): React.JSX.Element {
  const open = useModals((s) => s.accountsOpen)
  const setOpen = useModals((s) => s.setAccountsOpen)
  const [pane, setPane] = useState<Pane>('list')

  useEffect(() => {
    if (open) setPane('list')
  }, [open])

  const titles: Record<Pane, string> = {
    list: 'Accounts',
    device: 'Sign in with Microsoft',
    offline: 'Add offline profile'
  }
  const accounts = useAccounts((s) => s.accounts)

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      width={560}
      title={titles[pane]}
      titleIcon={pane === 'list' ? <Plus size={20} className="text-accent" /> : undefined}
      footer={
        pane === 'list' ? (
          <>
            <span className="text-small text-content-secondary">
              {accounts.length} {accounts.length === 1 ? 'account' : 'accounts'}
            </span>
            <span className="text-small text-content-muted">
              Playing online requires a Microsoft account
            </span>
          </>
        ) : undefined
      }
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={pane}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -12 }}
          transition={{ duration: 0.16 }}
        >
          {pane === 'list' && <AccountList setPane={setPane} />}
          {pane === 'device' && <DevicePane onDone={() => setPane('list')} />}
          {pane === 'offline' && <OfflinePane onDone={() => setPane('list')} />}
        </motion.div>
      </AnimatePresence>
    </Modal>
  )
}
