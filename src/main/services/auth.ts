import { createHash } from 'node:crypto'

/**
 * Local account identity helpers. Microsoft/Xbox/Minecraft authentication is
 * handled by msmc (see msmc.ts) — offline mode is a separate, explicit profile
 * type for singleplayer/LAN and performs no authentication bypass.
 */

/** Insert dashes into a 32-char uuid. */
export function formatUuid(raw: string): string {
  const s = raw.replace(/-/g, '')
  if (s.length !== 32) return raw
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`
}

/**
 * Vanilla-compatible offline UUID: md5("OfflinePlayer:" + name) with
 * version/variant bits set (UUID v3).
 */
export function offlineUuid(name: string): string {
  const hash = createHash('md5').update(`OfflinePlayer:${name}`, 'utf8').digest()
  hash[6] = (hash[6] & 0x0f) | 0x30
  hash[8] = (hash[8] & 0x3f) | 0x80
  return formatUuid(hash.toString('hex'))
}

export function validOfflineName(name: string): boolean {
  return /^[A-Za-z0-9_]{3,16}$/.test(name)
}
