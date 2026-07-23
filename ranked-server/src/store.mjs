import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { ratingChange } from './rating.mjs'

const PROGRESS = ['waiting', 'overworld', 'nether', 'bastion', 'fortress', 'stronghold', 'end', 'finished']

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

function publicPlayer(row) {
  return {
    id: row.id,
    username: row.username,
    rating: row.rating,
    wins: row.wins,
    losses: row.losses,
    races: row.wins + row.losses
  }
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
        PRIMARY KEY (match_id, player_id)
      );
      CREATE INDEX IF NOT EXISTS idx_matches_created ON matches(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_match_players_player ON match_players(player_id, match_id);
    `)
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
    return { token, player: publicPlayer(row) }
  }

  authenticate(token) {
    if (!token) return null
    const row = this.db.prepare('SELECT * FROM players WHERE token_hash = ?').get(hashToken(token))
    if (!row) return null
    this.db.prepare('UPDATE players SET last_seen_at = ? WHERE id = ?').run(Date.now(), row.id)
    return publicPlayer(row)
  }

  profile(playerId) {
    const row = this.db.prepare('SELECT * FROM players WHERE id = ?').get(playerId)
    return row ? publicPlayer(row) : null
  }

  joinQueue(playerId, mode) {
    if (!['ranked', 'casual'].includes(mode)) throw new Error('Invalid queue mode')
    this.expire()
    const active = this.activeMatch(playerId)
    if (active) return { state: 'matched', match: active }
    const now = Date.now()
    this.db.prepare(`
      INSERT INTO queue (player_id, mode, joined_at) VALUES (?, ?, ?)
      ON CONFLICT(player_id) DO UPDATE SET mode = excluded.mode, joined_at = excluded.joined_at
    `).run(playerId, mode, now)
    const opponent = this.db.prepare(`
      SELECT q.player_id FROM queue q
      WHERE q.mode = ? AND q.player_id != ?
      ORDER BY q.joined_at ASC LIMIT 1
    `).get(mode, playerId)
    if (!opponent) return { state: 'queued', joinedAt: now }
    return { state: 'matched', match: this.createMatch(opponent.player_id, playerId, mode) }
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
    if (match) return { state: 'matched', match }
    const row = this.db.prepare('SELECT joined_at FROM queue WHERE player_id = ?').get(playerId)
    return row ? { state: 'queued', joinedAt: row.joined_at } : { state: 'idle' }
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
        ratingDelta: r.rating_delta
      }))
    }
  }

  ready(matchId, playerId) {
    this.assertParticipant(matchId, playerId)
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
    this.db.prepare('UPDATE match_players SET progress = ? WHERE match_id = ? AND player_id = ?')
      .run(progress, matchId, playerId)
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
    const delta = match.mode === 'ranked' ? ratingChange(winner.rating_before, loser.rating_before) : { winner: 0, loser: 0 }
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
