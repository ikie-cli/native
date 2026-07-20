import { createHash } from 'node:crypto'
import type { DeviceCodeInfo } from '@shared/types'
import { URLS } from '../paths'
import { fetchJson, postForm, postJson } from '../utils/http'
import { log } from '../logger'

/**
 * Microsoft OAuth device-code flow → Xbox Live → XSTS → Minecraft services.
 * Requires game ownership (entitlement check) — offline mode is a separate,
 * explicit profile type and performs no authentication bypass.
 */

const SCOPE = 'XboxLive.signin offline_access'

export interface MsaTokens {
  msRefreshToken: string
  mcAccessToken: string
  /** epoch ms when the minecraft token expires */
  mcExpiresAt: number
  xuid: string
}

export interface McProfile {
  id: string
  name: string
}

export class AuthError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'client-id-missing'
      | 'declined'
      | 'expired'
      | 'no-xbox'
      | 'child-account'
      | 'not-owned'
      | 'no-profile'
      | 'network'
      | 'cancelled' = 'network'
  ) {
    super(message)
    this.name = 'AuthError'
  }
}

interface DeviceCodeResponse {
  device_code: string
  user_code: string
  verification_uri: string
  expires_in: number
  interval: number
  error?: string
  error_description?: string
}

interface TokenResponse {
  token_type: string
  access_token: string
  refresh_token: string
  expires_in: number
  error?: string
  error_description?: string
}

export async function requestDeviceCode(
  clientId: string
): Promise<{ info: DeviceCodeInfo; deviceCode: string }> {
  const { status, json } = await postForm<DeviceCodeResponse>(URLS.msaDeviceCode(), {
    client_id: clientId,
    scope: SCOPE
  })
  if (status !== 200 || !json.device_code) {
    throw new AuthError(
      json.error_description ?? `Device code request failed (${status})`,
      json.error === 'unauthorized_client' ? 'client-id-missing' : 'network'
    )
  }
  return {
    deviceCode: json.device_code,
    info: {
      userCode: json.user_code,
      verificationUri: json.verification_uri,
      expiresIn: json.expires_in,
      interval: json.interval || 5
    }
  }
}

/** Poll the token endpoint until the user completes (or rejects) sign-in. */
export async function pollDeviceToken(
  clientId: string,
  deviceCode: string,
  expiresIn: number,
  intervalSec: number,
  cancelled: () => boolean
): Promise<TokenResponse> {
  const deadline = Date.now() + expiresIn * 1000
  let interval = Math.max(1, intervalSec)
  while (Date.now() < deadline) {
    if (cancelled()) throw new AuthError('Sign-in cancelled', 'cancelled')
    await sleep(interval * 1000)
    if (cancelled()) throw new AuthError('Sign-in cancelled', 'cancelled')
    const { json } = await postForm<TokenResponse>(URLS.msaToken(), {
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      client_id: clientId,
      device_code: deviceCode
    })
    if (json.access_token) return json
    switch (json.error) {
      case 'authorization_pending':
        continue
      case 'slow_down':
        interval += 5
        continue
      case 'authorization_declined':
        throw new AuthError('Sign-in was declined', 'declined')
      case 'expired_token':
        throw new AuthError('The sign-in code expired — try again', 'expired')
      default:
        throw new AuthError(json.error_description ?? `Sign-in failed (${json.error})`)
    }
  }
  throw new AuthError('The sign-in code expired — try again', 'expired')
}

export async function refreshMsToken(clientId: string, refreshToken: string): Promise<TokenResponse> {
  const { json } = await postForm<TokenResponse>(URLS.msaToken(), {
    grant_type: 'refresh_token',
    client_id: clientId,
    refresh_token: refreshToken,
    scope: SCOPE
  })
  if (!json.access_token) {
    throw new AuthError(json.error_description ?? 'Session expired — please sign in again', 'expired')
  }
  return json
}

