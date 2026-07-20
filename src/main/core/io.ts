import { Worker } from 'node:worker_threads'
import { join } from 'node:path'
import type { IoRequest, IoResponse } from '../workers/io-worker'

/** Omit that distributes over a union so each variant keeps its own fields. */
type DistributiveOmit<T, K extends keyof any> = T extends unknown ? Omit<T, K> : never
type IoCall = DistributiveOmit<IoRequest, 'id'>

/**
 * Bridge to the io worker thread. Heavy hashing/extraction never runs on the
 * main-process event loop.
 */
class IoPool {
  private worker: Worker | null = null
  private nextId = 1
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()

  private ensure(): Worker {
    if (this.worker) return this.worker
    this.worker = new Worker(join(__dirname, 'io-worker.js'))
    this.worker.on('message', (res: IoResponse) => {
      const p = this.pending.get(res.id)
      if (!p) return
      this.pending.delete(res.id)
      if (res.ok) p.resolve(res.result)
      else p.reject(new Error(res.error))
    })
    this.worker.on('error', (err) => {
      for (const p of this.pending.values()) p.reject(err)
      this.pending.clear()
      this.worker = null
    })
    this.worker.unref()
    return this.worker
  }

  private call<T>(req: IoCall): Promise<T> {
    const id = this.nextId++
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
      this.ensure().postMessage({ ...req, id })
    })
  }

  sha1Batch(files: string[]): Promise<Record<string, string | null>> {
    return this.call({ op: 'sha1-batch', files })
  }

  unzip(archive: string, dest: string, exclude?: string[]): Promise<void> {
    return this.call({ op: 'unzip', archive, dest, exclude })
  }

  zipDir(dir: string, dest: string): Promise<void> {
    return this.call({ op: 'zip-dir', dir, dest })
  }

  untar(archive: string, dest: string): Promise<void> {
    return this.call({ op: 'untar', archive, dest })
  }

  shutdown(): void {
    this.worker?.terminate()
    this.worker = null
  }
}

export const io = new IoPool()
