import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowDownToLine, ClipboardCopy, Download, MoreVertical, Trash2 } from 'lucide-react'
import type { InstanceConfig, LogLevel, LogLine, LogSession } from '@shared/types'
import { useRunning, useToasts } from '@/stores/data'
import { Button, IconButton } from '@/components/ui/ui'
import { FilterChips } from '@/components/ui/tabs'
import { DropMenu, Select } from '@/components/ui/menu'
import { cn, formatBytes, timeAgo } from '@/lib/util'
import { parseLogLine, levelLabel } from '@/lib/logfmt'

// Console text is log-green per design-system.md §1 (ref-113614 motif);
// warnings/errors keep their status colors.
const LEVEL_COLOR: Record<LogLevel, string> = {
  error: 'text-danger',
  warn: 'text-warning',
  info: 'text-log',
  debug: 'text-content-muted'
}

// Small inline badge shown before the message. Border-only keeps it legible on
// the inset console background without competing with the message color.
const BADGE_COLOR: Record<LogLevel, string> = {
  error: 'border-danger/40 text-danger',
  warn: 'border-warning/40 text-warning',
  info: 'border-info/40 text-info',
  debug: 'border-content-muted/40 text-content-muted'
}

/** One formatted console row: dimmed [time]/[thread], level badge, message. */
function LogRow({ line }: { line: LogLine }): React.JSX.Element {
  const p = parseLogLine(line.text)

  // Stack-trace continuation: indent under its exception, no badge/prefix noise.
  if (p.isStackTrace) {
    return (
      <div className="whitespace-pre-wrap break-all pl-[4.5rem] text-danger/80">{p.message}</div>
    )
  }

  return (
    <div className="flex items-baseline gap-2 whitespace-pre-wrap break-all">
      {p.time && <span className="shrink-0 text-content-muted/70 tabular-nums">{p.time}</span>}
      <span
        className={cn(
          'shrink-0 rounded border px-1 text-[10px] font-semibold leading-[1.4] tracking-wide',
          BADGE_COLOR[line.level]
        )}
      >
        {levelLabel(line.level)}
      </span>
      {p.thread && (
        <span className="shrink-0 max-w-[10rem] truncate text-content-muted/60" title={p.thread}>
          {p.thread}
        </span>
      )}
      <span className={cn('min-w-0', LEVEL_COLOR[line.level])}>{p.message}</span>
    </div>
  )
}

const CREEPER_ART = String.raw`
     _____________________________________
    /  Launch this instance to start      \
    |  receiving live logs!               |
    \____________________________________/

        ▄▄▄▄▄▄▄▄▄▄▄▄
        █          █
        █  ██  ██  █
        █          █
        █   ████   █
        █  ██████  █
        █  ██  ██  █
        █          █
        ▀▀▀▀▀▀▀▀▀▀▀▀
`

type Filter = 'all' | 'info' | 'warn' | 'error'

const LIVE = 'live'

/** Compact dropdown label for a past session: crash flag + relative time. */
function sessionLabel(s: LogSession): string {
  return `${s.crashed ? '⚠ ' : ''}${timeAgo(s.startedAt)}`
}

