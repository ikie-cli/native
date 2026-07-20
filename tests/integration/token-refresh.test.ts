import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDbAt } from '../../src/main/db'
import { AccountsService, humanizeMsmcError, plainTokenCrypto } from '../../src/main/services/accounts'
import type { MsaSession, MsmcClient } from '../../src/main/services/msmc'

let dir: string
let db: Database.Database

function session(overrides: Partial<MsaSession> = {}): MsaSession {
  return {
    profile: { id: 'uuid-1', name: 'Steve' },
    xuid: '999',
    mcToken: 'mc-valid',
    exp: Date.now() + 3600_000,
    demo: false,
    saved: { mcToken: 'mc-valid', refresh: 'refresh-A', exp: Date.now() + 3600_000 } as never,
    ...overrides
  }
}

function client(overrides: Partial<MsmcClient> = {}): MsmcClient {
  return {
    login: vi.fn(async () => session()),
    refresh: vi.fn(async () => session()),
    ...overrides
  }
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'native-auth-'))
  process.env.NATIVE_DATA_DIR = dir
  db = openDbAt(join(dir, 'test.db'))
})

afterEach(async () => {
  db.close()
  await rm(dir, { recursive: true, force: true })
})

describe('MSA sign-in through msmc', () => {
  it('persists the session and activates the account', async () => {
    const c = client()
    const svc = new AccountsService(db, plainTokenCrypto, c)
    const states: string[] = []
    svc.on('flow', (f: { step: string }) => states.push(f.step))

    const account = await svc.beginMsaFlow()
    expect(account.username).toBe('Steve')
    expect(account.type).toBe('msa')
    expect(account.active).toBe(true)
    expect(states).toEqual(['browser', 'done'])
    expect(c.login).toHaveBeenCalledOnce()

    // tokens are stored encrypted
    const row = db.prepare('SELECT tokens_enc FROM accounts WHERE id = ?').get('uuid-1') as {
      tokens_enc: Buffer
    }
    const stored = JSON.parse(plainTokenCrypto.decrypt(row.tokens_enc))
    expect(stored.session.mcToken).toBe('mc-valid')
    expect(stored.saved.refresh).toBe('refresh-A')
  })

  it('rejects demo accounts (no game ownership)', async () => {
    const svc = new AccountsService(
      db,
      plainTokenCrypto,
      client({ login: vi.fn(async () => session({ demo: true })) })
    )
    await expect(svc.beginMsaFlow()).rejects.toThrow(/does not own Minecraft/)
    expect(svc.list()).toHaveLength(0)
  })

  it('emits a human error when the sign-in window is closed', async () => {
    const svc = new AccountsService(
      db,
      plainTokenCrypto,
      client({ login: vi.fn(async () => Promise.reject('error.gui.closed')) })
    )
    let flowError = ''
    svc.on('flow', (f: { step: string; error?: string }) => {
      if (f.step === 'error') flowError = f.error!
    })
    await expect(svc.beginMsaFlow()).rejects.toThrow(/window was closed/)
    expect(flowError).toMatch(/window was closed/)
  })
})

describe('MSA token refresh', () => {
  it('uses stored tokens untouched while still valid', async () => {
    const c = client()
    const svc = new AccountsService(db, plainTokenCrypto, c)
    await svc.beginMsaFlow()

    const la = await svc.launchAccount()
    expect(la.accessToken).toBe('mc-valid')
    expect(la.xuid).toBe('999')
    expect(la.type).toBe('msa')
    expect(c.refresh).not.toHaveBeenCalled()
  })

  it('refreshes expired tokens through msmc and persists the result', async () => {
    const c = client({
      login: vi.fn(async () => session({ mcToken: 'mc-stale', exp: Date.now() - 1000 })),
      refresh: vi.fn(async () =>
        session({
          mcToken: 'mc-fresh',
          exp: Date.now() + 86_400_000,
          saved: { refresh: 'refresh-B' } as never
        })
      )
    })
    const svc = new AccountsService(db, plainTokenCrypto, c)
    await svc.beginMsaFlow()

    const la = await svc.launchAccount()
    expect(la.accessToken).toBe('mc-fresh')
    expect(c.refresh).toHaveBeenCalledOnce()

    // Persisted: a second call needs no further refresh.
    await svc.launchAccount()
    expect(c.refresh).toHaveBeenCalledOnce()

    const row = db.prepare('SELECT tokens_enc FROM accounts WHERE id = ?').get('uuid-1') as {
      tokens_enc: Buffer
    }
    const stored = JSON.parse(plainTokenCrypto.decrypt(row.tokens_enc))
    expect(stored.saved.refresh).toBe('refresh-B')
  })

  it('surfaces an expired session when the refresh is rejected', async () => {
    const c = client({
      login: vi.fn(async () => session({ exp: 0 })),
      refresh: vi.fn(async () => Promise.reject('error.auth.microsoft'))
    })
    const svc = new AccountsService(db, plainTokenCrypto, c)
    await svc.beginMsaFlow()
    await expect(svc.launchAccount()).rejects.toThrow(/sign in again/i)
  })

  it('offline accounts never touch the network', async () => {
    const c = client()
    const svc = new AccountsService(db, plainTokenCrypto, c)
    svc.addOffline('Herobrine')
    const la = await svc.launchAccount()
    expect(la.type).toBe('offline')
    expect(la.accessToken).toBe('offline')
    expect(c.login).not.toHaveBeenCalled()
    expect(c.refresh).not.toHaveBeenCalled()
  })
})

describe('humanizeMsmcError', () => {
  it('maps msmc lexicon codes to sentences', () => {
    expect(humanizeMsmcError('error.gui.closed')).toMatch(/window was closed/)
    expect(humanizeMsmcError('error.auth.xsts.userNotFound')).toMatch(/no Xbox profile/)
    expect(humanizeMsmcError(new Error('error.auth.minecraft.profile'))).toMatch(
      /no Minecraft profile/
    )
  })

  it('passes through unknown messages', () => {
    expect(humanizeMsmcError(new Error('something odd'))).toBe('something odd')
  })
})
