import { useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowDownToLine, ClipboardCopy } from 'lucide-react'
import type { InstanceConfig, LogLevel } from '@shared/types'
import { useRunning, useToasts } from '@/stores/data'
import { Button, IconButton } from '@/components/ui/ui'
import { FilterChips } from '@/components/ui/tabs'
import { cn } from '@/lib/util'

// Console text is log-green per design-system.md §1 (ref-113614 motif);
// warnings/errors keep their status colors.
const LEVEL_COLOR: Record<LogLevel, string> = {
  error: 'text-danger',
  warn: 'text-warning',
  info: 'text-log',
  debug: 'text-content-muted'
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

export function LogsTab({ inst }: { inst: InstanceConfig }): React.JSX.Element {
  const logs = useRunning((s) => s.logs[inst.id])
  const isRunning = useRunning((s) => s.isRunning(inst.id))
  const loadLogs = useRunning((s) => s.loadLogs)
  const push = useToasts((s) => s.push)
  const [filter, setFilter] = useState<Filter>('all')
  const [follow, setFollow] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!logs) void loadLogs(inst.id)
  }, [inst.id, logs, loadLogs])

  const lines = useMemo(() => {
    const all = logs ?? []
    if (filter === 'all') return all
    if (filter === 'error') return all.filter((l) => l.level === 'error')
    if (filter === 'warn') return all.filter((l) => l.level === 'warn' || l.level === 'error')
    return all.filter((l) => l.level === 'info' || l.level === 'warn' || l.level === 'error')
  }, [logs, filter])

  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 18,
    overscan: 20
  })

  // Follow tail while enabled.
  useEffect(() => {
    if (follow && lines.length > 0) virtualizer.scrollToIndex(lines.length - 1, { align: 'end' })
  }, [lines.length, follow, virtualizer])

  const onScroll = (): void => {
    const el = scrollRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    setFollow(atBottom)
  }

  const copyAll = (): void => {
    void navigator.clipboard.writeText((logs ?? []).map((l) => l.text).join('\n'))
    push({ kind: 'success', title: 'Logs copied' })
  }

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
          <span className="flex items-center gap-1.5 text-small text-content-muted">
            <span className={cn('h-2 w-2 rounded-full', isRunning ? 'bg-accent' : 'bg-content-muted')} />
            {isRunning ? 'Running' : 'Stopped'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {!follow && (
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
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${vi.start}px)`
                  }}
                  className={cn('whitespace-pre-wrap break-all', LEVEL_COLOR[line.level])}
                >
                  {line.text}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
