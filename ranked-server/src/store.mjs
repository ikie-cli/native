import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { seasonRatingChange } from './rating.mjs'

const PROGRESS = ['waiting', 'overworld', 'nether', 'bastion', 'fortress', 'stronghold', 'end', 'finished']

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

function publicPlayer(row) {
  return {
    id: row.id,
    username: row.username,
    verified: Boolean(row.verified),
    rating: row.rating,
    wins: row.wins,
    losses: row.losses,
    races: row.wins + row.losses
  }
}

const SPLIT_FLOORS = { nether: 20_000, bastion: 45_000, fortress: 45_000, stronghold: 90_000, end: 110_000 }
const MOD_ALLOWLIST = new Set(['minecraft', 'java', 'fabricloader', 'fabric', 'fabric-api', 'native-ranked', 'mixinextras'])

function safeSplits(value) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function disallowedMods(mods) {
  if (!Array.isArray(mods)) return []
  return mods
    .map((m) => String(m).toLowerCase())
    .filter((id) => !(MOD_ALLOWLIST.has(id) || id.startsWith('fabric-') || id.startsWith('fabricloader')))
}

export class RankedStore {
  constructor(file = ':memory:') {
    this.db = new DatabaseSync(file)
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS players (
        id TEXT PRIMARY KEY,
        profile_key TEXT NOT NULL UNIQUE,
        username TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        rating INTEGER NOT NULL DEFAULT 1000,
        wins INTEGER NOT NULL DEFAULT 0,
        losses INTEGER NOT NULL DEFAULT 0,
        season INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS queue (
        player_id TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
        mode TEXT NOT NULL,
        joined_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS matches (
        id TEXT PRIMARY KEY,
        mode TEXT NOT NULL,
        seed TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        starts_at INTEGER,
        finished_at INTEGER,
        winner_id TEXT REFERENCES players(id)
      );
      CREATE TABLE IF NOT EXISTS match_players (
        match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
        player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        progress TEXT NOT NULL DEFAULT 'waiting',
        ready_at INTEGER,
        finish_ms INTEGER,
        rating_before INTEGER NOT NULL,
        rating_delta INTEGER NOT NULL DEFAULT 0,
        splits TEXT NOT NULL DEFAULT '{}',
        PRIMARY KEY (match_id, player_id)
      );
      CREATE INDEX IF NOT EXISTS idx_matches_created ON matches(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_match_players_player ON match_players(player_id, match_id);
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    `)
    this.db.prepare("INSERT OR IGNORE INTO meta (key, value) VALUES ('season', '1')").run()
    // Migration: premium-verified flag for existing databases.
    const cols = this.db.prepare('PRAGMA table_info(players)').all().map((c) => c.name)
    if (!cols.includes('verified')) {
      this.db.exec('ALTER TABLE players ADD COLUMN verified INTEGER NOT NULL DEFAULT 0')
    }
    const mpCols = this.db.prepare('PRAGMA table_info(match_players)').all().map((c) => c.name)
    if (!mpCols.includes('splits')) {
      this.db.exec("ALTER TABLE match_players ADD COLUMN splits TEXT NOT NULL DEFAULT '{}'")
    }
    if (!cols.includes('season')) {
      this.db.exec('ALTER TABLE players ADD COLUMN season INTEGER NOT NULL DEFAULT 1')
    }
  }

  close() {
    this.db.close()
  }

  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const value = fn()
      this.db.exec('COMMIT')
      return value
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  register(profileId, username, deviceId) {
    if (!/^[a-zA-Z0-9_-]{2,64}$/.test(profileId)) throw new Error('Invalid profile id')
    if (!/^[a-zA-Z0-9_]{2,16}$/.test(username)) throw new Error('Username must be 2-16 letters, numbers, or underscores')
    if (!/^[a-f0-9]{32,128}$/i.test(deviceId)) throw new Error('Invalid device id')
    const profileKey = `${deviceId}:${profileId}`
    const now = Date.now()
    const token = randomBytes(32).toString('hex')
    const existing = this.db.prepare('SELECT * FROM players WHERE profile_key = ?').get(profileKey)
    if (existing) {
      this.db.prepare('UPDATE players SET username = ?, token_hash = ?, last_seen_at = ? WHERE id = ?')
        .run(username, hashToken(token), now, existing.id)
    } else {
      this.db.prepare(`
        INSERT INTO players (id, profile_key, username, token_hash, created_at, last_seen_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(randomUUID(), profileKey, username, hashToken(token), now, now)
    }
    const row = this.db.prepare('SELECT * FROM players WHERE profile_key = ?').get(profileKey)
    this.ensureSeason(row.id)
    return { token, player: publicPlayer(this.db.prepare('SELECT * FROM players WHERE id = ?').get(row.id)) }
  }

  /** Issue a verified token for a Mojang-authenticated (premium) player, keyed by real UUID. */
  verifySession(uuid, username) {
    if (!/^[a-zA-Z0-9-]{8,64}$/.test(String(uuid))) throw new Error('Invalid session profile')
    if (!/^[a-zA-Z0-9_]{2,16}$/.test(username)) throw new Error('Username must be 2-16 letters, numbers, or underscores')
    const profileKey = `mojang:${uuid}`
    const now = Date.now()
    const token = randomBytes(32).toString('hex')
    const existing = this.db.prepare('SELECT * FROM players WHERE profile_key = ?').get(profileKey)
    if (existing) {
      this.db.prepare('UPDATE players SET username = ?, token_hash = ?, verified = 1, last_seen_at = ? WHERE id = ?')
        .run(username, hashToken(token), now, existing.id)
    } else {
      this.db.prepare(`
        INSERT INTO players (id, profile_key, username, token_hash, verified, created_at, last_seen_at)
        VALUES (?, ?, ?, ?, 1, ?, ?)
      `).run(randomUUID(), profileKey, username, hashToken(token), now, now)
    }
    const row = this.db.prepare('SELECT * FROM players WHERE profile_key = ?').get(profileKey)
    this.ensureSeason(row.id)
    return { token, player: publicPlayer(this.db.prepare('SELECT * FROM players WHERE id = ?').get(row.id)) }
  }

  authenticate(token) {
    if (!token) return null
    const row = this.db.prepare('SELECT * FROM players WHERE token_hash = ?').get(hashToken(token))
    if (!row) return null
    this.ensureSeason(row.id)
    this.db.prepare('UPDATE players SET last_seen_at = ? WHERE id = ?').run(Date.now(), row.id)
    return publicPlayer(this.db.prepare('SELECT * FROM players WHERE id = ?').get(row.id))
  }

  profile(playerId) {
    const row = this.db.prepare('SELECT * FROM players WHERE id = ?').get(playerId)
    return row ? publicPlayer(row) : null
  }

  joinQueue(playerId, mode, mods) {
    if (!['ranked', 'casual'].includes(mode)) throw new Error('Invalid queue mode')
    if (mode === 'ranked') {
      const row = this.db.prepare('SELECT verified FROM players WHERE id = ?').get(playerId)
      if (!row || !row.verified) throw new Error('Ranked is for verified premium accounts only')
      const bad = disallowedMods(mods)
      if (bad.length) throw new Error(`Ranked disallows these mods: ${bad.slice(0, 6).join(', ')}`)
    }
    this.expire()
    const active = this.activeMatch(playerId)
    if (active) return { state: 'matched', match: active, ...this.counts() }
    const now = Date.now()
    this.db.prepare(`
      INSERT INTO queue (player_id, mode, joined_at) VALUES (?, ?, ?)
      ON CONFLICT(player_id) DO UPDATE SET mode = excluded.mode, joined_at = excluded.joined_at
    `).run(playerId, mode, now)
    const me = this.db.prepare('SELECT rating FROM players WHERE id = ?').get(playerId)
    const myRating = me ? me.rating : 1000
    // Elo-based matchmaking: pick the closest-rated opponent whose search
    // window (which widens the longer they have waited) admits our gap.
    const candidates = this.db.prepare(`
      SELECT q.player_id, q.joined_at, p.rating FROM queue q
      JOIN players p ON p.id = q.player_id
      WHERE q.mode = ? AND q.player_id != ?
    `).all(mode, playerId)
    let best = null
    for (const c of candidates) {
      const waitSeconds = Math.max(0, (now - c.joined_at) / 1000)
      const window = 80 + 30 * waitSeconds
      const gap = Math.abs(myRating - c.rating)
      if (gap <= window && (!best || gap < best.gap)) best = { id: c.player_id, gap }
    }
    if (!best) return { state: 'queued', joinedAt: now, ...this.counts() }
    return { state: 'matched', match: this.createMatch(best.id, playerId, mode), ...this.counts() }
  }

  counts() {
    const now = Date.now()
    return {
      season: this.season(),
      online: this.db.prepare('SELECT count(*) AS n FROM players WHERE last_seen_at > ?').get(now - 600_000).n,
      queued: this.db.prepare('SELECT count(*) AS n FROM queue').get().n
    }
  }

  season() {
    const row = this.db.prepare("SELECT value FROM meta WHERE key = 'season'").get()
    return row ? parseInt(row.value, 10) || 1 : 1
  }

  /** Advance to the next season, soft-resetting every player's rating and record. */
  startNewSeason() {
    const next = this.season() + 1
    this.transaction(() => {
      this.db.prepare('UPDATE players SET rating = CAST(ROUND(1000 + (rating - 1000) * 0.5) AS INTEGER), wins = 0, losses = 0, season = ?').run(next)
      this.db.prepare("UPDATE meta SET value = ? WHERE key = 'season'").run(String(next))
    })
    return next
  }

  /** Lazily soft-reset a player when they return in a newer season. */
  ensureSeason(playerId) {
    const current = this.season()
    const row = this.db.prepare('SELECT season, rating FROM players WHERE id = ?').get(playerId)
    if (row && row.season !== current) {
      const compressed = Math.round(1000 + (row.rating - 1000) * 0.5)
      this.db.prepare('UPDATE players SET rating = ?, wins = 0, losses = 0, season = ? WHERE id = ?').run(compressed, current, playerId)
    }
  }

  leaveQueue(playerId) {
    this.db.prepare('DELETE FROM queue WHERE player_id = ?').run(playerId)
  }

  createMatch(a, b, mode) {
    const id = randomUUID()
    const seed = BigInt.asIntN(64, BigInt(`0x${randomBytes(8).toString('hex')}`)).toString()
    const now = Date.now()
    this.transaction(() => {
      const pa = this.profile(a)
      const pb = this.profile(b)
      if (!pa || !pb) throw new Error('Player disappeared')
      this.db.prepare('DELETE FROM queue WHERE player_id IN (?, ?)').run(a, b)
      this.db.prepare(`INSERT INTO matches (id, mode, seed, status, created_at) VALUES (?, ?, ?, 'preparing', ?)`)
        .run(id, mode, seed, now)
      const add = this.db.prepare(`
        INSERT INTO match_players (match_id, player_id, rating_before) VALUES (?, ?, ?)
      `)
      add.run(id, a, pa.rating)
      add.run(id, b, pb.rating)
    })
    return this.match(id, b)
  }

  queueState(playerId) {
    this.expire()
    const match = this.activeMatch(playerId)
    if (match) return { state: 'matched', match, ...this.counts() }
    const row = this.db.prepare('SELECT joined_at FROM queue WHERE player_id = ?').get(playerId)
    return row ? { state: 'queued', joinedAt: row.joined_at, ...this.counts() } : { state: 'idle', ...this.counts() }
  }

  activeMatch(playerId) {
    const row = this.db.prepare(`
      SELECT m.id FROM matches m
      JOIN match_players mp ON mp.match_id = m.id
      WHERE mp.player_id = ? AND m.status IN ('preparing', 'running')
      ORDER BY m.created_at DESC LIMIT 1
    `).get(playerId)
    return row ? this.match(row.id, playerId) : null
  }

  match(matchId, viewerId) {
    const match = this.db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId)
    if (!match) return null
    const rows = this.db.prepare(`
      SELECT mp.*, p.username, p.rating, p.wins, p.losses
      FROM match_players mp JOIN players p ON p.id = mp.player_id
      WHERE mp.match_id = ? ORDER BY mp.player_id
    `).all(matchId)
    if (!rows.some((r) => r.player_id === viewerId)) return null
    return {
      id: match.id,
      mode: match.mode,
      seed: match.seed,
      status: match.status,
      createdAt: match.created_at,
      startsAt: match.starts_at,
      finishedAt: match.finished_at,
      winnerId: match.winner_id,
      players: rows.map((r) => ({
        id: r.player_id,
        username: r.username,
        rating: r.rating,
        progress: r.progress,
        ready: r.ready_at !== null,
        finishMs: r.finish_ms,
        ratingDelta: r.rating_delta,
        splits: safeSplits(r.splits)
      }))
    }
  }

  ready(matchId, playerId, reportedSeed) {
    this.assertParticipant(matchId, playerId)
    const info = this.db.prepare('SELECT seed, status FROM matches WHERE id = ?').get(matchId)
    if (info && info.status === 'preparing' && reportedSeed != null && String(reportedSeed) !== info.seed) {
      // The player did not generate the assigned world — void the match (no Elo change).
      this.db.prepare(`UPDATE matches SET status = 'void', finished_at = ? WHERE id = ?`).run(Date.now(), matchId)
      return this.match(matchId, playerId)
    }
    this.db.prepare(`UPDATE match_players SET ready_at = COALESCE(ready_at, ?) WHERE match_id = ? AND player_id = ?`)
      .run(Date.now(), matchId, playerId)
    const pending = this.db.prepare('SELECT count(*) AS n FROM match_players WHERE match_id = ? AND ready_at IS NULL').get(matchId).n
    if (pending === 0) {
      this.db.prepare(`UPDATE matches SET status = 'running', starts_at = ? WHERE id = ? AND status = 'preparing'`)
        .run(Date.now() + 5000, matchId)
      this.db.prepare(`UPDATE match_players SET progress = 'overworld' WHERE match_id = ? AND progress = 'waiting'`).run(matchId)
    }
    return this.match(matchId, playerId)
  }

  progress(matchId, playerId, progress) {
    if (!PROGRESS.includes(progress) || progress === 'finished') throw new Error('Invalid progress')
    const row = this.assertParticipant(matchId, playerId)
    if (PROGRESS.indexOf(progress) < PROGRESS.indexOf(row.progress)) return this.match(matchId, playerId)
    const match = this.db.prepare('SELECT starts_at, status FROM matches WHERE id = ?').get(matchId)
    const splits = safeSplits(row.splits)
    if (match && match.status === 'running' && match.starts_at && splits[progress] == null) {
      const elapsed = Date.now() - match.starts_at
      if (elapsed > 0) splits[progress] = elapsed
    }
    this.db.prepare('UPDATE match_players SET progress = ?, splits = ? WHERE match_id = ? AND player_id = ?')
      .run(progress, JSON.stringify(splits), matchId, playerId)
    return this.match(matchId, playerId)
  }

  finish(matchId, playerId) {
    const match = this.db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId)
    const self = this.assertParticipant(matchId, playerId)
    if (!match || match.status !== 'running' || !match.starts_at) throw new Error('Match is not running')
    if (Date.now() < match.starts_at) throw new Error('Race has not started')
    const elapsed = Date.now() - match.starts_at
    // Anti-cheat: no legitimate same-seed run finishes in under two minutes, and
    // a real dragon kill requires reaching the stronghold (ender eyes) first.
    if (elapsed < 120_000) throw new Error('Invalid finish: implausibly fast')
    if (PROGRESS.indexOf(self.progress) < PROGRESS.indexOf('stronghold')) {
      throw new Error('Invalid finish: stronghold not reached')
    }
    const splits = safeSplits(self.splits)
    for (const [milestone, floor] of Object.entries(SPLIT_FLOORS)) {
      if (splits[milestone] != null && splits[milestone] < floor) {
        throw new Error(`Invalid finish: implausible ${milestone} split`)
      }
    }
    this.db.prepare(`UPDATE match_players SET progress = 'finished', finish_ms = ? WHERE match_id = ? AND player_id = ?`)
      .run(elapsed, matchId, playerId)
    this.complete(matchId, playerId)
    return this.match(matchId, playerId)
  }

  /** Public profile + recent history for any player id (no auth needed). */
  publicProfile(playerId) {
    const player = this.profile(playerId)
    return player ? { player, history: this.history(playerId) } : null
  }

  forfeit(matchId, playerId) {
    this.assertParticipant(matchId, playerId)
    const opponent = this.db.prepare('SELECT player_id FROM match_players WHERE match_id = ? AND player_id != ?').get(matchId, playerId)
    if (!opponent) throw new Error('Opponent not found')
    this.complete(matchId, opponent.player_id)
    return this.match(matchId, playerId)
  }

  complete(matchId, winnerId) {
    const match = this.db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId)
    if (!match || match.status === 'finished') return
    const players = this.db.prepare('SELECT * FROM match_players WHERE match_id = ?').all(matchId)
    const winner = players.find((p) => p.player_id === winnerId)
    const loser = players.find((p) => p.player_id !== winnerId)
    const gamesOf = (id) => {
      const r = this.db.prepare('SELECT wins + losses AS g FROM players WHERE id = ?').get(id)
      return r ? r.g : 0
    }
    const delta = match.mode === 'ranked'
      ? seasonRatingChange(winner.rating_before, loser.rating_before, gamesOf(winnerId), gamesOf(loser.player_id))
      : { winner: 0, loser: 0 }
    this.transaction(() => {
      this.db.prepare(`UPDATE matches SET status = 'finished', finished_at = ?, winner_id = ? WHERE id = ?`)
        .run(Date.now(), winnerId, matchId)
      this.db.prepare('UPDATE match_players SET rating_delta = ? WHERE match_id = ? AND player_id = ?')
        .run(delta.winner, matchId, winnerId)
      this.db.prepare('UPDATE match_players SET rating_delta = ? WHERE match_id = ? AND player_id = ?')
        .run(delta.loser, matchId, loser.player_id)
      this.db.prepare('UPDATE players SET rating = rating + ?, wins = wins + 1 WHERE id = ?')
        .run(delta.winner, winnerId)
      this.db.prepare('UPDATE players SET rating = MAX(0, rating + ?), losses = losses + 1 WHERE id = ?')
        .run(delta.loser, loser.player_id)
    })
  }

