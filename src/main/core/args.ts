import type { VersionJson } from './mojang-types'
import { resolveArgs, substitute, type RuleContext } from './rules'

export interface LaunchAccount {
  name: string
  uuid: string
  accessToken: string
  type: 'msa' | 'offline'
  xuid?: string
  clientId?: string
}

export interface LaunchSpec {
  version: VersionJson
  versionId: string
  gameDir: string
  assetsDir: string
  /** virtual/legacy asset dir when the index maps to resources */
  legacyAssetsDir?: string | null
  nativesDir: string
  librariesDir: string
  classpath: string[]
  memMinMB: number
  memMaxMB: number
  extraJvmArgs: string[]
  account: LaunchAccount
  resolution?: { width: number; height: number } | null
  fullscreen?: boolean
  server?: { host: string; port: number } | null
  demo?: boolean
  launcherName: string
  launcherVersion: string
  log4jConfigPath?: string | null
  os: RuleContext
}

export interface BuiltCommand {
  jvm: string[]
  mainClass: string
  game: string[]
  all: string[]
}

/** Does this version support the modern --quickPlayMultiplayer flow? */
export function supportsQuickPlay(version: VersionJson): boolean {
  const game = version.arguments?.game
  if (!game) return false
  return game.some(
    (a) =>
      typeof a !== 'string' &&
      a.rules?.some((r) => r.features && 'is_quick_play_multiplayer' in r.features)
  )
}

export function classpathSeparator(osName: RuleContext['osName']): string {
  return osName === 'windows' ? ';' : ':'
}

/**
 * Build the full java command line for a resolved version JSON.
 * Handles modern `arguments` and legacy `minecraftArguments` formats.
 */
export function buildCommand(spec: LaunchSpec): BuiltCommand {
  const v = spec.version
  const sep = classpathSeparator(spec.os.osName)
  const cp = spec.classpath.join(sep)
  const quickPlay = Boolean(spec.server) && supportsQuickPlay(v)

  const features: Record<string, boolean> = {
    ...spec.os.features,
    is_demo_user: Boolean(spec.demo),
    has_custom_resolution: Boolean(spec.resolution),
    has_quick_plays_support: false,
    is_quick_play_singleplayer: false,
    is_quick_play_multiplayer: quickPlay,
    is_quick_play_realms: false
  }
  const ctx: RuleContext = { ...spec.os, features }

  const vars: Record<string, string> = {
    auth_player_name: spec.account.name,
    version_name: spec.versionId,
    game_directory: spec.gameDir,
    assets_root: spec.assetsDir,
    game_assets: spec.legacyAssetsDir ?? spec.assetsDir,
    assets_index_name: v.assetIndex?.id ?? v.assets ?? 'legacy',
    auth_uuid: spec.account.uuid,
    auth_access_token: spec.account.accessToken,
    auth_session: `token:${spec.account.accessToken}:${spec.account.uuid}`,
    clientid: spec.account.clientId ?? '',
    auth_xuid: spec.account.xuid ?? '',
    user_type: spec.account.type === 'msa' ? 'msa' : 'legacy',
    user_properties: '{}',
    version_type: v.type ?? 'release',
    natives_directory: spec.nativesDir,
    launcher_name: spec.launcherName,
    launcher_version: spec.launcherVersion,
    classpath: cp,
    library_directory: spec.librariesDir,
    classpath_separator: sep,
    resolution_width: String(spec.resolution?.width ?? ''),
    resolution_height: String(spec.resolution?.height ?? ''),
    quickPlayPath: '',
    quickPlaySingleplayer: '',
    quickPlayMultiplayer: spec.server ? `${spec.server.host}:${spec.server.port}` : '',
    quickPlayRealms: ''
  }

  // ---- JVM args ----
  const jvm: string[] = [`-Xms${spec.memMinMB}M`, `-Xmx${spec.memMaxMB}M`]

  if (v.arguments?.jvm) {
    jvm.push(...substitute(resolveArgs(v.arguments.jvm, ctx), vars))
  } else {
    // Legacy versions: provide the classic minimum.
    if (spec.os.osName === 'osx') jvm.push('-XstartOnFirstThread')
    jvm.push(`-Djava.library.path=${spec.nativesDir}`)
    jvm.push('-Dminecraft.launcher.brand=' + spec.launcherName)
    jvm.push('-Dminecraft.launcher.version=' + spec.launcherVersion)
    jvm.push('-cp', cp)
  }

  // Log4Shell hardening for all versions.
  jvm.push('-Dlog4j2.formatMsgNoLookups=true')
  if (spec.log4jConfigPath && v.logging?.client?.argument) {
    jvm.push(v.logging.client.argument.replace('${path}', spec.log4jConfigPath))
  }
  jvm.push(...spec.extraJvmArgs.filter((a) => a.length > 0))

  // ---- Game args ----
  let game: string[]
  if (v.arguments?.game) {
    game = substitute(resolveArgs(v.arguments.game, ctx), vars)
  } else if (v.minecraftArguments != null) {
    game = substitute(v.minecraftArguments.split(' ').filter(Boolean), vars)
  } else {
    game = []
  }

  if (spec.resolution && !game.includes('--width')) {
    game.push('--width', String(spec.resolution.width), '--height', String(spec.resolution.height))
  }
  if (spec.fullscreen) game.push('--fullscreen')
  if (spec.server && !quickPlay) {
    game.push('--server', spec.server.host, '--port', String(spec.server.port))
  }

  return { jvm, mainClass: v.mainClass, game, all: [...jvm, v.mainClass, ...game] }
}

/** Clamp + validate instance memory config against system memory. */
export function normalizeMemory(
  minMB: number,
  maxMB: number,
  systemTotalMB: number
): { minMB: number; maxMB: number } {
  const floor = 256
  const ceil = Math.max(floor, systemTotalMB - 1024) // leave 1 GB for the OS
  let max = Math.round(clamp(maxMB, floor, ceil))
  let min = Math.round(clamp(minMB, floor, max))
  if (min > max) [min, max] = [max, min]
  return { minMB: min, maxMB: max }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo))
}
