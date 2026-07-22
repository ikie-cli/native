import { Client } from '@xhayper/discord-rpc'
import { LOADER_LABELS, type InstanceConfig } from '@shared/types'
import { log } from '../logger'

/**
 * Discord Rich Presence: shows "Playing <instance>" (or an idle "In the
 * launcher" state) on the user's Discord profile.
 *
 * Everything is best-effort — Discord not running, no client installed, or a
 * dropped socket must never surface to the user or block a launch. The service
 * simply reconnects lazily the next time presence is set.
 *
 * CLIENT_ID must be a Discord application id (https://discord.com/developers).
 * Upload an art asset named `logo` under Rich Presence → Art Assets for the
 * large image; text presence works without it. Safe to ship publicly — the id
 * only identifies the app and grants nothing.
 */
const CLIENT_ID = '1528357514326966303'
const LARGE_IMAGE = 'logo'
const RETRY_BASE_MS = 15_000
const RETRY_MAX_MS = 5 * 60_000

/** What to show; null means "idle" (no game running). */
type Presence = { instance: InstanceConfig; startedAt: number } | null

export class DiscordRpc {
  private client: Client | null = null
  private ready = false
  private enabled = false
  private current: Presence = null
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private retryAttempt = 0

  /** Enable/disable at runtime (settings toggle). */
  setEnabled(on: boolean): void {
    if (on === this.enabled) return
    this.enabled = on
    if (on) void this.apply()
    else this.disconnect()
  }

  /** Called on game start/stop; `null` clears back to idle. */
  set(presence: Presence): void {
    this.current = presence
    if (this.enabled) {
      this.clearRetry()
      void this.apply()
    }
  }

  /** Tear down on quit. */
  shutdown(): void {
    this.enabled = false
    this.disconnect()
  }

  private async connect(): Promise<boolean> {
    if (this.ready) return true
    if (!this.client) {
      const client = new Client({ clientId: CLIENT_ID })
      client.on('ready', () => (this.ready = true))
      client.on('disconnected', () => {
        this.ready = false
        this.scheduleReconnect()
      })
      this.client = client
    }
    try {
      await this.client.login()
      this.ready = true
      this.retryAttempt = 0
      this.clearRetry()
      return true
    } catch (err) {
      // Discord closed or not installed — stay quiet; drop the client so the
      // next apply() retries on a fresh socket instead of a half-dead one.
      log.debug(`discord rpc: not connected (${(err as Error).message})`)
      this.disconnect(false)
      this.scheduleReconnect()
      return false
    }
  }

  private disconnect(cancelRetry = true): void {
    if (cancelRetry) this.clearRetry()
    this.ready = false
    if (this.client) {
      void this.client.destroy().catch(() => {})
      this.client = null
    }
  }

  private async apply(): Promise<void> {
    if (!(await this.connect())) return
    try {
      if (this.current) {
        const { instance, startedAt } = this.current
        await this.client!.user?.setActivity({
          details: instance.name,
          state: `Minecraft ${instance.mcVersion} · ${LOADER_LABELS[instance.loader]}`,
          startTimestamp: startedAt,
          largeImageKey: LARGE_IMAGE,
          largeImageText: 'Native',
          instance: false
        })
      } else {
        await this.client!.user?.setActivity({
          state: 'In the launcher',
          largeImageKey: LARGE_IMAGE,
          largeImageText: 'Native',
          instance: false
        })
      }
    } catch (err) {
      log.debug(`discord rpc: setActivity failed (${(err as Error).message})`)
      this.disconnect(false)
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect(): void {
    if (!this.enabled || this.retryTimer) return
    const delay = Math.min(RETRY_BASE_MS * 2 ** this.retryAttempt, RETRY_MAX_MS)
    this.retryAttempt++
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      if (this.enabled) void this.apply()
    }, delay)
    this.retryTimer.unref?.()
  }

  private clearRetry(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.retryTimer = null
  }
}
