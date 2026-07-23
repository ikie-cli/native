import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { once } from 'node:events'
import { createRankedServer } from '../src/server.mjs'

let app
let base

before(async () => {
  // Mock Mojang session verification: any account with a serverId "owns" itself,
  // except the reserved "Unowned" name (simulates a failed/premium-less check).
  app = createRankedServer({
    hasJoined: async (username, serverId) =>
      username === 'Unowned' || !serverId ? null : { id: `uuid-${username}`, name: username }
  })
  app.server.listen(0, '127.0.0.1')
  await once(app.server, 'listening')
  base = `http://127.0.0.1:${app.server.address().port}`
})

after(async () => {
  await new Promise((resolve) => app.server.close(resolve))
  app.store.close()
})

async function request(path, init = {}, token = null) {
  const headers = { 'content-type': 'application/json', ...(init.headers ?? {}) }
  if (token) headers.authorization = `Bearer ${token}`
  const response = await fetch(`${base}${path}`, { ...init, headers })
  return { status: response.status, body: await response.json() }
}

/** Offline account (device-id register) — unverified, casual only. */
async function offline(profileId, username, deviceId) {
  const res = await request('/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify({ profileId, username, deviceId })
  })
  assert.equal(res.status, 201)
  return res.body
}

/** Premium account (Mojang-verified) — may play ranked. */
async function verified(username) {
  const res = await request('/v1/auth/verify', {
    method: 'POST',
    body: JSON.stringify({ username, serverId: `sid-${username}` })
  })
  assert.equal(res.status, 201)
  return res.body
}

test('health and unauthenticated leaderboard are public', async () => {
  assert.equal((await request('/health')).body.ok, true)
  assert.deepEqual((await request('/v1/leaderboard')).body.players, [])
})

test('matches two verified players on the same seed and applies Elo', async () => {
  const a = await verified('RunnerOne')
  const b = await verified('RunnerTwo')
  assert.equal(a.player.verified, true)
  const qa = await request('/v1/queue', { method: 'POST', body: JSON.stringify({ mode: 'ranked' }) }, a.token)
  assert.equal(qa.body.state, 'queued')
  assert.equal(typeof qa.body.online, 'number')
  assert.equal(typeof qa.body.queued, 'number')
  const qb = await request('/v1/queue', { method: 'POST', body: JSON.stringify({ mode: 'ranked' }) }, b.token)
  assert.equal(qb.body.state, 'matched')
  const match = qb.body.match
  assert.equal(match.players.length, 2)
  assert.match(match.seed, /^-?\d+$/)

  await request(`/v1/matches/${match.id}/ready`, { method: 'POST', body: JSON.stringify({ seed: match.seed }) }, a.token)
  const ready = await request(`/v1/matches/${match.id}/ready`, { method: 'POST', body: JSON.stringify({ seed: match.seed }) }, b.token)
  assert.equal(ready.body.match.status, 'running')
  assert.ok(ready.body.match.startsAt > Date.now())

  // Move the clock past the countdown and the anti-cheat finish floor.
  app.store.db.prepare('UPDATE matches SET starts_at = ? WHERE id = ?').run(Date.now() - 130_000, match.id)
  await request(`/v1/matches/${match.id}/progress`, {
    method: 'POST', body: JSON.stringify({ progress: 'end' })
  }, a.token)
  const done = await request(`/v1/matches/${match.id}/finish`, { method: 'POST' }, a.token)
  assert.equal(done.body.match.winnerId, a.player.id)
  assert.equal(done.body.match.status, 'finished')
  const mine = done.body.match.players.find((p) => p.id === a.player.id)
  assert.ok(mine.splits.end >= 110_000)

  const pa = await request('/v1/profile', {}, a.token)
  const pb = await request('/v1/profile', {}, b.token)
  assert.equal(pa.body.player.wins, 1)
  assert.equal(pb.body.player.losses, 1)
  assert.equal(pa.body.player.rating, 1020)
  assert.equal(pb.body.player.rating, 980)
})

test('rejects bad identities and tokens', async () => {
  assert.equal((await request('/v1/profile')).status, 401)
  const bad = await request('/v1/auth/register', {
    method: 'POST', body: JSON.stringify({ profileId: 'x', username: 'bad space', deviceId: 'no' })
  })
  assert.equal(bad.status, 400)
})

test('ranked is premium-only; offline players get casual only', async () => {
  const off = await offline('off-x', 'OfflineX', 'f'.repeat(32))
  assert.equal(off.player.verified, false)
  const ranked = await request('/v1/queue', { method: 'POST', body: JSON.stringify({ mode: 'ranked' }) }, off.token)
  assert.equal(ranked.status, 403)
  const casual = await request('/v1/queue', { method: 'POST', body: JSON.stringify({ mode: 'casual' }) }, off.token)
  assert.equal(casual.status, 200)
  assert.equal(casual.body.state, 'queued')
  await request('/v1/queue', { method: 'DELETE' }, off.token)
})

test('premium verification issues a verified token; unowned accounts fail', async () => {
  const v = await verified('PremiumOne')
  assert.equal(v.player.verified, true)
  const q = await request('/v1/queue', { method: 'POST', body: JSON.stringify({ mode: 'ranked' }) }, v.token)
  assert.equal(q.status, 200)
  assert.equal(q.body.state, 'queued')
  await request('/v1/queue', { method: 'DELETE' }, v.token)
  const fail = await request('/v1/auth/verify', { method: 'POST', body: JSON.stringify({ username: 'Unowned', serverId: 's' }) })
  assert.equal(fail.status, 401)
})

