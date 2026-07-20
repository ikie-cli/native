import { EventEmitter } from 'node:events'
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { rename, rm, stat } from 'node:fs/promises'
import { dirname } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { DownloadTaskProgress } from '@shared/types'
import { ensureDir, makeExecutable } from '../utils/fsx'

export interface DownloadItem {
  url: string
  dest: string
  /** expected size in bytes when known (used for skip + progress totals) */
  size?: number
  sha1?: string
  executable?: boolean
}

export interface TaskOptions {
  concurrency?: number
  label: string
  phase?: string
}

const UA = 'NativeLauncher/0.1.0 (native-launcher)'
const MAX_ATTEMPTS = 4

/**
 * One logical download job (e.g. "install instance X") made of many files.
 * - parallel workers over a shared queue
 * - resume of partial files via HTTP Range on `.part` files
 * - sha1 verification (incremental while streaming; re-hash of resumed prefix)
 * - byte-accurate progress with EMA speed + ETA
 */
export class DownloadTask extends EventEmitter {
  readonly id: string
  private items: DownloadItem[] = []
  private queue: DownloadItem[] = []
  private aborts = new Set<AbortController>()
  private cancelled = false
  private doneBytes = 0
  private inFlightBytes = new Map<DownloadItem, number>()
  private doneFiles = 0
  private totalBytesKnown = 0
  private speedEma = 0
  private lastSampleBytes = 0
  private lastSampleAt = 0
  private sampler: ReturnType<typeof setInterval> | null = null
  private _state: DownloadTaskProgress['state'] = 'running'
  private _error?: string
  label: string
  phase: string

  constructor(id: string, opts: TaskOptions) {
    super()
    this.id = id
    this.label = opts.label
    this.phase = opts.phase ?? ''
  }

  get state(): DownloadTaskProgress['state'] {
    return this._state
  }

  setPhase(phase: string): void {
    this.phase = phase
  }

  cancel(): void {
    this.cancelled = true
    for (const ac of this.aborts) ac.abort()
  }

  progress(): DownloadTaskProgress {
    const done = this.doneBytes + sum(this.inFlightBytes.values())
    const total = Math.max(this.totalBytesKnown, done)
    const remaining = Math.max(0, total - done)
    return {
      id: this.id,
      label: this.label,
      phase: this.phase,
      totalBytes: total,
      doneBytes: done,
      totalFiles: this.items.length,
      doneFiles: this.doneFiles,
      speedBps: Math.round(this.speedEma),
      etaSec: this.speedEma > 1 ? Math.round(remaining / this.speedEma) : 0,
      state: this._state,
      error: this._error
    }
  }

  /** Run a batch of items; can be called multiple times sequentially per phase. */
  async run(items: DownloadItem[], concurrency: number): Promise<void> {
    if (this.cancelled) throw new DownloadCancelled()
    this.items.push(...items)
    this.totalBytesKnown += items.reduce((a, i) => a + (i.size ?? 0), 0)
    this.queue.push(...items)
    this.startSampler()
    const n = Math.max(1, Math.min(concurrency, 32))
    const workers = Array.from({ length: n }, () => this.worker())
    const results = await Promise.allSettled(workers)
    const failure = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')
    if (failure) {
      this.cancel()
      this._state = this.cancelled && failure.reason instanceof DownloadCancelled ? 'cancelled' : 'error'
      this._error = String(failure.reason?.message ?? failure.reason)
      throw failure.reason
    }
    if (this.cancelled) {
      this._state = 'cancelled'
      throw new DownloadCancelled()
    }
  }

  finish(): void {
    if (this._state === 'running') this._state = 'done'
    this.stopSampler()
    this.emit('finished')
  }

  fail(err: unknown): void {
    if (this._state === 'running') {
      this._state = this.cancelled ? 'cancelled' : 'error'
      this._error = err instanceof Error ? err.message : String(err)
    }
    this.stopSampler()
    this.emit('finished')
  }

