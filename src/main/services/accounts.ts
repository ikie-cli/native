import { EventEmitter } from 'node:events'
import type Database from 'better-sqlite3'
import type { AccountInfo, AuthFlowState } from '@shared/types'
import type { LaunchAccount } from '../core/args'
import { offlineUuid, validOfflineName } from './auth'
import type { MsaSession, MsmcClient } from './msmc'
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

/** What we persist per MSA account (msmc's saved MCToken + session cache). */
interface StoredMsa {
  session: Pick<MsaSession, 'mcToken' | 'xuid' | 'exp'>
  saved: MsaSession['saved']
}

export class AccountsService extends EventEmitter {
  private loginInFlight = false

  constructor(
    private db: Database.Database,
    private crypto: TokenCrypto,
    private msmc: MsmcClient
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
    // The msmc popup window is dismissed by the user; closing it rejects the
    // login promise. Nothing extra to signal here.
  }

  /**
   * Interactive Microsoft sign-in through msmc's popup window. No client ID
   * setup required — msmc uses the official launcher's public OAuth client.
   * Emits `flow` AuthFlowState events for the UI.
   */
  async beginMsaFlow(): Promise<AccountInfo> {
    if (this.loginInFlight) throw new Error('A sign-in window is already open')
    this.loginInFlight = true
    try {
      this.emit('flow', { step: 'browser' } satisfies AuthFlowState)
      const session = await this.msmc.login((state) => {
        if (state === 'minecraft') this.emit('flow', { step: 'minecraft' } satisfies AuthFlowState)
        if (state === 'profile') this.emit('flow', { step: 'profile' } satisfies AuthFlowState)
      })
      if (session.demo) {
        throw new Error(
          'This Microsoft account does not own Minecraft: Java Edition. Native requires game ownership — Xbox Game Pass users must sign in to the official launcher once first.'
        )
      }
      const account = this.persistSession(session)
      this.emit('flow', { step: 'done', account } satisfies AuthFlowState)
      log.info(`[auth] signed in as ${account.username}`)
      return account
    } catch (err) {
      const msg = humanizeMsmcError(err)
      this.emit('flow', { step: 'error', error: msg } satisfies AuthFlowState)
      throw new Error(msg)
    } finally {
      this.loginInFlight = false
    }
  }

  /**
   * Launch credentials for the active account. MSA tokens are refreshed
   * transparently via msmc when expired.
   */
  async launchAccount(): Promise<LaunchAccount> {
    const row = this.db.prepare('SELECT * FROM accounts WHERE active = 1').get() as
      | AccountRow
      | undefined
    if (!row) throw new Error('No account selected — add one in the Accounts menu')
    if (row.type === 'offline') {
      return { name: row.username, uuid: row.uuid, accessToken: 'offline', type: 'offline' }
    }
    const stored = this.readStored(row)
    // Fresh enough → use as-is (60s safety margin; msmc exp is epoch ms).
    if (stored.session.exp > Date.now() + 60_000) {
      return {
        name: row.username,
        uuid: row.uuid,
        accessToken: stored.session.mcToken,
        type: 'msa',
        xuid: stored.session.xuid
      }
    }
    log.info(`[auth] refreshing tokens for ${row.username}`)
    let session: MsaSession
    try {
      session = await this.msmc.refresh(stored.saved)
    } catch (err) {
      throw new Error(
        `Session expired — please sign in again (${humanizeMsmcError(err)})`
      )
    }
    this.persistSession(session)
    return {
      name: session.profile.name,
      uuid: session.profile.id,
      accessToken: session.mcToken,
      type: 'msa',
      xuid: session.xuid
    }
  }

  private persistSession(session: MsaSession): AccountInfo {
    const stored: StoredMsa = {
      session: { mcToken: session.mcToken, xuid: session.xuid, exp: session.exp },
      saved: session.saved
    }
    const now = Date.now()
    this.db
      .prepare(
        `INSERT INTO accounts (id, type, username, uuid, active, added_at, tokens_enc)
         VALUES (?, 'msa', ?, ?, 0, ?, ?)
         ON CONFLICT(id) DO UPDATE SET username = excluded.username, tokens_enc = excluded.tokens_enc, type = 'msa'`
      )
      .run(
        session.profile.id,
        session.profile.name,
        session.profile.id,
        now,
        this.crypto.encrypt(JSON.stringify(stored))
      )
    if (!this.active()) this.setActive(session.profile.id)
    else this.setActive(session.profile.id)
    this.emit('changed', this.list())
    return this.list().find((a) => a.id === session.profile.id)!
  }

  private readStored(row: AccountRow): StoredMsa {
    if (!row.tokens_enc) throw new Error('Session data missing — sign in again')
    try {
      return JSON.parse(this.crypto.decrypt(row.tokens_enc)) as StoredMsa
    } catch {
      throw new Error('Stored session is unreadable — sign in again')
    }
  }
}

/** msmc rejects with lexicon codes (e.g. "error.gui.closed") or Errors. */
export function humanizeMsmcError(err: unknown): string {
  const raw =
    typeof err === 'string' ? err : err instanceof Error ? err.message : JSON.stringify(err)
  const map: Record<string, string> = {
    'error.gui.closed': 'The sign-in window was closed before finishing.',
    'error.gui.raw.noBrowser': 'No browser was available for sign-in.',
    'error.auth.microsoft': 'Microsoft sign-in failed — try again.',
    'error.auth.xboxLive': 'Xbox Live sign-in failed. Does this account have an Xbox profile?',
    'error.auth.xsts': 'Xbox security check failed.',
    'error.auth.xsts.userNotFound': 'This Microsoft account has no Xbox profile — create one first.',
    'error.auth.xsts.child': 'Child accounts must be added to a family by an adult.',
    'error.auth.xsts.child.SK': 'Child accounts must be added to a family by an adult.',
    'error.auth.xsts.banned': 'This account is banned from Xbox Live.',
    'error.auth.minecraft': 'Minecraft services sign-in failed.',
    'error.auth.minecraft.login': 'Minecraft services sign-in failed.',
    'error.auth.minecraft.profile':
      'This account owns the game but has no Minecraft profile — create one in the official launcher first.',
    'error.auth.minecraft.entitlements':
      'This Microsoft account does not own Minecraft: Java Edition.'
  }
  // Longest code first so specific variants win over their prefixes
  // (e.g. error.auth.xsts.userNotFound before error.auth.xsts).
  for (const [code, msg] of Object.entries(map).sort((a, b) => b[0].length - a[0].length)) {
    if (raw.includes(code)) return msg
  }
  return raw
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
