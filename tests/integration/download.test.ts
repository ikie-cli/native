import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DownloadTask } from '../../src/main/core/download'
import { makeBlob, startFixtureServer, type Fixture } from './helpers/fixture-server'
import { createHash } from 'node:crypto'

let fx: Fixture
let dir: string

beforeEach(async () => {
  fx = await startFixtureServer()
  dir = await mkdtemp(join(tmpdir(), 'native-dl-'))
})

afterEach(async () => {
  await fx.close()
  await rm(dir, { recursive: true, force: true })
})

function task(id = 't1'): DownloadTask {
  return new DownloadTask(id, { label: 'test', phase: 'files' })
}

describe('DownloadTask', () => {
  it('downloads files in parallel with checksum verification', async () => {
    const blobs = Array.from({ length: 12 }, (_, i) => makeBlob(4096 + i * 100, i + 1))
    const items = blobs.map((b, i) => {
      const meta = fx.add(`/f${i}`, b)
      return { url: `${fx.baseUrl}/f${i}`, dest: join(dir, `f${i}.bin`), size: meta.size, sha1: meta.sha1 }
    })
    const t = task()
    await t.run(items, 6)
    t.finish()

    for (let i = 0; i < blobs.length; i++) {
      const got = await readFile(join(dir, `f${i}.bin`))
      expect(got.equals(blobs[i]), `file ${i}`).toBe(true)
    }
    const p = t.progress()
    expect(p.state).toBe('done')
    expect(p.doneFiles).toBe(12)
    expect(p.doneBytes).toBe(blobs.reduce((a, b) => a + b.length, 0))
  })

  it('skips files that already verify (idempotent re-run)', async () => {
    const blob = makeBlob(2048)
    const meta = fx.add('/lib.jar', blob)
    const dest = join(dir, 'lib.jar')
    await writeFile(dest, blob)

    const t = task()
    await t.run([{ url: `${fx.baseUrl}/lib.jar`, dest, size: meta.size, sha1: meta.sha1 }], 2)
    t.finish()
    expect(fx.requests.filter((r) => r.path === '/lib.jar')).toHaveLength(0)
  })

  it('re-downloads when the existing file is corrupt', async () => {
    const blob = makeBlob(2048)
    const meta = fx.add('/lib.jar', blob)
    const dest = join(dir, 'lib.jar')
    await writeFile(dest, makeBlob(2048, 99)) // wrong content, right size

    const t = task()
    await t.run([{ url: `${fx.baseUrl}/lib.jar`, dest, size: meta.size, sha1: meta.sha1 }], 1)
    t.finish()
    expect((await readFile(dest)).equals(blob)).toBe(true)
    expect(fx.requests.filter((r) => r.path === '/lib.jar').length).toBeGreaterThan(0)
  })

  it('resumes a partial .part file with a Range request and still verifies sha1', async () => {
    const blob = makeBlob(64 * 1024)
    const meta = fx.add('/big.bin', blob)
    const dest = join(dir, 'big.bin')
    // Simulate a previous interrupted attempt: half the file in .part
    await writeFile(`${dest}.part`, blob.subarray(0, 32 * 1024))

    const t = task()
    await t.run([{ url: `${fx.baseUrl}/big.bin`, dest, size: meta.size, sha1: meta.sha1 }], 1)
    t.finish()

    expect((await readFile(dest)).equals(blob)).toBe(true)
    const req = fx.requests.find((r) => r.path === '/big.bin')
    expect(req?.range).toBe(`bytes=${32 * 1024}-`)
  })

  it('recovers when the server ignores Range (fresh restart path)', async () => {
    const blob = makeBlob(16 * 1024)
    const meta = fx.add('/norange.bin', blob, { ignoreRange: true })
    const dest = join(dir, 'norange.bin')
    await writeFile(`${dest}.part`, blob.subarray(0, 4096))

    const t = task()
    await t.run([{ url: `${fx.baseUrl}/norange.bin`, dest, size: meta.size, sha1: meta.sha1 }], 1)
    t.finish()
    expect((await readFile(dest)).equals(blob)).toBe(true)
  })

  it('survives a mid-transfer connection drop by resuming', async () => {
    const blob = makeBlob(128 * 1024)
    const meta = fx.add('/flaky.bin', blob, { truncateOnceAt: 48 * 1024 })
    const dest = join(dir, 'flaky.bin')

    const t = task()
    await t.run([{ url: `${fx.baseUrl}/flaky.bin`, dest, size: meta.size, sha1: meta.sha1 }], 1)
    t.finish()
    expect((await readFile(dest)).equals(blob)).toBe(true)
    // Second request should have been a resume (Range) from the cut point.
    const ranged = fx.requests.filter((r) => r.path === '/flaky.bin' && r.range)
    expect(ranged.length).toBeGreaterThanOrEqual(1)
  })

  it('retries transient 500s with backoff and eventually succeeds', async () => {
    const blob = makeBlob(1024)
    const meta = fx.add('/retry.bin', blob, { failuresRemaining: 2 })
    const dest = join(dir, 'retry.bin')

    const t = task()
    await t.run([{ url: `${fx.baseUrl}/retry.bin`, dest, size: meta.size, sha1: meta.sha1 }], 1)
    t.finish()
    expect((await readFile(dest)).equals(blob)).toBe(true)
    expect(fx.requests.filter((r) => r.path === '/retry.bin').length).toBe(3)
  })

  it('fails after exhausting retries and reports error state', async () => {
    const blob = makeBlob(1024)
    fx.add('/dead.bin', blob, { failuresRemaining: 99 })

    const t = task()
    await expect(
      t.run([{ url: `${fx.baseUrl}/dead.bin`, dest: join(dir, 'dead.bin'), size: blob.length }], 1)
    ).rejects.toThrow(/failed after/)
    t.fail(new Error('x'))
    expect(t.progress().state).toBe('error')
  })

  it('rejects a body whose hash does not match (poisoned mirror)', async () => {
    const blob = makeBlob(4096)
    fx.add('/evil.bin', blob)
    const wrongSha = createHash('sha1').update('something else').digest('hex')

    const t = task()
    await expect(
      t.run([{ url: `${fx.baseUrl}/evil.bin`, dest: join(dir, 'evil.bin'), size: blob.length, sha1: wrongSha }], 1)
    ).rejects.toThrow()
    // the corrupt file must not be promoted to its final name
    await expect(stat(join(dir, 'evil.bin'))).rejects.toThrow()
  })

  it('cancel() aborts in-flight work and marks the task cancelled', async () => {
    const blob = makeBlob(512 * 1024)
    const meta = fx.add('/slow.bin', blob, { responseDelayMs: 100 })
    const t = task()
    const run = t.run(
      [{ url: `${fx.baseUrl}/slow.bin`, dest: join(dir, 'slow.bin'), size: meta.size, sha1: meta.sha1 }],
      1
    )
    // Wait until fetch is genuinely in flight, then cancel deterministically.
    await vi.waitFor(() => expect(fx.requests.some((r) => r.path === '/slow.bin')).toBe(true))
    t.cancel()
    await expect(run).rejects.toThrow()
    t.fail(new Error('cancelled'))
    expect(t.progress().state).toBe('cancelled')
  })

  it('tracks byte-accurate progress totals', async () => {
    const a = fx.add('/a', makeBlob(10_000))
    const b = fx.add('/b', makeBlob(20_000))
    const t = task()
    await t.run(
      [
        { url: `${fx.baseUrl}/a`, dest: join(dir, 'a'), size: a.size, sha1: a.sha1 },
        { url: `${fx.baseUrl}/b`, dest: join(dir, 'b'), size: b.size, sha1: b.sha1 }
      ],
      2
    )
    t.finish()
    const p = t.progress()
    expect(p.totalBytes).toBe(30_000)
    expect(p.doneBytes).toBe(30_000)
    expect(p.totalFiles).toBe(2)
    expect(p.doneFiles).toBe(2)
  })
})
