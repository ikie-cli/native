import { shell } from 'electron'
import { open, readdir, realpath, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join, normalize, resolve, sep } from 'node:path'
import type { FileEntry } from '@shared/types'
import { paths } from '../paths'

/** Extensions we allow inline text preview for. */
export const TEXT_PREVIEW_RE = /\.(txt|json|properties|toml|log|yml|cfg)$/i

const DEFAULT_MAX_PREVIEW_BYTES = 256 * 1024

/**
 * Lexical guard: normalize a renderer-supplied relative path and reject
 * anything that could step outside the root ('..' segments, absolute paths,
 * Windows drive prefixes). Returns the normalized path, '' for the root,
 * or null when the input is unsafe.
 */
export function safeRelPath(relPath: string): string | null {
  if (typeof relPath !== 'string') return null
  if (relPath === '' || relPath === '.') return ''
  if (isAbsolute(relPath) || /^[a-zA-Z]:/.test(relPath)) return null
  const norm = normalize(relPath).replace(/[\\/]+$/, '')
  if (norm === '' || norm === '.') return ''
  if (norm.split(/[\\/]/).some((seg) => seg === '' || seg === '.' || seg === '..')) return null
  return norm
}

/**
 * Instance file browser: list/open/reveal/trash/preview inside the instance's
 * minecraft dir. Every entry point resolves through `resolveSafe`, which
 * rejects lexical escapes and symlink escapes (realpath containment check).
 */
export class FilesService {
  private root(instanceId: string): string {
    return paths.instanceGameDir(instanceId)
  }

  /** Resolve relPath inside the instance game dir; throws on any escape. */
  private async resolveSafe(instanceId: string, relPath: string): Promise<string> {
    const rel = safeRelPath(relPath)
    if (rel === null) throw new Error('Invalid path')
    const root = resolve(this.root(instanceId))
    if (rel === '') return root
    const target = resolve(root, rel)
    if (!target.startsWith(root + sep)) {
      throw new Error('Path escapes instance directory')
    }
    // Symlink escape: the real location of the target (and its parent, for
    // entries that don't exist yet) must stay under the real root.
    const realRoot = await realpath(root).catch(() => null)
    if (realRoot === null) return target // root missing → downstream op fails cleanly
    const contained = (p: string): boolean => p === realRoot || p.startsWith(realRoot + sep)
    const realParent = await realpath(dirname(target)).catch(() => null)
    if (realParent !== null && !contained(realParent)) {
      throw new Error('Path escapes instance directory')
    }
    const real = await realpath(target).catch(() => null)
    if (real !== null && !contained(real)) {
      throw new Error('Path escapes instance directory')
    }
    return target
  }

  /** List a directory: dirs first, then files, each group alphabetical. */
  async list(instanceId: string, relPath: string): Promise<FileEntry[]> {
    const dir = await this.resolveSafe(instanceId, relPath)
    let names: string[] = []
    try {
      names = await readdir(dir)
    } catch {
      return []
    }
    const out: FileEntry[] = []
    for (const name of names) {
      const st = await stat(join(dir, name)).catch(() => null)
      if (!st) continue // broken symlink etc. — skip
      out.push({
        name,
        dir: st.isDirectory(),
        size: st.isDirectory() ? 0 : st.size,
        mtimeMs: st.mtimeMs
      })
    }
    return out.sort((a, b) =>
      a.dir === b.dir
        ? a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
        : a.dir
          ? -1
          : 1
    )
  }

  /** Open with the OS default app. Returns '' on success or an error string. */
  async openPath(instanceId: string, relPath: string): Promise<string> {
    const p = await this.resolveSafe(instanceId, relPath)
    return shell.openPath(p)
  }

  /** Reveal in the system file manager. */
  async reveal(instanceId: string, relPath: string): Promise<void> {
    const p = await this.resolveSafe(instanceId, relPath)
    shell.showItemInFolder(p)
  }

  /** Move to the OS trash (recoverable, unlike rm). */
  async delete(instanceId: string, relPath: string): Promise<void> {
    const rel = safeRelPath(relPath)
    if (rel === null || rel === '') throw new Error('Invalid path')
    const p = await this.resolveSafe(instanceId, relPath)
    await shell.trashItem(p)
  }

  /** Read the head of a known-text file for inline preview; null otherwise. */
  async readText(
    instanceId: string,
    relPath: string,
    maxBytes = DEFAULT_MAX_PREVIEW_BYTES
  ): Promise<string | null> {
    if (!TEXT_PREVIEW_RE.test(relPath)) return null
    const p = await this.resolveSafe(instanceId, relPath)
    try {
      const fh = await open(p, 'r')
      try {
        const st = await fh.stat()
        if (!st.isFile()) return null
        const len = Math.min(st.size, Math.max(0, maxBytes))
        const buf = Buffer.alloc(len)
        await fh.read(buf, 0, len, 0)
        return buf.toString('utf-8')
      } finally {
        await fh.close()
      }
    } catch {
      return null
    }
  }
}
