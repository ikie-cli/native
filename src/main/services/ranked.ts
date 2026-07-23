import { createHash, randomBytes } from 'node:crypto'
import { access, copyFile, mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { AccountInfo, InstanceConfig, RankedPlayer, RankedStatus } from '@shared/types'
import { paths, URLS } from '../paths'
import type { AccountsService } from './accounts'
import type { InstancesService } from './instances'

const INSTANCE_MARKER = 'native-ranked:managed:v1'
const MOD_FILE = 'native-ranked.jar'

interface RankedConfigFile {
  endpoint: string
  token: string
  playerId: string
  username: string
  modVersion: string
}

interface RegisterResponse {
  token: string
  player: RankedPlayer
}

export class RankedService {
  constructor(
    private instances: InstancesService,
    private accounts: AccountsService
  ) {}

  async status(): Promise<RankedStatus> {
    const instance = this.findInstance()
    let service: RankedStatus['service'] = null
    let leaderboard: RankedPlayer[] = []
    try {
      const health = await getJson<RankedStatus['service'] & { ok: boolean }>(`${URLS.ranked()}/health`)
      service = health
      leaderboard = (await getJson<{ players: RankedPlayer[] }>(`${URLS.ranked()}/v1/leaderboard?limit=10`)).players
    } catch (error) {
      return {
        configured: Boolean(instance && (await this.readConfig(instance))),
        online: false,
        instance,
        player: null,
        leaderboard,
        service,
        error: message(error)
      }
    }

    if (!instance) return { configured: false, online: true, instance: null, player: null, leaderboard, service }
    const config = await this.readConfig(instance)
    if (!config) return { configured: false, online: true, instance, player: null, leaderboard, service }
    try {
      const profile = await getJson<{ player: RankedPlayer }>(`${URLS.ranked()}/v1/profile`, config.token)
      return { configured: true, online: true, instance, player: profile.player, leaderboard, service }
    } catch (error) {
      return {
        configured: false,
        online: true,
        instance,
        player: null,
        leaderboard,
        service,
        error: message(error)
      }
    }
  }

  async provision(): Promise<RankedStatus> {
    const account = this.accounts.active()
    if (!account) throw new Error('Choose a Minecraft profile before setting up Native Ranked')
    const instance = await this.ensureInstance()
    const deviceId = await this.deviceId()
    const registration = await postJson<RegisterResponse>(`${URLS.ranked()}/v1/auth/register`, {
      profileId: account.id,
      username: account.username,
      deviceId
    })
    const modVersion = await this.installMod(instance)
    await this.writeConfig(instance, account, registration, modVersion)
    return this.status()
  }

  async prepareLaunch(): Promise<InstanceConfig> {
    const account = this.accounts.active()
    if (!account) throw new Error('Choose a Minecraft profile before launching Native Ranked')
    let instance = this.findInstance()
    let config = instance ? await this.readConfig(instance) : null
    if (!instance || !config || config.username !== account.username) {
      const state = await this.provision()
      if (!state.instance) throw new Error('Native Ranked instance could not be created')
      instance = state.instance
    } else {
      const modVersion = await this.installMod(instance)
      // Migrate the stored endpoint (e.g. legacy http → the current HTTPS API) and mod version.
      if (config.modVersion !== modVersion || config.endpoint !== URLS.ranked()) {
        config = { ...config, modVersion, endpoint: URLS.ranked() }
        await this.writeRawConfig(instance, config)
      }
    }
    return instance
  }

  private findInstance(): InstanceConfig | null {
    return this.instances.list().find((instance) => instance.notes.includes(INSTANCE_MARKER)) ?? null
  }

  private async ensureInstance(): Promise<InstanceConfig> {
    const existing = this.findInstance()
    if (existing) {
      if (existing.mcVersion !== '1.16.1' || existing.loader !== 'fabric') {
        return this.instances.update(existing.id, {
          mcVersion: '1.16.1',
          loader: 'fabric',
          loaderVersion: '0.16.10',
          notes: INSTANCE_MARKER
        })
      }
      return existing
    }
    return this.instances.create({
      name: 'Native Ranked',
      mcVersion: '1.16.1',
      loader: 'fabric',
      loaderVersion: '0.16.10',
      icon: 'builtin:sword',
      memMin: 512,
      memMax: 2048,
      gameWidth: 1067,
      gameHeight: 600,
      group: 'Native',
      notes: INSTANCE_MARKER
    })
  }

  private async deviceId(): Promise<string> {
    try {
      const existing = (await readFile(paths.rankedDeviceId(), 'utf8')).trim()
      if (/^[a-f0-9]{64}$/i.test(existing)) return existing
    } catch {
      // First setup creates a launcher-scoped opaque device id.
    }
    const value = randomBytes(32).toString('hex')
    await writeFile(paths.rankedDeviceId(), value, { encoding: 'utf8', mode: 0o600 })
    return value
  }

  private async installMod(instance: InstanceConfig): Promise<string> {
    const gameDir = paths.instanceGameDir(instance.id)
    const modsDir = join(gameDir, 'mods')
    await mkdir(modsDir, { recursive: true })
    const target = join(modsDir, MOD_FILE)
    const localCandidates = [
      join(process.resourcesPath, MOD_FILE),
      join(process.cwd(), 'resources', MOD_FILE),
      join(process.cwd(), 'native-ranked-mod', 'build', 'libs', 'native-ranked-0.3.1.jar')
    ]
    let bytes: Buffer | null = null
    try {
      const response = await fetch(`${URLS.ranked()}/artifacts/${MOD_FILE}`, {
        signal: AbortSignal.timeout(12_000),
        headers: { 'user-agent': 'Native-Launcher/Ranked' }
      })
      if (response.ok) bytes = Buffer.from(await response.arrayBuffer())
    } catch {
      // Packaged/local copy below is the offline-safe fallback.
    }
    const temporary = `${target}.download`
    if (bytes && bytes.length > 1_000) {
      await writeFile(temporary, bytes)
      await rename(temporary, target)
    } else {
      let copied = false
      for (const candidate of localCandidates) {
        try {
          await access(candidate)
          await copyFile(candidate, target)
          copied = true
          break
        } catch {
          // Try the next packaged/development location.
        }
      }
      if (!copied) throw new Error('Native Ranked mod could not be downloaded or found in this installation')
    }
    for (const file of await readdir(modsDir)) {
      if (/^native-ranked(?:-.+)?\.jar$/i.test(file) && file !== MOD_FILE) await unlink(join(modsDir, file))
    }
    const hash = createHash('sha256').update(await readFile(target)).digest('hex')
    return hash.slice(0, 12)
  }

  private async writeConfig(
    instance: InstanceConfig,
    account: AccountInfo,
    registration: RegisterResponse,
    modVersion: string
  ): Promise<void> {
    await this.writeRawConfig(instance, {
      endpoint: URLS.ranked(),
      token: registration.token,
      playerId: registration.player.id,
      username: account.username,
      modVersion
    })
  }

  private async writeRawConfig(instance: InstanceConfig, config: RankedConfigFile): Promise<void> {
    const target = join(paths.instanceGameDir(instance.id), 'native-ranked.json')
    const temporary = `${target}.tmp`
    await writeFile(temporary, JSON.stringify(config, null, 2), { encoding: 'utf8', mode: 0o600 })
    await rename(temporary, target)
  }

  private async readConfig(instance: InstanceConfig): Promise<RankedConfigFile | null> {
    try {
      return JSON.parse(await readFile(join(paths.instanceGameDir(instance.id), 'native-ranked.json'), 'utf8')) as RankedConfigFile
    } catch {
      return null
    }
  }
}

async function getJson<T>(url: string, token?: string): Promise<T> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(8_000),
    headers: { accept: 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }
  })
  return parseResponse<T>(response)
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    signal: AbortSignal.timeout(8_000),
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
  return parseResponse<T>(response)
}

async function parseResponse<T>(response: Response): Promise<T> {
  const value = (await response.json()) as T & { error?: string }
  if (!response.ok) throw new Error(value.error ?? `Native Ranked returned ${response.status}`)
  return value
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Native Ranked is unavailable'
}
