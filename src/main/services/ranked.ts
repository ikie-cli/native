import { access, copyFile, mkdir, readdir, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import type { InstanceConfig, RankedInstallResult } from '@shared/types'
import { paths } from '../paths'
import type { InstancesService } from './instances'

const INSTANCE_MARKER = 'native-ranked:managed:v1'
const MOD_FILE = 'native-ranked.jar'
const ICON_FILE = 'native-ranked-icon.png'

/**
 * Native Ranked is now a fully standalone Fabric mod (like MCSR Ranked): it
 * authenticates in-game against the Native identity service and hosts its own
 * matchmaking, leaderboard, and profile screens. The launcher's only job is a
 * one-click install — provision a 1.16.1 Fabric instance and drop the bundled
 * mod jar into it. The player launches it like any other instance.
 */
export class RankedService {
  constructor(private instances: InstancesService) {}

  async install(): Promise<RankedInstallResult> {
    const instance = await this.ensureInstance()
    await this.installMod(instance)
    return { instanceId: instance.id, name: instance.name }
  }

  private findInstance(): InstanceConfig | null {
    return this.instances.list().find((instance) => instance.notes.includes(INSTANCE_MARKER)) ?? null
  }

  private async ensureInstance(): Promise<InstanceConfig> {
    const icon = await this.ensureIcon()
    const existing = this.findInstance()
    if (existing) {
      return this.instances.update(existing.id, {
        mcVersion: '1.16.1',
        loader: 'fabric',
        loaderVersion: '0.16.10',
        icon,
        notes: INSTANCE_MARKER
      })
    }
    return this.instances.create({
      name: 'Native Ranked',
      mcVersion: '1.16.1',
      loader: 'fabric',
      loaderVersion: '0.16.10',
      icon,
      memMin: 512,
      memMax: 2048,
      gameWidth: 1067,
      gameHeight: 600,
      group: 'Native',
      notes: INSTANCE_MARKER
    })
  }

  /** Copy the bundled Native Ranked icon into the icons dir; return its ref (builtin fallback). */
  private async ensureIcon(): Promise<string> {
    const candidates = [
      join(process.resourcesPath, ICON_FILE),
      join(process.cwd(), 'resources', ICON_FILE)
    ]
    for (const candidate of candidates) {
      try {
        await access(candidate)
        await mkdir(paths.icons(), { recursive: true })
        await copyFile(candidate, join(paths.icons(), ICON_FILE))
        return `image:${ICON_FILE}`
      } catch {
        // Try the next location, else fall back to a builtin glyph.
      }
    }
    return 'builtin:sword'
  }

  private async installMod(instance: InstanceConfig): Promise<void> {
    const modsDir = join(paths.instanceGameDir(instance.id), 'mods')
    await mkdir(modsDir, { recursive: true })
    const target = join(modsDir, MOD_FILE)
    const candidates = [
      join(process.resourcesPath, MOD_FILE),
      join(process.cwd(), 'resources', MOD_FILE),
      join(process.cwd(), 'native-ranked-mod', 'build', 'libs', 'native-ranked-0.4.0.jar')
    ]
    let copied = false
    for (const candidate of candidates) {
      try {
        await access(candidate)
        await copyFile(candidate, target)
        copied = true
        break
      } catch {
        // Try the next packaged/development location.
      }
    }
    if (!copied) throw new Error('The Native Ranked mod is missing from this installation')
    // Remove any older/renamed copies so only the current jar loads.
    for (const file of await readdir(modsDir)) {
      if (/^native-ranked(?:-.+)?\.jar$/i.test(file) && file !== MOD_FILE) await unlink(join(modsDir, file))
    }
  }
}
