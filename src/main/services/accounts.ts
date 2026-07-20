import { EventEmitter } from 'node:events'
import type Database from 'better-sqlite3'
import type { AccountInfo, AuthFlowState } from '@shared/types'
import type { LaunchAccount } from '../core/args'
import {
  AuthError,
  checkEntitlement,
  fetchProfile,
  msTokenToMinecraft,
  offlineUuid,
  pollDeviceToken,
  refreshMsToken,
  requestDeviceCode,
  validOfflineName,
  type MsaTokens
} from './auth'
import { log } from '../logger'

/** Encrypt/decrypt hooks — Electron safeStorage in prod, identity in tests. */
export interface TokenCrypto {
  encrypt: (plain: string) => Buffer
  decrypt: (blob: Buffer) => string
}

export const plainTokenCrypto: TokenCrypto = {
  encrypt: (p) => Buffer.from(`plain:${p}`, 'utf-8'),
  decrypt: (b) => {
    const s = b.toString('utf-8')
    return s.startsWith('plain:') ? s.slice(6) : s
  }
}

interface AccountRow {
  id: string
  type: 'msa' | 'offline'
  username: string
  uuid: string
  active: number
  added_at: number
  tokens_enc: Buffer | null
}

export class AccountsService extends EventEmitter {
  private flowCancelled = false

  constructor(
    private db: Database.Database,
    private crypto: TokenCrypto,
    private clientId: () => string | null
  ) {
    super()
  }

  list(): AccountInfo[] {
    const rows = this.db
      .prepare('SELECT * FROM accounts ORDER BY added_at ASC')
      .all() as AccountRow[]
    return rows.map(rowToInfo)
  }

  active(): AccountInfo | null {
    const row = this.db.prepare('SELECT * FROM accounts WHERE active = 1').get() as
      | AccountRow
      | undefined
    return row ? rowToInfo(row) : null
  }

  setActive(id: string): void {
    const tx = this.db.transaction(() => {
      this.db.prepare('UPDATE accounts SET active = 0').run()
      const r = this.db.prepare('UPDATE accounts SET active = 1 WHERE id = ?').run(id)
      if (r.changes === 0) throw new Error('Account not found')
    })
    tx()
    this.emit('changed', this.list())
  }

  remove(id: string): void {
    const wasActive = this.active()?.id === id
    this.db.prepare('DELETE FROM accounts WHERE id = ?').run(id)
    if (wasActive) {
      const first = this.list()[0]
      if (first) this.setActive(first.id)
    }
    this.emit('changed', this.list())
  }

  addOffline(username: string): AccountInfo {
    if (!validOfflineName(username)) {
      throw new Error('Usernames are 3–16 characters: letters, numbers, underscores')
    }
    const uuid = offlineUuid(username)
    const now = Date.now()
    this.db
      .prepare(
        `INSERT INTO accounts (id, type, username, uuid, active, added_at, tokens_enc)
         VALUES (?, 'offline', ?, ?, 0, ?, NULL)
         ON CONFLICT(id) DO UPDATE SET username = excluded.username`
      )
      .run(uuid, username, uuid, now)
    if (this.list().length === 1 || !this.active()) this.setActive(uuid)
    this.emit('changed', this.list())
    return this.list().find((a) => a.id === uuid)!
  }

  cancelMsaFlow(): void {
    this.flowCancelled = true
  }

