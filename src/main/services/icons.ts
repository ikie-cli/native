import { copyFile, readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { paths } from '../paths'
import { ensureDir, exists, removePath } from '../utils/fsx'

const ALLOWED = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])
const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif'
}

/**
 * Custom instance images. Stored under <data>/icons/<uuid>.<ext>; an
 * instance's `icon` field then holds `image:<fileName>`. Served to the
 * renderer as data URLs (file:// is blocked by CSP).
 */
export class IconsService {
  /** Copy a user-picked file into the icons dir; returns the icon ref. */
  async importImage(sourcePath: string): Promise<string> {
    const ext = extname(sourcePath).toLowerCase()
    if (!ALLOWED.has(ext)) {
      throw new Error('Unsupported image type — use PNG, JPEG, WebP, or GIF')
    }
    await ensureDir(paths.icons())
    const name = `${randomUUID()}${ext}`
    await copyFile(sourcePath, join(paths.icons(), name))
    return `image:${name}`
  }

  /** Resolve an `image:<name>` ref to a data URL (null when missing). */
  async data(ref: string): Promise<string | null> {
    if (!ref.startsWith('image:')) return null
    const name = ref.slice(6)
    if (name.includes('..') || name.includes('/') || name.includes('\\')) return null
    const file = join(paths.icons(), name)
    if (!(await exists(file))) return null
    const mime = MIME[extname(name).toLowerCase()] ?? 'image/png'
    const buf = await readFile(file)
    return `data:${mime};base64,${buf.toString('base64')}`
  }

  async remove(ref: string): Promise<void> {
    if (!ref.startsWith('image:')) return
    const name = ref.slice(6)
    if (name.includes('..') || name.includes('/') || name.includes('\\')) return
    await removePath(join(paths.icons(), name))
  }
}