test('rejects implausible finishes (anti-cheat)', async () => {
  const a = await verified('CheatOne')
  const b = await verified('CheatTwo')
  await request('/v1/queue', { method: 'POST', body: JSON.stringify({ mode: 'ranked' }) }, a.token)
  const qb = await request('/v1/queue', { method: 'POST', body: JSON.stringify({ mode: 'ranked' }) }, b.token)
  const match = qb.body.match
  await request(`/v1/matches/${match.id}/ready`, { method: 'POST' }, a.token)
  await request(`/v1/matches/${match.id}/ready`, { method: 'POST' }, b.token)

  // Started 5s ago → far too fast to be a real run.
  app.store.db.prepare('UPDATE matches SET starts_at = ? WHERE id = ?').run(Date.now() - 5000, match.id)
  assert.equal((await request(`/v1/matches/${match.id}/finish`, { method: 'POST' }, a.token)).status, 400)

  // Past the time floor but still in the overworld → premature dragon kill.
  app.store.db.prepare('UPDATE matches SET starts_at = ? WHERE id = ?').run(Date.now() - 130_000, match.id)
  assert.equal((await request(`/v1/matches/${match.id}/finish`, { method: 'POST' }, a.token)).status, 400)

  // Reach the end, then a plausible finish is accepted.
  await request(`/v1/matches/${match.id}/progress`, { method: 'POST', body: JSON.stringify({ progress: 'end' }) }, a.token)
  const ok = await request(`/v1/matches/${match.id}/finish`, { method: 'POST' }, a.token)
  assert.equal(ok.status, 200)
  assert.equal(ok.body.match.winnerId, a.player.id)
})

test('public player profile is served without auth', async () => {
  const p = await verified('PublicOne')
  const res = await request(`/v1/players/${p.player.id}`)
  assert.equal(res.status, 200)
  assert.equal(res.body.player.username, 'PublicOne')
  assert.ok(Array.isArray(res.body.history))
  assert.equal((await request('/v1/players/does-not-exist')).status, 404)
})

test('ranked rejects disallowed mods but allows the fabric/native allowlist', async () => {
  const p = await verified('ModGuard')
  const bad = await request('/v1/queue', {
    method: 'POST',
    body: JSON.stringify({ mode: 'ranked', mods: ['minecraft', 'fabricloader', 'fabric-api', 'native-ranked', 'xaeros-minimap'] })
  }, p.token)
  assert.equal(bad.status, 400)
  assert.match(bad.body.error, /xaeros-minimap/)
  const ok = await request('/v1/queue', {
    method: 'POST',
    body: JSON.stringify({ mode: 'ranked', mods: ['minecraft', 'java', 'fabricloader', 'fabric-api', 'fabric-networking-api-v1', 'native-ranked'] })
  }, p.token)
  assert.equal(ok.status, 200)
  assert.equal(ok.body.state, 'queued')
  await request('/v1/queue', { method: 'DELETE' }, p.token)
})

test('voids a match when a player reports the wrong world seed', async () => {
  const a = await verified('SeedA')
  const b = await verified('SeedB')
  await request('/v1/queue', { method: 'POST', body: JSON.stringify({ mode: 'ranked' }) }, a.token)
  const qb = await request('/v1/queue', { method: 'POST', body: JSON.stringify({ mode: 'ranked' }) }, b.token)
  const match = qb.body.match
  const wrong = await request(`/v1/matches/${match.id}/ready`, {
    method: 'POST', body: JSON.stringify({ seed: `${match.seed}1` })
  }, a.token)
  assert.equal(wrong.body.match.status, 'void')
})

test('rejects an implausibly fast split (anti-cheat)', async () => {
  const a = await verified('SplitA')
  const b = await verified('SplitB')
  await request('/v1/queue', { method: 'POST', body: JSON.stringify({ mode: 'ranked' }) }, a.token)
  const qb = await request('/v1/queue', { method: 'POST', body: JSON.stringify({ mode: 'ranked' }) }, b.token)
  const match = qb.body.match
  await request(`/v1/matches/${match.id}/ready`, { method: 'POST' }, a.token)
  await request(`/v1/matches/${match.id}/ready`, { method: 'POST' }, b.token)

  // Record an impossible 5s nether split.
  app.store.db.prepare('UPDATE matches SET starts_at = ? WHERE id = ?').run(Date.now() - 5000, match.id)
  await request(`/v1/matches/${match.id}/progress`, { method: 'POST', body: JSON.stringify({ progress: 'nether' }) }, a.token)
  // Advance past the finish floor, reach the end, then a finish is rejected on the bad split.
  app.store.db.prepare('UPDATE matches SET starts_at = ? WHERE id = ?').run(Date.now() - 130_000, match.id)
  await request(`/v1/matches/${match.id}/progress`, { method: 'POST', body: JSON.stringify({ progress: 'end' }) }, a.token)
  const res = await request(`/v1/matches/${match.id}/finish`, { method: 'POST' }, a.token)
  assert.equal(res.status, 400)
  assert.match(res.body.error, /nether/)
})

test('a new season soft-resets ratings and bumps the season label', async () => {
  const p = await verified('SeasonPlayer')
  app.store.db.prepare('UPDATE players SET rating = 1200, wins = 5, losses = 3 WHERE id = ?').run(p.player.id)
  const before = app.store.season()
  const next = app.store.startNewSeason()
  assert.equal(next, before + 1)
  // Rating is compressed halfway to 1000; record is cleared for the new season.
  const prof = await request('/v1/profile', {}, p.token)
  assert.equal(prof.body.player.rating, 1100)
  assert.equal(prof.body.player.wins, 0)
  assert.equal(prof.body.player.losses, 0)
  const q = await request('/v1/queue', {}, p.token)
  assert.equal(q.body.season, next)
})