interface XblResponse {
  Token: string
  DisplayClaims: { xui: { uhs: string; xid?: string }[] }
}

/** MS access token → Minecraft token + xuid via the Xbox chain. */
export async function msTokenToMinecraft(
  msAccessToken: string
): Promise<{ mcAccessToken: string; mcExpiresAt: number; xuid: string }> {
  const xbl = await postJson<XblResponse>(URLS.xblAuth(), {
    Properties: {
      AuthMethod: 'RPS',
      SiteName: 'user.auth.xboxlive.com',
      RpsTicket: `d=${msAccessToken}`
    },
    RelyingParty: 'http://auth.xboxlive.com',
    TokenType: 'JWT'
  })
  if (xbl.status !== 200 || !xbl.json.Token) {
    throw new AuthError('Xbox Live sign-in failed')
  }
  const uhs = xbl.json.DisplayClaims.xui[0]?.uhs
  if (!uhs) throw new AuthError('Xbox Live returned no user hash')

  const xsts = await postJson<XblResponse & { XErr?: number }>(URLS.xstsAuth(), {
    Properties: { SandboxId: 'RETAIL', UserTokens: [xbl.json.Token] },
    RelyingParty: 'rp://api.minecraftservices.com/',
    TokenType: 'JWT'
  })
  if (xsts.status !== 200 || !xsts.json.Token) {
    const xerr = (xsts.json as { XErr?: number }).XErr
    if (xerr === 2148916233) {
      throw new AuthError('This Microsoft account has no Xbox profile — create one first', 'no-xbox')
    }
    if (xerr === 2148916238) {
      throw new AuthError('Child accounts must be added to a family by an adult', 'child-account')
    }
    throw new AuthError(`Xbox security token failed${xerr ? ` (XErr ${xerr})` : ''}`)
  }
  const xuid = xsts.json.DisplayClaims?.xui?.[0]?.xid ?? ''

  const mc = await postJson<{ access_token: string; expires_in: number }>(
    `${URLS.mcServices()}/authentication/login_with_xbox`,
    { identityToken: `XBL3.0 x=${uhs};${xsts.json.Token}` }
  )
  if (mc.status !== 200 || !mc.json.access_token) {
    throw new AuthError('Minecraft services sign-in failed')
  }
  return {
    mcAccessToken: mc.json.access_token,
    mcExpiresAt: Date.now() + Math.max(60, mc.json.expires_in - 300) * 1000,
    xuid
  }
}

/** Ownership gate — the account must own Minecraft: Java Edition. */
export async function checkEntitlement(mcAccessToken: string): Promise<void> {
  const res = await fetchJson<{ items?: { name: string }[] }>(
    `${URLS.mcServices()}/entitlements/mcstore`,
    { headers: { authorization: `Bearer ${mcAccessToken}` } }
  )
  const items = res.items ?? []
  const owns = items.some((i) => i.name === 'product_minecraft' || i.name === 'game_minecraft')
  if (!owns) {
    throw new AuthError(
      'This Microsoft account does not own Minecraft: Java Edition. Native requires game ownership — Xbox Game Pass users must sign in to the official launcher once first.',
      'not-owned'
    )
  }
}

export async function fetchProfile(mcAccessToken: string): Promise<McProfile> {
  const res = await fetch(`${URLS.mcServices()}/minecraft/profile`, {
    headers: { authorization: `Bearer ${mcAccessToken}` }
  })
  if (res.status === 404) {
    throw new AuthError(
      'This account owns the game but has no Minecraft profile — create one in the official launcher first.',
      'no-profile'
    )
  }
  if (!res.ok) throw new AuthError(`Profile fetch failed (${res.status})`)
  const json = (await res.json()) as { id: string; name: string }
  return { id: formatUuid(json.id), name: json.name }
}

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

export function logAuth(msg: string): void {
  log.info(`[auth] ${msg}`)
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
