import { Socket } from 'node:net'
import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import type { ServerEntry, ServerStatus } from '@shared/types'

/**
 * Server List Ping (SLP) implementation — handshake + status request over TCP
 * with VarInt framing. Works with every modern server (1.7+).
 */

export function writeVarInt(value: number): Buffer {
  const bytes: number[] = []
  let v = value >>> 0
  do {
    let temp = v & 0x7f
    v >>>= 7
    if (v !== 0) temp |= 0x80
    bytes.push(temp)
  } while (v !== 0)
  return Buffer.from(bytes)
}

export function readVarInt(buf: Buffer, offset: number): { value: number; size: number } {
  let result = 0
  let size = 0
  for (;;) {
    if (offset + size >= buf.length) throw new RangeError('varint out of bounds')
    const byte = buf[offset + size]
    result |= (byte & 0x7f) << (7 * size)
    size++
    if ((byte & 0x80) === 0) break
    if (size > 5) throw new RangeError('varint too long')
  }
  return { value: result, size }
}

function packet(id: number, payload: Buffer): Buffer {
  const body = Buffer.concat([writeVarInt(id), payload])
  return Buffer.concat([writeVarInt(body.length), body])
}

export function parseAddress(address: string): { host: string; port: number } {
  const trimmed = address.trim()
  const m = trimmed.match(/^\[?([^\]]+?)\]?(?::(\d{1,5}))?$/)
  const host = m?.[1] ?? trimmed
  const port = m?.[2] ? parseInt(m[2], 10) : 25565
  if (port < 1 || port > 65535) throw new Error('Invalid port')
  return { host, port }
}

/** Strip § formatting codes and normalize chat-component MOTDs to text. */
export function motdToText(desc: unknown): string {
  if (desc == null) return ''
  if (typeof desc === 'string') return desc.replace(/§[0-9a-fk-orx]/gi, '')
  if (typeof desc === 'object') {
    const d = desc as { text?: string; extra?: unknown[] }
    const parts: string[] = []
    if (d.text) parts.push(d.text)
    if (Array.isArray(d.extra)) parts.push(...d.extra.map((e) => motdToText(e)))
    return parts.join('').replace(/§[0-9a-fk-orx]/gi, '')
  }
  return ''
}

export function pingServer(address: string, timeoutMs = 5000): Promise<ServerStatus> {
  let host: string, port: number
  try {
    ;({ host, port } = parseAddress(address))
  } catch (err) {
    return Promise.resolve({
      online: false,
      latencyMs: null,
      motd: null,
      players: null,
      version: null,
      favicon: null,
      error: err instanceof Error ? err.message : 'Invalid address'
    })
  }
  return new Promise((resolve) => {
    const socket = new Socket()
    const started = Date.now()
    let latency: number | null = null
    let buf = Buffer.alloc(0)
    let done = false

    const finish = (status: ServerStatus): void => {
      if (done) return
      done = true
      socket.destroy()
      resolve(status)
    }
    const fail = (error: string): void =>
      finish({
        online: false,
        latencyMs: null,
        motd: null,
        players: null,
        version: null,
        favicon: null,
        error
      })

    const timer = setTimeout(() => fail('Timed out'), timeoutMs)
    socket.once('error', (err) => {
      clearTimeout(timer)
      fail(err.message)
    })

    socket.connect(port, host, () => {
      latency = Date.now() - started
      const hostBuf = Buffer.from(host, 'utf8')
      const payload = Buffer.concat([
        writeVarInt(-1 >>> 0), // protocol -1 (status)
        writeVarInt(hostBuf.length),
        hostBuf,
        Buffer.from([(port >> 8) & 0xff, port & 0xff]),
        writeVarInt(1) // next state: status
      ])
      socket.write(packet(0x00, payload)) // handshake
      socket.write(packet(0x00, Buffer.alloc(0))) // status request
    })

    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk])
      try {
        const len = readVarInt(buf, 0)
        if (buf.length < len.size + len.value) return // wait for more
        let off = len.size
        const pid = readVarInt(buf, off)
        off += pid.size
        if (pid.value !== 0x00) return fail(`Unexpected packet 0x${pid.value.toString(16)}`)
        const strLen = readVarInt(buf, off)
        off += strLen.size
        const jsonStr = buf.subarray(off, off + strLen.value).toString('utf8')
        clearTimeout(timer)
        const data = JSON.parse(jsonStr) as {
          description?: unknown
          players?: { online: number; max: number }
          version?: { name: string }
          favicon?: string
        }
        finish({
          online: true,
          latencyMs: latency,
          motd: motdToText(data.description).trim() || null,
          players: data.players ? { online: data.players.online, max: data.players.max } : null,
          version: data.version?.name ?? null,
          favicon: data.favicon ?? null
        })
      } catch (err) {
        if (err instanceof RangeError) return // need more bytes
        clearTimeout(timer)
        fail('Malformed response')
      }
    })
  })
}

interface ServerRow {
  id: string
  name: string
  address: string
  instance_id: string | null
  added_at: number
  sort_index: number
  last_played_at: number | null
  total_play_ms: number
  play_count: number
  detected: number
}

