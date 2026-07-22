import { createHash } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

export interface FixtureFile {
  body: Buffer
  contentType?: string
  /** number of times to fail with 500 before succeeding */
  failuresRemaining?: number
  /** if true, ignore Range headers (forces full-restart path) */
  ignoreRange?: boolean
  /** drop the connection after N bytes (once), to exercise resume */
  truncateOnceAt?: number
  /** hold the response open so cancellation tests cannot win by downloading first */
  responseDelayMs?: number
}

export interface Fixture {
  server: Server
  baseUrl: string
  files: Map<string, FixtureFile>
  requests: { path: string; range: string | null }[]
  add: (path: string, body: Buffer | string, opts?: Partial<FixtureFile>) => { sha1: string; size: number }
  close: () => Promise<void>
}

/**
 * Tiny HTTP server for download tests: sha1-accurate bodies, HTTP Range
 * support, per-file failure injection and mid-body truncation.
 */
export async function startFixtureServer(): Promise<Fixture> {
  const files = new Map<string, FixtureFile>()
  const requests: Fixture['requests'] = []

  const server = createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0]
    const range = req.headers.range ?? null
    requests.push({ path, range })
    const file = files.get(req.url ?? path) ?? files.get(path)
    if (!file) {
      res.statusCode = 404
      res.end('not found')
      return
    }
    if (file.failuresRemaining && file.failuresRemaining > 0) {
      file.failuresRemaining--
      res.statusCode = 500
      res.end('injected failure')
      return
    }

    let body = file.body
    let status = 200
    if (range && !file.ignoreRange) {
      const m = range.match(/bytes=(\d+)-/)
      if (m) {
        const start = parseInt(m[1], 10)
        body = file.body.subarray(start)
        status = 206
        res.setHeader('content-range', `bytes ${start}-${file.body.length - 1}/${file.body.length}`)
      }
    }
    res.statusCode = status
    res.setHeader('content-type', file.contentType ?? 'application/octet-stream')
    res.setHeader('content-length', body.length)

    if (file.truncateOnceAt != null && file.truncateOnceAt < body.length) {
      const cut = body.subarray(0, file.truncateOnceAt)
      file.truncateOnceAt = undefined
      // Flush the partial bytes, give the client a beat to consume them, then
      // sever the connection so the transfer errors mid-body.
      res.write(cut, () => {
        setTimeout(() => res.destroy(), 60)
      })
      return
    }
    if (file.responseDelayMs) {
      setTimeout(() => res.end(body), file.responseDelayMs)
    } else {
      res.end(body)
    }
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  const baseUrl = `http://127.0.0.1:${port}`

  return {
    server,
    baseUrl,
    files,
    requests,
    add(path, body, opts = {}) {
      const buf = typeof body === 'string' ? Buffer.from(body) : body
      files.set(path, { body: buf, ...opts })
      return { sha1: createHash('sha1').update(buf).digest('hex'), size: buf.length }
    },
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections?.()
        server.close(() => resolve())
      })
  }
}

/** Deterministic pseudo-random bytes (no crypto randomness → reproducible). */
export function makeBlob(size: number, seed = 7): Buffer {
  const buf = Buffer.alloc(size)
  let x = seed
  for (let i = 0; i < size; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff
    buf[i] = x & 0xff
  }
  return buf
}
