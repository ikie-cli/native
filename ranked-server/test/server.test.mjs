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
  const qb = await request('/v1/queue', { method: 'POST', body: JSON.stringify({ mode: 'ranked' }) }, b.token)
  assert.equal(qb.body.state, 'matched')
  const match = qb.body.match
  assert.equal(match.players.length, 2)
  assert.match(match.seed, /^-?\d+$/)

  await request(`/v1/matches/${match.id}/ready`, { method: 'POST' }, a.token)
  const ready = await request(`/v1/matches/${match.id}/ready`, { method: 'POST' }, b.token)
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

  const pa = await request('/v1/profile', {}, a.token)
  const pb = await request('/v1/profile', {}, b.token)
  assert.equal(pa.body.player.wins, 1)
  assert.equal(pb.body.player.losses, 1)
  assert.equal(pa.body.player.rating, 1016)
  assert.equal(pb.body.player.rating, 984)
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