  private startSampler(): void {
    if (this.sampler) return
    this.lastSampleAt = Date.now()
    this.lastSampleBytes = 0
    this.sampler = setInterval(() => {
      const now = Date.now()
      const bytes = this.doneBytes + sum(this.inFlightBytes.values())
      const dt = (now - this.lastSampleAt) / 1000
      if (dt > 0) {
        const inst = Math.max(0, bytes - this.lastSampleBytes) / dt
        this.speedEma = this.speedEma === 0 ? inst : this.speedEma * 0.7 + inst * 0.3
      }
      this.lastSampleAt = now
      this.lastSampleBytes = bytes
    }, 500)
    this.sampler.unref?.()
  }

  private stopSampler(): void {
    if (this.sampler) clearInterval(this.sampler)
    this.sampler = null
  }

  private async worker(): Promise<void> {
    for (;;) {
      const item = this.queue.shift()
      if (!item) return
      if (this.cancelled) throw new DownloadCancelled()
      await this.downloadOne(item)
      this.doneFiles++
    }
  }

  private async downloadOne(item: DownloadItem): Promise<void> {
    // Already present and verified → count and skip.
    if (await verifies(item.dest, item)) {
      if (item.size == null) {
        const s = await stat(item.dest).catch(() => null)
        if (s) this.totalBytesKnown += s.size
      }
      this.doneBytes += item.size ?? 0
      return
    }
    await ensureDir(dirname(item.dest))
    const part = `${item.dest}.part`
    let attempt = 0
    let allowResume = true
    for (;;) {
      attempt++
      const ac = new AbortController()
      this.aborts.add(ac)
      try {
        await this.fetchToFile(item, part, ac, allowResume)
        await rename(part, item.dest)
        if (item.executable) await makeExecutable(item.dest)
        this.inFlightBytes.delete(item)
        this.doneBytes += item.size ?? (await stat(item.dest)).size
        return
      } catch (err) {
        this.inFlightBytes.delete(item)
        if (this.cancelled) throw new DownloadCancelled()
        // Hash mismatch → never resume the corrupt part again.
        if (err instanceof HashMismatch) {
          allowResume = false
          await rm(part, { force: true })
        }
        if (attempt >= MAX_ATTEMPTS) {
          throw new Error(
            `Download failed after ${attempt} attempts: ${item.url} → ${err instanceof Error ? err.message : err}`
          )
        }
        await new Promise((r) => setTimeout(r, Math.min(4000, 400 * 2 ** attempt)))
      } finally {
        this.aborts.delete(ac)
      }
    }
  }

  private async fetchToFile(
    item: DownloadItem,
    part: string,
    ac: AbortController,
    allowResume: boolean
  ): Promise<void> {
    let offset = 0
    const hash = item.sha1 ? createHash('sha1') : null
    if (allowResume) {
      const st = await stat(part).catch(() => null)
      if (st && st.size > 0 && (item.size == null || st.size < item.size)) {
        // Feed existing bytes into the hash so verification stays valid.
        if (hash) {
          for await (const chunk of createReadStream(part)) hash.update(chunk as Buffer)
        }
        offset = st.size
      } else if (st && item.size != null && st.size >= item.size) {
        await rm(part, { force: true })
      }
    } else {
      await rm(part, { force: true })
    }

    const headers: Record<string, string> = { 'user-agent': UA }
    if (offset > 0) headers.range = `bytes=${offset}-`
    const res = await fetch(item.url, { headers, signal: ac.signal })
    if (offset > 0 && res.status === 200) {
      // Server ignored Range → restart from scratch.
      offset = 0
      hash?.destroy?.()
      if (item.sha1) {
        // recreate hash state
        return await this.fetchToFileFresh(item, part, res)
      }
    }
    if (!res.ok && res.status !== 206) throw new Error(`HTTP ${res.status}`)
    if (!res.body) throw new Error('empty body')

    if (item.size == null) {
      const len = Number(res.headers.get('content-length') ?? 0)
      if (len > 0 && offset === 0) this.totalBytesKnown += len
    }

    const self = this
    let received = offset
    this.inFlightBytes.set(item, offset)
    const out = createWriteStream(part, offset > 0 ? { flags: 'a' } : undefined)
    await pipeline(
      Readable.fromWeb(res.body as import('stream/web').ReadableStream),
      async function* (src) {
        for await (const chunk of src) {
          const buf = chunk as Buffer
          hash?.update(buf)
          received += buf.length
          self.inFlightBytes.set(item, received)
          yield buf
        }
      },
      out
    )
    await this.verifyAfter(item, part, hash?.digest('hex') ?? null)
  }

