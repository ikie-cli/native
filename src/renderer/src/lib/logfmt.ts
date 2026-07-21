import type { LogLevel } from '@shared/types'

/**
 * A raw game log line parsed into display parts. Minecraft/log4j lines look like
 *   [12:34:56] [Render thread/INFO]: Loaded 7 mods
 *   [12:34:56] [Server thread/WARN] [minecraft/DedicatedServer]: Can't keep up!
 * but plenty of stdout (mod banners, stack traces, plain prints) does not match.
 * When a line doesn't match we still render it — as a `raw` part — so nothing is
 * ever dropped or hidden.
 */
export interface LogParts {
  /** `HH:MM:SS` timestamp captured from the line, if present. */
  time: string | null
  /** Thread/source label, e.g. `Render thread` or `main`. */
  thread: string | null
  /** The message body after the prefix (whole line for unmatched input). */
  message: string
  /** True for JVM stack-trace continuation lines (`\tat …`, `Caused by:`, `… N more`). */
  isStackTrace: boolean
}

// [12:34:56] [<thread>/<LEVEL>]: <message>
// The level segment is the last `/word` inside the first bracket group; some
// loaders append a second `[minecraft/DedicatedServer]` tag which we fold into
// the message rather than trying to model every variant.
const LINE_RE = /^\[(\d{2}:\d{2}:\d{2})\]\s*\[([^\]]*?)\/([A-Z]+)\]:?\s?(.*)$/

// Continuation lines of a Java exception. Leading whitespace varies (tab or
// spaces) depending on how the stream was chunked, so match either.
const STACK_RE = /^(\s+at\s|\s*Caused by:|\s*\.\.\.\s+\d+\s+more|\s*Suppressed:)/

/** Parse a single raw log line into display parts. Never throws. */
export function parseLogLine(text: string): LogParts {
  if (STACK_RE.test(text)) {
    return { time: null, thread: null, message: text.trimEnd(), isStackTrace: true }
  }
  const m = LINE_RE.exec(text)
  if (!m) {
    return { time: null, thread: null, message: text, isStackTrace: false }
  }
  const [, time, thread, , message] = m
  return { time, thread: thread.trim(), message, isStackTrace: false }
}

/**
 * Short, human label for a level — used for the inline badge. Kept separate from
 * color (a Tailwind concern owned by the component) so this stays pure/testable.
 */
export function levelLabel(level: LogLevel): string {
  return level === 'warn' ? 'WARN' : level.toUpperCase()
}