export class ServersService {
  constructor(private db: Database.Database) {
    // A power loss can leave an open row behind. Do not count offline time on
    // the next connection; preserve the attempt as a zero-duration session.
    this.db
      .prepare('UPDATE server_playtime_sessions SET ended_at = started_at WHERE ended_at IS NULL')
      .run()
  }

  list(): ServerEntry[] {
    const rows = this.db
      .prepare('SELECT * FROM servers ORDER BY sort_index ASC, added_at ASC')
      .all() as ServerRow[]
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      address: r.address,
      instanceId: r.instance_id,
      addedAt: r.added_at,
      sortIndex: r.sort_index,
      lastPlayedAt: r.last_played_at,
      totalPlayMs: r.total_play_ms,
      playCount: r.play_count,
      detected: r.detected === 1
    }))
  }

  add(name: string, address: string, instanceId: string | null): ServerEntry {
    if (!name.trim()) throw new Error('Server name is required')
    parseAddress(address) // validates
    const id = randomUUID()
    const max = (this.db.prepare('SELECT MAX(sort_index) as m FROM servers').get() as { m: number | null }).m ?? -1
    this.db
      .prepare(
        'INSERT INTO servers (id, name, address, instance_id, added_at, sort_index) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(id, name.trim(), address.trim(), instanceId, Date.now(), max + 1)
    return this.list().find((s) => s.id === id)!
  }

  /** Start a detected multiplayer session, automatically remembering new servers. */
  beginSession(address: string, instanceId: string, startedAt = Date.now()): ServerEntry {
    const normalized = normalizeAddress(address)
    const tx = this.db.transaction(() => {
      this.finishActiveSessions(instanceId, startedAt)

      let entry = this.list().find((s) => normalizeAddress(s.address) === normalized)
      if (!entry) {
        const { host } = parseAddress(normalized)
        entry = this.add(host, normalized, instanceId)
        this.db.prepare('UPDATE servers SET detected = 1 WHERE id = ?').run(entry.id)
      } else if (!entry.instanceId) {
        this.db.prepare('UPDATE servers SET instance_id = ? WHERE id = ?').run(instanceId, entry.id)
      }

      this.db
        .prepare(
          `INSERT INTO server_playtime_sessions (server_id, instance_id, started_at, ended_at)
           VALUES (?, ?, ?, NULL)`
        )
        .run(entry.id, instanceId, startedAt)
      this.db
        .prepare(
          `UPDATE servers
           SET last_played_at = ?, play_count = play_count + 1
           WHERE id = ?`
        )
        .run(startedAt, entry.id)
      return entry.id
    })
    const id = tx()
    return this.list().find((s) => s.id === id)!
  }

  /** Finish the current detected multiplayer session for an instance. */
  endSession(instanceId: string, endedAt = Date.now()): ServerEntry | null {
    const tx = this.db.transaction(() => this.finishActiveSessions(instanceId, endedAt))
    const serverId = tx()
    return serverId ? (this.list().find((s) => s.id === serverId) ?? null) : null
  }

  private finishActiveSessions(instanceId: string, endedAt: number): string | null {
    const rows = this.db
      .prepare(
        `SELECT id, server_id, started_at
         FROM server_playtime_sessions
         WHERE instance_id = ? AND ended_at IS NULL
         ORDER BY started_at DESC`
      )
      .all(instanceId) as { id: number; server_id: string; started_at: number }[]
    if (rows.length === 0) return null

    for (const row of rows) {
      const safeEnd = Math.max(row.started_at, endedAt)
      const duration = safeEnd - row.started_at
      this.db
        .prepare('UPDATE server_playtime_sessions SET ended_at = ? WHERE id = ?')
        .run(safeEnd, row.id)
      this.db
        .prepare(
          `UPDATE servers
           SET last_played_at = MAX(COALESCE(last_played_at, 0), ?),
               total_play_ms = total_play_ms + ?
           WHERE id = ?`
        )
        .run(safeEnd, duration, row.server_id)
    }
    return rows[0].server_id
  }

  update(id: string, patch: Partial<Pick<ServerEntry, 'name' | 'address' | 'instanceId'>>): void {
    const cur = this.db.prepare('SELECT * FROM servers WHERE id = ?').get(id) as ServerRow | undefined
    if (!cur) throw new Error('Server not found')
    if (patch.address) parseAddress(patch.address)
    this.db
      .prepare('UPDATE servers SET name = ?, address = ?, instance_id = ? WHERE id = ?')
      .run(
        patch.name?.trim() ?? cur.name,
        patch.address?.trim() ?? cur.address,
        patch.instanceId === undefined ? cur.instance_id : patch.instanceId,
        id
      )
  }

  remove(id: string): void {
    this.db.prepare('DELETE FROM servers WHERE id = ?').run(id)
  }
}

/** Canonical display/storage form so `host` and `host:25565` deduplicate. */
export function normalizeAddress(address: string): string {
  const { host, port } = parseAddress(address)
  const cleanHost = host.replace(/^\[|\]$/g, '').toLowerCase()
  const renderedHost = cleanHost.includes(':') ? `[${cleanHost}]` : cleanHost
  return port === 25565 ? renderedHost : `${renderedHost}:${port}`
}
