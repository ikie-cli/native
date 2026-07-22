import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join } from 'node:path'
import { RankedStore } from './store.mjs'

function json(res, status, body) {
  const data = Buffer.from(JSON.stringify(body))
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': data.length,
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS'
  })
  res.end(data)
}

async function body(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > 32_768) throw new Error('Request too large')
    chunks.push(chunk)
  }
  if (size === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function bearer(req) {
  const value = req.headers.authorization ?? ''
  return value.startsWith('Bearer ') ? value.slice(7) : ''
}

export function createRankedServer(options = {}) {
  const store = options.store ?? new RankedStore(options.dbFile)
  const artifacts = options.artifactDir ?? null
  const requests = new Map()
  const server = createServer(async (req, res) => {
    if (req.method === 'OPTIONS') return json(res, 204, {})
    const ip = req.socket.remoteAddress ?? 'unknown'
    const now = Date.now()
    const recent = (requests.get(ip) ?? []).filter((t) => t > now - 10_000)
    recent.push(now)
    requests.set(ip, recent)
    if (recent.length > 120) return json(res, 429, { error: 'Slow down' })

    const url = new URL(req.url ?? '/', 'http://native.local')
    try {
      if (req.method === 'GET' && url.pathname === '/health') {
        return json(res, 200, { ok: true, service: 'native-ranked', version: '0.1.0', ...store.stats() })
      }
      if (req.method === 'POST' && url.pathname === '/v1/auth/register') {
        const input = await body(req)
        return json(res, 201, store.register(String(input.profileId ?? ''), String(input.username ?? ''), String(input.deviceId ?? '')))
      }
      if (req.method === 'GET' && url.pathname === '/v1/leaderboard') {
        return json(res, 200, { players: store.leaderboard(Number(url.searchParams.get('limit') ?? 50)) })
      }
      if ((req.method === 'GET' || req.method === 'HEAD') && url.pathname.startsWith('/artifacts/') && artifacts) {
        const name = url.pathname.slice('/artifacts/'.length)
        if (!/^[a-zA-Z0-9._-]+$/.test(name)) return json(res, 400, { error: 'Invalid artifact name' })
        const file = join(artifacts, name)
        if (!existsSync(file) || !statSync(file).isFile()) return json(res, 404, { error: 'Artifact not found' })
        const type = extname(file) === '.jar' ? 'application/java-archive' : 'application/octet-stream'
        res.writeHead(200, { 'content-type': type, 'content-length': statSync(file).size, 'cache-control': 'public, max-age=300' })
        if (req.method === 'HEAD') return res.end()
        return createReadStream(file).pipe(res)
      }

      const player = store.authenticate(bearer(req))
      if (!player) return json(res, 401, { error: 'Invalid Native Ranked token' })
      if (req.method === 'GET' && url.pathname === '/v1/profile') {
        return json(res, 200, { player: store.profile(player.id), history: store.history(player.id) })
      }
      if (req.method === 'POST' && url.pathname === '/v1/queue') {
        const input = await body(req)
        return json(res, 200, store.joinQueue(player.id, String(input.mode ?? 'ranked')))
      }
      if (req.method === 'GET' && url.pathname === '/v1/queue') {
        return json(res, 200, store.queueState(player.id))
      }
      if (req.method === 'DELETE' && url.pathname === '/v1/queue') {
        store.leaveQueue(player.id)
        return json(res, 200, { state: 'idle' })
      }
      const matchRoute = url.pathname.match(/^\/v1\/matches\/([^/]+)(?:\/(ready|progress|finish|forfeit))?$/)
      if (matchRoute) {
        const [, matchId, action] = matchRoute
        if (req.method === 'GET' && !action) return json(res, 200, { match: store.match(matchId, player.id) })
        if (req.method === 'POST' && action === 'ready') return json(res, 200, { match: store.ready(matchId, player.id) })
        if (req.method === 'POST' && action === 'progress') {
          const input = await body(req)
          return json(res, 200, { match: store.progress(matchId, player.id, String(input.progress ?? '')) })
        }
        if (req.method === 'POST' && action === 'finish') return json(res, 200, { match: store.finish(matchId, player.id) })
        if (req.method === 'POST' && action === 'forfeit') return json(res, 200, { match: store.forfeit(matchId, player.id) })
      }
      return json(res, 404, { error: 'Not found' })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Request failed'
      const status = message.includes('not found') ? 404 : message.includes('Invalid') || message.includes('must') || message.includes('large') ? 400 : 500
      return json(res, status, { error: message })
    }
  })
  return { server, store }
}