  assertParticipant(matchId, playerId) {
    const row = this.db.prepare('SELECT * FROM match_players WHERE match_id = ? AND player_id = ?').get(matchId, playerId)
    if (!row) throw new Error('Match not found')
    return row
  }

  history(playerId, limit = 20) {
    return this.db.prepare(`
      SELECT m.id, m.mode, m.seed, m.created_at AS createdAt, m.finished_at AS finishedAt,
             m.winner_id AS winnerId, mp.finish_ms AS finishMs, mp.rating_delta AS ratingDelta,
             op.username AS opponent
      FROM match_players mp
      JOIN matches m ON m.id = mp.match_id
      JOIN match_players omp ON omp.match_id = m.id AND omp.player_id != mp.player_id
      JOIN players op ON op.id = omp.player_id
      WHERE mp.player_id = ? AND m.status = 'finished'
      ORDER BY m.finished_at DESC LIMIT ?
    `).all(playerId, Math.max(1, Math.min(100, limit)))
  }

  leaderboard(limit = 50) {
    return this.db.prepare(`SELECT id, username, rating, wins, losses FROM players ORDER BY rating DESC, wins DESC LIMIT ?`)
      .all(Math.max(1, Math.min(100, limit))).map(publicPlayer)
  }

  stats() {
    return {
      players: this.db.prepare('SELECT count(*) AS n FROM players').get().n,
      queued: this.db.prepare('SELECT count(*) AS n FROM queue').get().n,
      activeMatches: this.db.prepare(`SELECT count(*) AS n FROM matches WHERE status IN ('preparing', 'running')`).get().n,
      completedMatches: this.db.prepare(`SELECT count(*) AS n FROM matches WHERE status = 'finished'`).get().n
    }
  }

  expire() {
    const now = Date.now()
    this.db.prepare('DELETE FROM queue WHERE joined_at < ?').run(now - 120_000)
    const stale = this.db.prepare(`SELECT id FROM matches WHERE status IN ('preparing', 'running') AND created_at < ?`).all(now - 30 * 60_000)
    for (const row of stale) this.db.prepare(`UPDATE matches SET status = 'expired', finished_at = ? WHERE id = ?`).run(now, row.id)
  }
}
