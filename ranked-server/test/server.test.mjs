import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { once } from 'node:events'
import { createRankedServer } from '../src/server.mjs'

let app
let base

before(async () => {
  app = createRankedServer()
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

async function player(profileId, username, deviceId) {
  const res = await request('/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify({ profileId, username, deviceId })
  })
  assert.equal(res.status, 201)
  return res.body
}

test('health and unauthenticated leaderboard are public', async () => {
  assert.equal((await request('/health')).body.ok, true)
  assert.deepEqual((await request('/v1/leaderboard')).body.players, [])
})

test('matches two offline profiles on the same seed and applies Elo', async () => {
  const a = await player('offline-a', 'RunnerOne', 'a'.repeat(32))
  const b = await player('offline-b', 'RunnerTwo', 'b'.repeat(32))
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

test('rejects implausible finishes (anti-cheat)', async () => {
  const a = await player('cheat-a', 'CheatOne', 'c'.repeat(32))
  const b = await player('cheat-b', 'CheatTwo', 'd'.repeat(32))
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
  const p = await player('pub-a', 'PublicOne', 'e'.repeat(32))
  const res = await request(`/v1/players/${p.player.id}`)
  assert.equal(res.status, 200)
  assert.equal(res.body.player.username, 'PublicOne')
  assert.ok(Array.isArray(res.body.history))
  assert.equal((await request('/v1/players/does-not-exist')).status, 404)
})
