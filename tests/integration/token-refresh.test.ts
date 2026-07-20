import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDbAt } from '../../src/main/db'
import { AccountsService, plainTokenCrypto } from '../../src/main/services/accounts'
import type { MsaTokens } from '../../src/main/services/auth'
import { startFixtureServer, type Fixture } from './helpers/fixture-server'

let dir: string
let db: Database.Database
let fx: Fixture

function jsonRoute(fx: Fixture, path: string, body: unknown): void {
  fx.add(path, JSON.stringify(body), { contentType: 'application/json' })
}

/** Point the whole MSA → XBL → XSTS → MC chain at the fixture server. */
function wireAuthEndpoints(base: string): void {
  process.env.NATIVE_URL_MSA_TOKEN = `${base}/msa/token`
  process.env.NATIVE_URL_XBL = `${base}/xbl`
  process.env.NATIVE_URL_XSTS = `${base}/xsts`
  process.env.NATIVE_URL_MC_SERVICES = `${base}/mc`
}

function seedMsaAccount(db: Database.Database, tokens: MsaTokens): void {
  db.prepare(
    `INSERT INTO accounts (id, type, username, uuid, active, added_at, tokens_enc)
     VALUES ('uuid-1', 'msa', 'Steve', 'uuid-1', 1, ?, ?)`
  ).run(Date.now(), plainTokenCrypto.encrypt(JSON.stringify(tokens)))
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'native-auth-'))
  process.env.NATIVE_DATA_DIR = dir
  db = openDbAt(join(dir, 'test.db'))
  fx = await startFixtureServer()
  wireAuthEndpoints(fx.baseUrl)
})

afterEach(async () => {
  db.close()
  await fx.close()
  await rm(dir, { recursive: true, force: true })
  for (const k of ['NATIVE_URL_MSA_TOKEN', 'NATIVE_URL_XBL', 'NATIVE_URL_XSTS', 'NATIVE_URL_MC_SERVICES']) {
    delete process.env[k]
  }
})

describe('MSA token refresh', () => {
  it('uses stored tokens untouched while still valid', async () => {
    const svc = new AccountsService(db, plainTokenCrypto, () => 'client-123')
    seedMsaAccount(db, {
      msRefreshToken: 'refresh-A',
      mcAccessToken: 'mc-valid',
      mcExpiresAt: Date.now() + 3600_000,
      xuid: '999'
    })
    const la = await svc.launchAccount()
    expect(la.accessToken).toBe('mc-valid')
    expect(la.xuid).toBe('999')
    expect(fx.requests).toHaveLength(0) // zero network traffic
  })

  it('refreshes expired tokens through the full chain and persists the result', async () => {
    const svc = new AccountsService(db, plainTokenCrypto, () => 'client-123')
    seedMsaAccount(db, {
      msRefreshToken: 'refresh-A',
      mcAccessToken: 'mc-stale',
      mcExpiresAt: Date.now() - 1000,
      xuid: '999'
    })
    jsonRoute(fx, '/msa/token', {
      token_type: 'Bearer',
      access_token: 'ms-fresh',
      refresh_token: 'refresh-B',
      expires_in: 3600
    })
    jsonRoute(fx, '/xbl', { Token: 'xbl-tok', DisplayClaims: { xui: [{ uhs: 'hash1' }] } })
    jsonRoute(fx, '/xsts', {
      Token: 'xsts-tok',
      DisplayClaims: { xui: [{ uhs: 'hash1', xid: '424242' }] }
    })
    jsonRoute(fx, '/mc/authentication/login_with_xbox', {
      access_token: 'mc-fresh',
      expires_in: 86400
    })

    const la = await svc.launchAccount()
    expect(la.accessToken).toBe('mc-fresh')
    expect(la.xuid).toBe('424242')
    expect(fx.requests.map((r) => r.path)).toEqual([
      '/msa/token',
      '/xbl',
      '/xsts',
      '/mc/authentication/login_with_xbox'
    ])

    // Persisted: a second call needs no network.
    fx.requests.length = 0
    const again = await svc.launchAccount()
    expect(again.accessToken).toBe('mc-fresh')
    expect(fx.requests).toHaveLength(0)

    // The rotated MS refresh token was saved.
    const row = db.prepare('SELECT tokens_enc FROM accounts WHERE id = ?').get('uuid-1') as {
      tokens_enc: Buffer
    }
    const saved = JSON.parse(plainTokenCrypto.decrypt(row.tokens_enc)) as MsaTokens
    expect(saved.msRefreshToken).toBe('refresh-B')
  })

  it('surfaces an expired session when the refresh token is rejected', async () => {
    const svc = new AccountsService(db, plainTokenCrypto, () => 'client-123')
    seedMsaAccount(db, {
      msRefreshToken: 'revoked',
      mcAccessToken: 'mc-stale',
      mcExpiresAt: 0,
      xuid: ''
    })
    jsonRoute(fx, '/msa/token', {
      error: 'invalid_grant',
      error_description: 'AADSTS70000: refresh token revoked'
    })
    await expect(svc.launchAccount()).rejects.toThrow(/refresh token revoked|sign in again/i)
  })

  it('fails cleanly when no client id is configured', async () => {
    const svc = new AccountsService(db, plainTokenCrypto, () => null)
    seedMsaAccount(db, {
      msRefreshToken: 'refresh-A',
      mcAccessToken: 'stale',
      mcExpiresAt: 0,
      xuid: ''
    })
    await expect(svc.launchAccount()).rejects.toThrow(/client ID/i)
  })
})
