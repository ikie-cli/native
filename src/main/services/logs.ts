import { readdir, readFile, stat, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { LogLine, LogSession } from '@shared/types'
import { paths } from '../paths'
import { levelOf } from '../core/launch'

/**
 * Reads saved launch-session logs from an instance's `logs/` dir. The launcher
 * writes one plain-text file per run (`<startedAt>.log`, or `.crash.log` when the
 * session crashed); this service lists them and reads them back as LogLines,
 * re-deriving levels with the same heuristic used for live output.
 */
export class LogsService {
  private dir(instanceId: string): string {
    return paths.instanceLogsDir(instanceId)
  }

  /** List saved sessions, newest first. */
  async sessions(instanceId: string): Promise<LogSession[]> {
    let names: string[]
    try {
      names = await readdir(this.dir(instanceId))
    } catch {
      return []
    }
    const out: LogSession[] = []
    for (const file of names) {
      if (!file.endsWith('.log')) continue
      const crashed = file.endsWith('.crash.log')
      const startedAt = Number.parseInt(file, 10)
      if (!Number.isFinite(startedAt)) continue
      const st = await stat(join(this.dir(instanceId), file)).catch(() => null)
      if (!st) continue
      out.push({ file, startedAt, size: st.size, crashed })
    }
    return out.sort((a, b) => b.startedAt - a.startedAt)
  }

  /** Read one saved session back into LogLines. Returns [] if missing. */
  async read(instanceId: string, file: string): Promise<LogLine[]> {
    // Guard against path traversal: only accept bare session filenames.
    if (!this.isSessionFile(file)) return []
    let text: string
    try {
      text = await readFile(join(this.dir(instanceId), file), 'utf-8')
    } catch {
      return []
    }
    const lines: LogLine[] = []
    for (const raw of text.split(/\r?\n/)) {
      if (!raw || raw.startsWith('# ')) continue // skip the header comment
      lines.push({ t: 0, level: levelOf(raw) ?? 'info', text: raw })
    }
    return lines
  }

  async delete(instanceId: string, file: string): Promise<void> {
    if (!this.isSessionFile(file)) return
    await rm(join(this.dir(instanceId), file), { force: true })
  }

  private isSessionFile(file: string): boolean {
    return /^\d+(\.crash)?\.log$/.test(file)
  }
}