export function LogsTab({ inst }: { inst: InstanceConfig }): React.JSX.Element {
  const logs = useRunning((s) => s.logs[inst.id])
  const isRunning = useRunning((s) => s.isRunning(inst.id))
  const loadLogs = useRunning((s) => s.loadLogs)
  const push = useToasts((s) => s.push)
  const [filter, setFilter] = useState<Filter>('all')
  const [follow, setFollow] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Session history: `LIVE` shows the running store; a filename shows a past run
  // loaded read-only from disk.
  const [sessions, setSessions] = useState<LogSession[]>([])
  const [selected, setSelected] = useState<string>(LIVE)
  const [pastLines, setPastLines] = useState<LogLine[]>([])
  const viewingLive = selected === LIVE

  const refreshSessions = useCallback(async (): Promise<LogSession[]> => {
    const list = await window.native.running.sessions(inst.id)
    setSessions(list)
    return list
  }, [inst.id])

  useEffect(() => {
    if (!logs) void loadLogs(inst.id)
  }, [inst.id, logs, loadLogs])

  // Reset to Live and reload the history list whenever the instance changes or a
  // run stops (a stopped run has just been finalized to disk).
  useEffect(() => {
    setSelected(LIVE)
    setPastLines([])
    void refreshSessions()
  }, [inst.id, isRunning, refreshSessions])

  // Load a past session's lines from disk when one is selected.
  useEffect(() => {
    if (viewingLive) return
    let cancelled = false
    void window.native.running.readSession(inst.id, selected).then((lines) => {
      if (!cancelled) setPastLines(lines)
    })
    return () => {
      cancelled = true
    }
  }, [inst.id, selected, viewingLive])

  const source = viewingLive ? (logs ?? []) : pastLines

  const lines = useMemo(() => {
    const all = source
    if (filter === 'all') return all
    if (filter === 'error') return all.filter((l) => l.level === 'error')
    if (filter === 'warn') return all.filter((l) => l.level === 'warn' || l.level === 'error')
    return all.filter((l) => l.level === 'info' || l.level === 'warn' || l.level === 'error')
  }, [source, filter])

  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 20,
    overscan: 20,
    // Lines wrap, so heights vary — measure each rendered row.
    measureElement: (el) => el.getBoundingClientRect().height
  })

  // Follow tail only for the live session.
  useEffect(() => {
    if (viewingLive && follow && lines.length > 0)
      virtualizer.scrollToIndex(lines.length - 1, { align: 'end' })
  }, [lines.length, follow, viewingLive, virtualizer])

  const onScroll = (): void => {
    const el = scrollRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    setFollow(atBottom)
  }

  const copyAll = (): void => {
    void navigator.clipboard.writeText(source.map((l) => l.text).join('\n'))
    push({ kind: 'success', title: 'Logs copied' })
  }

  const exportLog = (): void => {
    const text = source.map((l) => l.text).join('\n')
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const stamp = viewingLive ? 'live' : selected.replace(/\.log$/, '')
    a.href = url
    a.download = `${inst.name.replace(/[^\w.-]+/g, '_')}-${stamp}.log`
    a.click()
    URL.revokeObjectURL(url)
  }

  const deleteSession = async (file: string): Promise<void> => {
    await window.native.running.deleteSession(inst.id, file)
    await refreshSessions()
    if (selected === file) {
      setSelected(LIVE)
      setPastLines([])
    }
    push({ kind: 'success', title: 'Session deleted' })
  }

  const sessionOptions = useMemo(
    () => [
      { value: LIVE, label: isRunning ? 'Live' : 'Latest (live)' },
      ...sessions.map((s) => ({ value: s.file, label: sessionLabel(s) }))
    ],
    [sessions, isRunning]
  )

  const activeSession = viewingLive ? null : sessions.find((s) => s.file === selected)

  return (
    <div className="flex h-full flex-col px-6 pb-6">
      <div className="flex items-center justify-between gap-3 py-1">
        <div className="flex items-center gap-3">
          <FilterChips
            items={[
              { id: 'all', label: 'All' },
              { id: 'info', label: 'Info' },
              { id: 'warn', label: 'Warnings' },
              { id: 'error', label: 'Errors' }
            ]}
            value={filter}
            onChange={setFilter}
          />
          {sessions.length > 0 && (
            <Select
              label="Session"
              value={selected}
              options={sessionOptions}
              onChange={setSelected}
              minWidth={200}
            />
          )}
          <span className="flex items-center gap-1.5 text-small text-content-muted">
            {viewingLive ? (
              <>
                <span
                  className={cn('h-2 w-2 rounded-full', isRunning ? 'bg-accent' : 'bg-content-muted')}
                />
                {isRunning ? 'Running' : 'Stopped'}
              </>
            ) : activeSession ? (
              <>
                <span className={cn('h-2 w-2 rounded-full', activeSession.crashed ? 'bg-danger' : 'bg-content-muted')} />
                {formatBytes(activeSession.size)}
                {activeSession.crashed && ' · crashed'}
              </>
            ) : null}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {viewingLive && !follow && (
            <IconButton
              icon={ArrowDownToLine}
              label="Scroll to bottom"
              onClick={() => {
                setFollow(true)
                virtualizer.scrollToIndex(lines.length - 1, { align: 'end' })
              }}
            />
          )}
          <Button size="sm" variant="secondary" icon={ClipboardCopy} onClick={copyAll}>
            Copy
          </Button>
          <DropMenu
            items={[
              { label: 'Export .log', icon: Download, onClick: exportLog },
              ...(activeSession
                ? [
                    {
                      label: 'Delete session',
                      icon: Trash2,
                      danger: true,
                      onClick: () => void deleteSession(activeSession.file)
                    }
                  ]
                : [])
            ]}
            trigger={({ ref, onClick }) => (
              <IconButton ref={ref} icon={MoreVertical} label="More" onClick={onClick} />
            )}
          />
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="mt-2 min-h-0 flex-1 overflow-y-auto rounded-card bg-surface-inset p-4 font-mono text-[12.5px] leading-[18px]"
        data-testid="log-viewer"
      >
        {lines.length === 0 ? (
          <pre className="select-none whitespace-pre pl-4 pt-2 text-log">
            {isRunning ? 'Waiting for output…' : CREEPER_ART}
          </pre>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((vi) => {
              const line = lines[vi.index]
              return (
                <div
                  key={vi.key}
                  data-index={vi.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${vi.start}px)`
                  }}
                >
                  <LogRow line={line} />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
