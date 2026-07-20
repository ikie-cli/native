/**
 * Worker thread for CPU/IO heavy operations so the main process event loop
 * (and therefore IPC + UI responsiveness) never blocks:
 *  - sha1 hashing of many files (install validation)
 *  - zip extraction (natives, java archives, modpacks)
 *  - zip creation (world backups)
 */
import { parentPort } from 'node:worker_threads'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import AdmZip from 'adm-zip'

export type IoRequest =
  | { id: number; op: 'sha1-batch'; files: string[] }
  | { id: number; op: 'unzip'; archive: string; dest: string; exclude?: string[] }
  | { id: number; op: 'zip-dir'; dir: string; dest: string }
  | { id: number; op: 'untar'; archive: string; dest: string }

export type IoResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string }

function sha1(file: string): Promise<string | null> {
  return new Promise((resolve) => {
    const h = createHash('sha1')
    const s = createReadStream(file)
    s.on('data', (d) => h.update(d))
    s.on('end', () => resolve(h.digest('hex')))
    s.on('error', () => resolve(null))
  })
}

async function handle(req: IoRequest): Promise<unknown> {
  switch (req.op) {
    case 'sha1-batch': {
      const out: Record<string, string | null> = {}
      for (const f of req.files) out[f] = await sha1(f)
      return out
    }
    case 'unzip': {
      const zip = new AdmZip(req.archive)
      mkdirSync(req.dest, { recursive: true })
      const exclude = req.exclude ?? []
      for (const entry of zip.getEntries()) {
        if (entry.isDirectory) continue
        const name = entry.entryName
        if (exclude.some((e) => name.startsWith(e))) continue
        zip.extractEntryTo(entry, req.dest, true, true)
      }
      return true
    }
    case 'zip-dir': {
      const zip = new AdmZip()
      zip.addLocalFolder(req.dir)
      zip.writeZip(req.dest)
      return true
    }
    case 'untar': {
      mkdirSync(req.dest, { recursive: true })
      const r = spawnSync('tar', ['-xzf', req.archive, '-C', req.dest], { stdio: 'ignore' })
      if (r.status !== 0) throw new Error(`tar exited with ${r.status}`)
      return true
    }
  }
}

parentPort?.on('message', (req: IoRequest) => {
  handle(req)
    .then((result) => parentPort!.postMessage({ id: req.id, ok: true, result } satisfies IoResponse))
    .catch((err) =>
      parentPort!.postMessage({
        id: req.id,
        ok: false,
        error: err instanceof Error ? err.message : String(err)
      } satisfies IoResponse)
    )
})
