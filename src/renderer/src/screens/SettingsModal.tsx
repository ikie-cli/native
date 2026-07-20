import { useEffect, useState } from 'react'
import { Cpu, Download, FolderCog, Info, RefreshCw, Rocket, Settings2 } from 'lucide-react'
import type { AppSettings, JavaInstall } from '@shared/types'
import { useSettings, useUpdater, useToasts, toastError } from '@/stores/data'
import { useModals } from '@/stores/nav'
import { Modal, FieldLabel } from '@/components/ui/modal'
import { Button, Input, Spinner, Toggle } from '@/components/ui/ui'
import { Slider } from '@/components/ui/slider'
import { Select } from '@/components/ui/menu'
import { cn } from '@/lib/util'

type Pane = 'general' | 'java' | 'content' | 'updates' | 'about'

const NAV: { id: Pane; label: string; icon: typeof Cpu }[] = [
  { id: 'general', label: 'General', icon: Settings2 },
  { id: 'java', label: 'Java & Memory', icon: Cpu },
  { id: 'content', label: 'Content', icon: FolderCog },
  { id: 'updates', label: 'Updates', icon: Rocket },
  { id: 'about', label: 'About', icon: Info }
]

function Row({
  title,
  detail,
  children
}: {
  title: string
  detail?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-6 py-3">
      <div className="min-w-0">
        <div className="text-body font-semibold text-content-primary">{title}</div>
        {detail && <div className="mt-0.5 text-small text-content-secondary">{detail}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

/** Miniature app mock used inside the theme preview cards (ref-113645). */
function ThemePreview({ bg, card, line }: { bg: string; card: string; line: string }): React.JSX.Element {
  return (
    <div className="pointer-events-none h-[88px] w-full rounded-t-md2 p-3" style={{ background: bg }}>
      <div className="flex gap-2">
        <div className="h-9 w-9 rounded-sm2" style={{ background: card }} />
        <div className="flex-1 space-y-2 pt-1">
          <div className="h-2.5 w-3/4 rounded-full" style={{ background: line }} />
          <div className="h-2.5 w-1/2 rounded-full" style={{ background: card }} />
        </div>
      </div>
      <div className="mt-3 h-2.5 w-2/3 rounded-full" style={{ background: card }} />
    </div>
  )
}

const THEME_CARDS: {
  id: AppSettings['theme']
  label: string
  bg: string
  card: string
  line: string
}[] = [
  { id: 'dark', label: 'Dark', bg: '#26282d', card: '#3a3d44', line: '#5b6069' },
  { id: 'light', label: 'Light', bg: '#f4f6f8', card: '#dfe3e8', line: '#b3bac2' },
  { id: 'oled', label: 'OLED', bg: '#000000', card: '#1d2025', line: '#3a3d44' },
  { id: 'system', label: 'Sync with system', bg: '#26282d', card: '#3a3d44', line: '#5b6069' }
]

function GeneralPane(): React.JSX.Element {
  const { settings, set } = useSettings()
  return (
    <div className="divide-y divide-line-subtle">
      <div className="pb-4">
        <div className="text-body font-semibold text-content-primary">Theme</div>
        <div className="mb-3 mt-0.5 text-small text-content-secondary">
          Select your preferred color theme for Native.
        </div>
        <div className="grid grid-cols-3 gap-3">
          {THEME_CARDS.map((t) => {
            const active = settings.theme === t.id
            return (
              <button
                key={t.id}
                onClick={() => void set({ theme: t.id })}
                className={cn(
                  'overflow-hidden rounded-md2 border-2 text-left transition-colors duration-fast',
                  active ? 'border-accent' : 'border-transparent hover:border-line-strong'
                )}
              >
                <ThemePreview bg={t.bg} card={t.card} line={t.line} />
                <div className="flex items-center gap-2 bg-surface-raised px-3 py-2.5">
                  <span
                    className={cn(
                      'flex h-4 w-4 items-center justify-center rounded-full border-2',
                      active ? 'border-accent' : 'border-content-muted'
                    )}
                  >
                    {active && <span className="h-2 w-2 rounded-full bg-accent" />}
                  </span>
                  <span className="text-small font-semibold text-content-primary">{t.label}</span>
                </div>
              </button>
            )
          })}
        </div>
      </div>
      <Row title="When a game launches" detail="What the launcher window does after a game starts.">
        <Select
          value={settings.launchBehavior}
          onChange={(v) => void set({ launchBehavior: v as AppSettings['launchBehavior'] })}
          minWidth={160}
          options={[
            { value: 'keep-open', label: 'Keep open' },
            { value: 'minimize', label: 'Minimize' },
            { value: 'close', label: 'Hide to tray' }
          ]}
        />
      </Row>
      <Row title="Language" detail="More languages are on the way.">
        <Select
          value={settings.language}
          onChange={(v) => void set({ language: v })}
          minWidth={160}
          options={[{ value: 'en', label: 'English' }]}
        />
      </Row>
      <Row title="Default resolution" detail="Applied to new instances.">
        <div className="flex items-center gap-2">
          <Input
            type="number"
            value={settings.defaultWidth ?? 854}
            onChange={(e) => void set({ defaultWidth: Number(e.target.value) })}
            className="w-24"
          />
          <span className="text-content-muted">×</span>
          <Input
            type="number"
            value={settings.defaultHeight ?? 480}
            onChange={(e) => void set({ defaultHeight: Number(e.target.value) })}
            className="w-24"
          />
        </div>
      </Row>
    </div>
  )
}

function JavaPane(): React.JSX.Element {
  const { settings, set } = useSettings()
  const push = useToasts((s) => s.push)
  const [javas, setJavas] = useState<JavaInstall[] | null>(null)
  const [downloading, setDownloading] = useState<number | null>(null)

  const refresh = (): void => {
    setJavas(null)
    window.native.java.list().then(setJavas).catch(() => setJavas([]))
  }
  useEffect(refresh, [])

  const download = (major: number): void => {
    setDownloading(major)
    window.native.java
      .download(major)
      .then(() => {
        push({ kind: 'success', title: `Java ${major} installed` })
        refresh()
      })
      .catch(toastError)
      .finally(() => setDownloading(null))
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <FieldLabel>Default maximum RAM</FieldLabel>
        <Slider
          value={settings.defaultMemMax}
          min={1024}
          max={16384}
          step={512}
          onChange={(v) => void set({ defaultMemMax: v })}
          formatValue={(v) => `${(v / 1024).toFixed(1)} GB`}
        />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <FieldLabel className="mb-0">Detected Java runtimes</FieldLabel>
          <Button size="sm" variant="ghost" icon={RefreshCw} onClick={refresh}>
            Rescan
          </Button>
        </div>
        <div className="flex flex-col gap-2">
          {javas === null && (
            <div className="flex justify-center py-4">
              <Spinner />
            </div>
          )}
          {javas?.map((j) => (
            <div key={j.path} className="flex items-center gap-3 rounded-md2 bg-surface-inset px-3 py-2.5">
              <Cpu size={18} className="shrink-0 text-content-secondary" />
              <div className="min-w-0 flex-1">
                <div className="text-body font-semibold text-content-primary">
                  Java {j.major} <span className="text-small font-normal text-content-muted">({j.version})</span>
                </div>
                <div className="truncate text-tiny text-content-muted">{j.path}</div>
              </div>
              <span className="rounded-full bg-surface-input px-2 py-0.5 text-tiny capitalize text-content-secondary">
                {j.source}
              </span>
            </div>
          ))}
          {javas?.length === 0 && (
            <p className="py-2 text-small text-content-secondary">
              No Java found on your system. Native will download the right version automatically when you
              launch, or grab one now:
            </p>
          )}
        </div>
        <div className="mt-3 flex gap-2">
          {[8, 17, 21].map((major) => (
            <Button
              key={major}
              size="sm"
              variant="secondary"
              icon={downloading === major ? undefined : Download}
              disabled={downloading !== null}
              onClick={() => download(major)}
            >
              {downloading === major ? <Spinner size={16} /> : `Get Java ${major}`}
            </Button>
          ))}
        </div>
      </div>

      <div>
        <FieldLabel>Java path override</FieldLabel>
        <div className="flex gap-2">
          <Input
            value={settings.javaPathOverride ?? ''}
            onChange={(e) => void set({ javaPathOverride: e.target.value || null })}
            placeholder="Auto (recommended)"
            className="font-mono text-small"
          />
          <Button
            variant="secondary"
            onClick={async () => {
              const [p] = await window.native.app.pickFile({ title: 'Select java executable' })
              if (p) {
                const probed = await window.native.java.test(p)
                if (!probed) return toastError(new Error('Not a valid Java executable'))
                await set({ javaPathOverride: p })
                push({ kind: 'success', title: `Using Java ${probed.major}` })
              }
            }}
          >
            Browse
          </Button>
        </div>
        <p className="mt-1.5 text-tiny text-content-muted">
          Leave empty to let Native match the correct Java version per instance.
        </p>
      </div>
    </div>
  )
}

function ContentPane(): React.JSX.Element {
  const { settings, set } = useSettings()
  return (
    <div className="flex flex-col gap-4">
      <div className="divide-y divide-line-subtle">
        <Row title="Concurrent downloads" detail="Higher is faster on good connections; lower is gentler.">
          <div className="w-48">
            <Slider
              value={settings.concurrentDownloads}
              min={1}
              max={16}
              onChange={(v) => void set({ concurrentDownloads: v })}
              formatValue={(v) => `${v}`}
            />
          </div>
        </Row>
      </div>
      <div>
        <FieldLabel>CurseForge API key</FieldLabel>
        <Input
          type="password"
          value={settings.curseforgeApiKey ?? ''}
          onChange={(e) => void set({ curseforgeApiKey: e.target.value || null })}
          placeholder="Optional — enables CurseForge search"
          className="font-mono text-small"
        />
        <p className="mt-1.5 text-tiny text-content-muted">
          Modrinth works without a key. Add a CurseForge key to search their catalog too.
        </p>
      </div>
    </div>
  )
}

function UpdatesPane(): React.JSX.Element {
  const { settings, set } = useSettings()
  const updater = useUpdater((s) => s.state)
  const push = useToasts((s) => s.push)

  return (
    <div className="flex flex-col gap-4">
      <div className="divide-y divide-line-subtle">
        <Row title="Check for updates automatically" detail="On startup and every few hours.">
          <Toggle checked={settings.autoUpdateCheck} onChange={(v) => void set({ autoUpdateCheck: v })} />
        </Row>
        <Row title="Download updates in the background" detail="Install on next restart when ready.">
          <Toggle checked={settings.autoUpdateDownload} onChange={(v) => void set({ autoUpdateDownload: v })} />
        </Row>
      </div>
      <div className="rounded-md2 bg-surface-inset p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-body font-semibold text-content-primary">Update status</div>
            <div className="mt-0.5 text-small capitalize text-content-secondary" data-testid="update-status">
              {updater.status === 'unsupported'
                ? 'reason' in updater
                  ? updater.reason
                  : 'Not available for this build'
                : updater.status === 'available' || updater.status === 'ready'
                  ? `Version ${'version' in updater ? updater.version : ''} ${updater.status}`
                  : updater.status}
            </div>
          </div>
          <Button
            variant="secondary"
            icon={RefreshCw}
            disabled={updater.status === 'checking' || updater.status === 'unsupported'}
            onClick={() => {
              push({ kind: 'info', title: 'Checking for updates…' })
              void window.native.updater.check()
            }}
          >
            Check now
          </Button>
        </div>
      </div>
    </div>
  )
}

function AboutPane(): React.JSX.Element {
  const [info, setInfo] = useState<{ version: string; platform: string; arch: string; dataDir: string } | null>(null)
  useEffect(() => {
    window.native.app.info().then(setInfo)
  }, [])
  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <svg width="56" height="56" viewBox="0 0 24 24" fill="none">
        <rect x="2.5" y="2.5" width="19" height="19" rx="6" fill="#1bd96a" />
        <path d="M8 16V8.6c0-.5.6-.8 1-.4l6.4 6.9c.4.4 1 .1 1-.4V8" stroke="#03150a" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div>
        <div className="text-h2 font-extrabold text-content-primary">Native</div>
        <div className="text-small text-content-secondary">Version {info?.version ?? '—'}</div>
      </div>
      <div className="text-tiny text-content-muted">
        {info?.platform} · {info?.arch}
      </div>
      <button
        className="text-tiny text-content-muted underline-offset-2 hover:text-accent hover:underline"
        onClick={() => info && window.native.app.openPath(info.dataDir)}
      >
        Open data folder
      </button>
      <p className="mt-2 max-w-sm text-tiny text-content-muted">
        A fast, modern Minecraft launcher. Not affiliated with Mojang or Microsoft. You must own
        Minecraft to play online.
      </p>
    </div>
  )
}

export function SettingsModal(): React.JSX.Element {
  const open = useModals((s) => s.settingsOpen)
  const setOpen = useModals((s) => s.setSettingsOpen)
  const [pane, setPane] = useState<Pane>('general')

  return (
    <Modal open={open} onClose={() => setOpen(false)} width={960} title="Settings" bodyClassName="p-0 bg-surface-raised" titleIcon={<Settings2 size={20} className="text-accent" />}>
      <div className="flex min-h-[620px]">
        <nav className="w-52 shrink-0 border-r border-line-subtle p-3">
          {NAV.map((n) => {
            const Icon = n.icon
            return (
              <button
                key={n.id}
                onClick={() => setPane(n.id)}
                className={cn(
                  'mb-1 flex w-full items-center gap-3 rounded-md2 px-3 py-2.5 text-left text-body font-semibold transition-colors duration-fast',
                  pane === n.id
                    ? 'bg-accent-tint text-accent'
                    : 'text-content-secondary hover:bg-surface-hover hover:text-content-primary'
                )}
              >
                <Icon size={18} />
                {n.label}
              </button>
            )
          })}
        </nav>
        <div className="min-w-0 flex-1 overflow-y-auto p-6">
          {pane === 'general' && <GeneralPane />}
          {pane === 'java' && <JavaPane />}
          {pane === 'content' && <ContentPane />}
          {pane === 'updates' && <UpdatesPane />}
          {pane === 'about' && <AboutPane />}
        </div>
      </div>
    </Modal>
  )
}