  /**
   * Full device-code sign-in. Emits `flow` AuthFlowState events for the UI.
   */
  async beginMsaFlow(): Promise<AccountInfo> {
    const clientId = this.clientId()
    if (!clientId) {
      const err = new AuthError(
        'No Microsoft client ID configured. Set one in Settings → Accounts (an Azure app registration with public client flows enabled).',
        'client-id-missing'
      )
      this.emit('flow', { step: 'error', error: err.message } satisfies AuthFlowState)
      throw err
    }
    this.flowCancelled = false
    try {
      const { info, deviceCode } = await requestDeviceCode(clientId)
      this.emit('flow', { step: 'device-code', code: info } satisfies AuthFlowState)
      const token = await pollDeviceToken(
        clientId,
        deviceCode,
        info.expiresIn,
        info.interval,
        () => this.flowCancelled
      )
      this.emit('flow', { step: 'xbox' } satisfies AuthFlowState)
      const mc = await msTokenToMinecraft(token.access_token)
      this.emit('flow', { step: 'minecraft' } satisfies AuthFlowState)
      await checkEntitlement(mc.mcAccessToken)
      this.emit('flow', { step: 'profile' } satisfies AuthFlowState)
      const profile = await fetchProfile(mc.mcAccessToken)

      const tokens: MsaTokens = {
        msRefreshToken: token.refresh_token,
        mcAccessToken: mc.mcAccessToken,
        mcExpiresAt: mc.mcExpiresAt,
        xuid: mc.xuid
      }
      const now = Date.now()
      this.db
        .prepare(
          `INSERT INTO accounts (id, type, username, uuid, active, added_at, tokens_enc)
           VALUES (?, 'msa', ?, ?, 0, ?, ?)
           ON CONFLICT(id) DO UPDATE SET username = excluded.username, tokens_enc = excluded.tokens_enc, type = 'msa'`
        )
        .run(profile.id, profile.name, profile.id, now, this.crypto.encrypt(JSON.stringify(tokens)))
      this.setActive(profile.id)
      const account = this.list().find((a) => a.id === profile.id)!
      this.emit('flow', { step: 'done', account } satisfies AuthFlowState)
      log.info(`[auth] signed in as ${profile.name}`)
      return account
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.emit('flow', { step: 'error', error: msg } satisfies AuthFlowState)
      throw err
    }
  }

  /**
   * Launch credentials for the active account. MSA tokens are refreshed
   * transparently when expired (refresh token → xbox chain → new mc token).
   */
  async launchAccount(): Promise<LaunchAccount> {
    const row = this.db.prepare('SELECT * FROM accounts WHERE active = 1').get() as
      | AccountRow
      | undefined
    if (!row) throw new Error('No account selected — add one in the Accounts menu')
    if (row.type === 'offline') {
      return {
        name: row.username,
        uuid: row.uuid,
        accessToken: 'offline',
        type: 'offline'
      }
    }
    const tokens = await this.freshTokens(row)
    return {
      name: row.username,
      uuid: row.uuid,
      accessToken: tokens.mcAccessToken,
      type: 'msa',
      xuid: tokens.xuid,
      clientId: this.clientId() ?? undefined
    }
  }

  private async freshTokens(row: AccountRow): Promise<MsaTokens> {
    if (!row.tokens_enc) throw new AuthError('Session data missing — sign in again', 'expired')
    let tokens: MsaTokens
    try {
      tokens = JSON.parse(this.crypto.decrypt(row.tokens_enc)) as MsaTokens
    } catch {
      throw new AuthError('Stored session is unreadable — sign in again', 'expired')
    }
    if (tokens.mcExpiresAt > Date.now() + 60_000) return tokens

    const clientId = this.clientId()
    if (!clientId) throw new AuthError('No Microsoft client ID configured', 'client-id-missing')
    log.info(`[auth] refreshing tokens for ${row.username}`)
    const refreshed = await refreshMsToken(clientId, tokens.msRefreshToken)
    const mc = await msTokenToMinecraft(refreshed.access_token)
    const next: MsaTokens = {
      msRefreshToken: refreshed.refresh_token ?? tokens.msRefreshToken,
      mcAccessToken: mc.mcAccessToken,
      mcExpiresAt: mc.mcExpiresAt,
      xuid: mc.xuid
    }
    this.db
      .prepare('UPDATE accounts SET tokens_enc = ? WHERE id = ?')
      .run(this.crypto.encrypt(JSON.stringify(next)), row.id)
    return next
  }
}

function rowToInfo(r: AccountRow): AccountInfo {
  return {
    id: r.id,
    type: r.type,
    username: r.username,
    uuid: r.uuid,
    active: r.active === 1,
    addedAt: r.added_at
  }
}