  /** Restart path when the server ignored our Range request. */
  private async fetchToFileFresh(item: DownloadItem, part: string, res: Response): Promise<void> {
    const hash = item.sha1 ? createHash('sha1') : null
    const self = this
    let received = 0
    this.inFlightBytes.set(item, 0)
    const out = createWriteStream(part)
    await pipeline(
      Readable.fromWeb(res.body as import('stream/web').ReadableStream),
      async function* (src) {
        for await (const chunk of src) {
          const buf = chunk as Buffer
          hash?.update(buf)
          received += buf.length
          self.inFlightBytes.set(item, received)
          yield buf
        }
      },
      out
    )
    await this.verifyAfter(item, part, hash?.digest('hex') ?? null)
  }

  private async verifyAfter(item: DownloadItem, part: string, digest: string | null): Promise<void> {
    if (item.size != null) {
      const st = await stat(part)
      if (st.size !== item.size) {
        throw new HashMismatch(`size mismatch: expected ${item.size}, got ${st.size}`)
      }
    }
    if (item.sha1 && digest && digest.toLowerCase() !== item.sha1.toLowerCase()) {
      throw new HashMismatch(`sha1 mismatch for ${item.dest}`)
    }
  }
}

export class DownloadCancelled extends Error {
  constructor() {
    super('cancelled')
    this.name = 'DownloadCancelled'
  }
}

class HashMismatch extends Error {
  constructor(msg: string) {
    super(msg)
    this.name = 'HashMismatch'
  }
}

async function verifies(dest: string, item: DownloadItem): Promise<boolean> {
  const st = await stat(dest).catch(() => null)
  if (!st) return false
  if (item.size != null && st.size !== item.size) return false
  if (item.sha1) {
    const got = await new Promise<string>((resolve, reject) => {
      const h = createHash('sha1')
      const s = createReadStream(dest)
      s.on('data', (d) => h.update(d))
      s.on('end', () => resolve(h.digest('hex')))
      s.on('error', reject)
    }).catch(() => null)
    if (!got || got.toLowerCase() !== item.sha1.toLowerCase()) return false
  }
  return true
}

function sum(values: Iterable<number>): number {
  let t = 0
  for (const v of values) t += v
  return t
}

type ProgressListener = (all: DownloadTaskProgress[]) => void

/**
 * Registry of active tasks + throttled (10 Hz) progress fan-out to the UI.
 */
class DownloadManagerImpl {
  private tasks = new Map<string, DownloadTask>()
  private listeners = new Set<ProgressListener>()
  private ticker: ReturnType<typeof setInterval> | null = null

  createTask(id: string, opts: TaskOptions): DownloadTask {
    this.tasks.get(id)?.cancel()
    const t = new DownloadTask(id, opts)
    this.tasks.set(id, t)
    t.on('finished', () => {
      // Keep terminal state visible briefly, then drop.
      setTimeout(() => {
        if (this.tasks.get(id) === t) this.tasks.delete(id)
        this.broadcast()
      }, 4000).unref?.()
    })
    this.ensureTicker()
    this.broadcast()
    return t
  }

  cancel(id: string): void {
    this.tasks.get(id)?.cancel()
  }

  get(id: string): DownloadTask | undefined {
    return this.tasks.get(id)
  }

  snapshot(): DownloadTaskProgress[] {
    return [...this.tasks.values()].map((t) => t.progress())
  }

  onProgress(fn: ProgressListener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private ensureTicker(): void {
    if (this.ticker) return
    this.ticker = setInterval(() => {
      if (this.tasks.size === 0) {
        clearInterval(this.ticker!)
        this.ticker = null
        return
      }
      this.broadcast()
    }, 100)
    this.ticker.unref?.()
  }

  private broadcast(): void {
    const snap = this.snapshot()
    for (const l of this.listeners) l(snap)
  }
}

export const DownloadManager = new DownloadManagerImpl()
