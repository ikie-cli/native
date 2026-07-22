import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpcMock = vi.hoisted(() => {
  let loginFailures = 0
  class FakeClient {
    readonly handlers = new Map<string, Array<() => void>>()
    readonly user = { setActivity: vi.fn(async () => ({})) }
    readonly login = vi.fn(async () => {
      if (loginFailures > 0) {
        loginFailures--
        throw new Error('Discord is closed')
      }
    })
    readonly destroy = vi.fn(async () => {})

    constructor(readonly options: { clientId: string }) {
      rpcMock.clients.push(this)
    }

    on(event: string, handler: () => void): void {
      this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler])
    }

    emit(event: string): void {
      for (const handler of this.handlers.get(event) ?? []) handler()
    }
  }

  return {
    clients: [] as FakeClient[],
    FakeClient,
    failNextLogin: () => (loginFailures += 1),
    reset: () => {
      loginFailures = 0
    }
  }
})

vi.mock('@xhayper/discord-rpc', () => ({ Client: rpcMock.FakeClient }))

import { DiscordRpc } from '../../src/main/services/discord'

async function flushPromises(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

const instance = {
  id: 'fabric',
  name: 'Fabric Friends',
  icon: 'builtin:cube',
  mcVersion: '1.21.4',
  loader: 'fabric' as const,
  loaderVersion: '0.16.9',
  installed: true,
  memMin: 512,
  memMax: 4096,
  javaPath: null,
  jvmArgs: '',
  gameWidth: null,
  gameHeight: null,
  fullscreen: false,
  group: null,
  lastPlayedAt: null,
  totalPlayMs: 0,
  createdAt: 1,
  notes: '',
  resolvedVersionId: null
}

describe('DiscordRpc', () => {
  beforeEach(() => {
    rpcMock.clients.length = 0
    rpcMock.reset()
    vi.useFakeTimers()
  })

  it('uses the Native Discord app and publishes idle/game presence', async () => {
    const rpc = new DiscordRpc()
    rpc.setEnabled(true)
    await flushPromises()

    expect(rpcMock.clients[0].options.clientId).toBe('1528357514326966303')
    expect(rpcMock.clients[0].user.setActivity).toHaveBeenCalledWith(
      expect.objectContaining({ state: 'In the launcher', largeImageKey: 'logo' })
    )

    rpc.set({ instance, startedAt: 1234 })
    await flushPromises()
    expect(rpcMock.clients[0].user.setActivity).toHaveBeenLastCalledWith(
      expect.objectContaining({
        details: 'Fabric Friends',
        state: 'Minecraft 1.21.4 · Fabric',
        startTimestamp: 1234
      })
    )
  })

  it('reconnects after Discord becomes available and stops retrying when disabled', async () => {
    const rpc = new DiscordRpc()
    rpcMock.failNextLogin()
    rpc.setEnabled(true)
    await flushPromises()

    expect(rpcMock.clients[0].destroy).toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(15_000)
    expect(rpcMock.clients).toHaveLength(2)
    expect(rpcMock.clients[1].user.setActivity).toHaveBeenCalled()

    rpcMock.clients[1].emit('disconnected')
    rpc.setEnabled(false)
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(rpcMock.clients).toHaveLength(2)
  })
})
