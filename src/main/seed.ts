import { readFileSync } from 'node:fs'
import { openDb } from './db'
import { log } from './logger'

/**
 * Test/QA support: NATIVE_SEED=<file.json> pre-populates the database so
 * Playwright can screenshot populated screens deterministically.
 * The seed file shape mirrors the DB tables (see e2e/fixtures/seed.json).
 */
export function seedFromEnv(): void {
  const file = process.env.NATIVE_SEED
  if (!file) return
  try {
    const seed = JSON.parse(readFileSync(file, 'utf-8')) as {
      settings?: Record<string, unknown>
      accounts?: {
        id: string
        type: string
        username: string
        uuid: string
        active?: boolean
      }[]
      instances?: Record<string, unknown>[]
      servers?: {
        id: string
        name: string
        address: string
        instanceId?: string | null
        lastPlayedAt?: number | null
        totalPlayMs?: number
        playCount?: number
        detected?: boolean
      }[]
    }
    const db = openDb()
    if (seed.settings) {
      const stmt = db.prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
      )
      for (const [k, v] of Object.entries(seed.settings)) stmt.run(k, JSON.stringify(v))
    }
    for (const a of seed.accounts ?? []) {
      db.prepare(
        `INSERT OR REPLACE INTO accounts (id, type, username, uuid, active, added_at, tokens_enc)
         VALUES (?, ?, ?, ?, ?, ?, NULL)`
      ).run(a.id, a.type, a.username, a.uuid, a.active ? 1 : 0, Date.now())
    }
    for (const i of seed.instances ?? []) {
      const inst = i as {
        id: string
        name: string
        icon?: string | null
        mcVersion: string
        loader?: string
        loaderVersion?: string | null
        memMin?: number
        memMax?: number
        installed?: boolean
        lastPlayedAt?: number | null
        totalPlayMs?: number
        group?: string | null
      }
      db.prepare(
        `INSERT OR REPLACE INTO instances
           (id, name, icon, mc_version, loader, loader_version, mem_min, mem_max, jvm_args,
            game_width, game_height, fullscreen, grp, created_at, last_played_at, total_play_ms, installed, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', 854, 480, 0, ?, ?, ?, ?, ?, '')`
      ).run(
        inst.id,
        inst.name,
        inst.icon ?? null,
        inst.mcVersion,
        inst.loader ?? 'vanilla',
        inst.loaderVersion ?? null,
        inst.memMin ?? 512,
        inst.memMax ?? 4096,
        inst.group ?? null,
        Date.now() - 86_400_000,
        inst.lastPlayedAt ?? null,
        inst.totalPlayMs ?? 0,
        inst.installed ? 1 : 0
      )
    }
    ;(seed.servers ?? []).forEach((s, idx) => {
      db.prepare(
        `INSERT OR REPLACE INTO servers
           (id, name, address, instance_id, added_at, sort_index,
            last_played_at, total_play_ms, play_count, detected)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        s.id,
        s.name,
        s.address,
        s.instanceId ?? null,
        Date.now(),
        idx,
        s.lastPlayedAt ?? null,
        s.totalPlayMs ?? 0,
        s.playCount ?? 0,
        s.detected ? 1 : 0
      )
    })
    log.info(`Seeded database from ${file}`)
  } catch (err) {
    log.error(`Seed failed: ${err instanceof Error ? err.message : err}`)
  }
}
