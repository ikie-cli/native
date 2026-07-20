import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { ScreenshotInfo } from '@shared/types'
import { paths } from '../paths'
import { removePath } from '../utils/fsx'

/** Per-instance screenshot gallery backed by the game's own screenshots dir. */
export class ScreenshotsService {
  private dir(instanceId: string): string {
    return join(paths.instanceGameDir(instanceId), 'screenshots')
  }

  async list(instanceId: string): Promise<ScreenshotInfo[]> {
    let entries: string[] = []
    try {
      entries = await readdir(this.dir(instanceId))
    } catch {
      return []
    }
    const out: ScreenshotInfo[] = []
    for (const name of entries) {
      if (!/\.(png|jpg|jpeg)$/i.test(name)) continue
      const p = join(this.dir(instanceId), name)
      const st = await stat(p).catch(() => null)
      if (!st?.isFile()) continue
      out.push({ name, path: p, sizeBytes: st.size, mtime: st.mtimeMs })
    }
    return out.sort((a, b) => b.mtime - a.mtime)
  }

  /** Read one screenshot as a data URL (renderer cannot access file://). */
  async data(instanceId: string, name: string): Promise<string | null> {
    if (name.includes('..') || name.includes('/') || name.includes('\\')) return null
    try {
      const buf = await readFile(join(this.dir(instanceId), name))
      return `data:image/png;base64,${buf.toString('base64')}`
    } catch {
      return null
    }
  }

  async remove(instanceId: string, name: string): Promise<void> {
    if (name.includes('..') || name.includes('/') || name.includes('\\')) return
    await removePath(join(this.dir(instanceId), name))
  }
}
