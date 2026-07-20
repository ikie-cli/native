import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { WorldInfo } from '@shared/types'
import { paths } from '../paths'
import { dirSize, exists, removePath, sanitizeFileName } from '../utils/fsx'
import { io } from '../core/io'

/**
 * Worlds manager: list (name/size/last-played/icon), zip backup, delete.
 * Reads the game's own `saves` folder — no extra bookkeeping.
 */
export class WorldsService {
  private savesDir(instanceId: string): string {
    return join(paths.instanceGameDir(instanceId), 'saves')
  }

  async list(instanceId: string): Promise<WorldInfo[]> {
    const dir = this.savesDir(instanceId)
    let entries: string[] = []
    try {
      entries = await readdir(dir)
    } catch {
      return []
    }
    const out: WorldInfo[] = []
    for (const folder of entries) {
      const worldDir = join(dir, folder)
      const st = await stat(worldDir).catch(() => null)
      if (!st?.isDirectory()) continue
      if (!(await exists(join(worldDir, 'level.dat')))) continue
      const icon = join(worldDir, 'icon.png')
      out.push({
        folder,
        name: folder,
        sizeBytes: await dirSize(worldDir),
        lastPlayed: st.mtimeMs,
        icon: (await exists(icon)) ? icon : null
      })
    }
    return out.sort((a, b) => b.lastPlayed - a.lastPlayed)
  }

  /** Zip the world into the backups dir; returns the archive path. */
  async backup(instanceId: string, folder: string): Promise<string> {
    const worldDir = join(this.savesDir(instanceId), folder)
    if (!(await exists(worldDir))) throw new Error('World not found')
    const stampSource = new Date()
    const stamp = `${stampSource.getFullYear()}-${pad(stampSource.getMonth() + 1)}-${pad(stampSource.getDate())}_${pad(stampSource.getHours())}-${pad(stampSource.getMinutes())}-${pad(stampSource.getSeconds())}`
    const dest = join(paths.backups(), `${sanitizeFileName(folder)}_${stamp}.zip`)
    await io.zipDir(worldDir, dest)
    return dest
  }

  async remove(instanceId: string, folder: string): Promise<void> {
    const worldDir = join(this.savesDir(instanceId), folder)
    if (!(await exists(worldDir))) return
    if (!(await exists(join(worldDir, 'level.dat')))) {
      throw new Error('Refusing to delete: not a world folder')
    }
    await removePath(worldDir)
  }
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}
