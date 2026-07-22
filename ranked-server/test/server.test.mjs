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

  // Move the test clock past the five-second countdown without sleeping.
  app.store.db.prepare('UPDATE matches SET starts_at = ? WHERE id = ?').run(Date.now() - 1200, match.id)
  await request(`/v1/matches/${match.id}/progress`, {
    method: 'POST', body: JSON.stringify({ progress: 'nether' })
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
