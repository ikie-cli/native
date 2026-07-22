import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { paths } from './paths'

let db: Database.Database | null = null

const MIGRATIONS: string[] = [
  // v1 — initial schema
  `
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('msa','offline')),
    username TEXT NOT NULL,
    uuid TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 0,
    added_at INTEGER NOT NULL,
    tokens_enc BLOB
  );
  CREATE TABLE IF NOT EXISTS instances (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    icon TEXT,
    mc_version TEXT NOT NULL,
    loader TEXT NOT NULL DEFAULT 'vanilla',
    loader_version TEXT,
    java_path TEXT,
    mem_min INTEGER NOT NULL DEFAULT 512,
    mem_max INTEGER NOT NULL DEFAULT 4096,
    jvm_args TEXT NOT NULL DEFAULT '',
    game_width INTEGER,
    game_height INTEGER,
    fullscreen INTEGER NOT NULL DEFAULT 0,
    grp TEXT,
    created_at INTEGER NOT NULL,
    last_played_at INTEGER,
    total_play_ms INTEGER NOT NULL DEFAULT 0,
    installed INTEGER NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS playtime_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    instance_id TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    FOREIGN KEY (instance_id) REFERENCES instances(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS servers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    instance_id TEXT,
    added_at INTEGER NOT NULL,
    sort_index INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS content_index (
    instance_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    kind TEXT NOT NULL,
    project_id TEXT,
    version_id TEXT,
    platform TEXT,
    display_name TEXT,
    version_number TEXT,
    PRIMARY KEY (instance_id, file_name, kind)
  );
  `,
  // v2 — cache the launchable (loader) version id so launches/validation skip
  // re-resolving the loader against the network every time
  `
  ALTER TABLE instances ADD COLUMN resolved_version_id TEXT;
  `,
  // v3 — remember each installed project's icon so content lists can show it
  `
  ALTER TABLE content_index ADD COLUMN icon_url TEXT;
  `,
  // v4 — persisted mod-update checks: the newer compatible version (full
  // ProjectVersion JSON, so applying it later needs no network) and when the
  // file was last checked. Cached results keep the updates badge working offline.
  `
  ALTER TABLE content_index ADD COLUMN update_version_json TEXT;
  ALTER TABLE content_index ADD COLUMN update_checked_at INTEGER;
  `,
  // v5 — multiplayer history discovered from the live Minecraft client log.
  // Aggregate fields make Home/Servers fast while the session rows retain the
  // underlying play history for future detail views.
  `
  ALTER TABLE servers ADD COLUMN last_played_at INTEGER;
  ALTER TABLE servers ADD COLUMN total_play_ms INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE servers ADD COLUMN play_count INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE servers ADD COLUMN detected INTEGER NOT NULL DEFAULT 0;
  CREATE TABLE server_playtime_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id TEXT NOT NULL,
    instance_id TEXT,
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
    FOREIGN KEY (instance_id) REFERENCES instances(id) ON DELETE SET NULL
  );
  CREATE INDEX server_playtime_sessions_instance_active
    ON server_playtime_sessions(instance_id, ended_at);
  `
]

export function openDb(): Database.Database {
  if (db) return db
  const file = paths.db()
  mkdirSync(dirname(file), { recursive: true })
  db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  migrate(db)
  return db
}

function migrate(d: Database.Database): void {
  const current = d.pragma('user_version', { simple: true }) as number
  for (let v = current; v < MIGRATIONS.length; v++) {
    const tx = d.transaction(() => {
      d.exec(MIGRATIONS[v])
      d.pragma(`user_version = ${v + 1}`)
    })
    tx()
  }
}

export function closeDb(): void {
  db?.close()
  db = null
}

/** Test helper: open an isolated database at a specific path. */
export function openDbAt(file: string): Database.Database {
  mkdirSync(dirname(file), { recursive: true })
  const d = new Database(file)
  d.pragma('journal_mode = WAL')
  d.pragma('foreign_keys = ON')
  migrate(d)
  return d
}
