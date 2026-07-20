import type Database from 'better-sqlite3'
import { DEFAULT_SETTINGS, type AppSettings } from '@shared/types'

export class SettingsService {
  constructor(private db: Database.Database) {}

  get(): AppSettings {
    const rows = this.db.prepare('SELECT key, value FROM settings').all() as {
      key: string
      value: string
    }[]
    const stored: Record<string, unknown> = {}
    for (const r of rows) {
      try {
        stored[r.key] = JSON.parse(r.value)
      } catch {
        stored[r.key] = r.value
      }
    }
    return { ...DEFAULT_SETTINGS, ...stored } as AppSettings
  }

  set(patch: Partial<AppSettings>): AppSettings {
    const stmt = this.db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    )
    const tx = this.db.transaction((entries: [string, unknown][]) => {
      for (const [k, v] of entries) stmt.run(k, JSON.stringify(v))
    })
    tx(Object.entries(patch).filter(([k]) => k in DEFAULT_SETTINGS))
    return this.get()
  }
}
