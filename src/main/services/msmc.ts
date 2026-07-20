import type { types } from 'msmc'
import { log } from '../logger'

/**
 * Microsoft auth via msmc — the MSMC library drives the official Minecraft
 * launcher OAuth client (client_id 00000000402b5328) through a popup
 * BrowserWindow, so users sign in with zero Azure/app-registration setup.
 *
 * This adapter is the seam AccountsService depends on; tests inject a fake.
 */

export interface MsaSession {
  profile: { id: string; name: string }
  xuid: string
  mcToken: string
  /** epoch seconds */
  exp: number
  demo: boolean
  /** serializable refresh state (msmc types.MCToken) */
  saved: types.MCToken
}

export interface MsmcClient {
  /** Interactive sign-in (opens the Microsoft window). */
  login: (onState: (state: 'browser' | 'minecraft' | 'profile') => void) => Promise<MsaSession>
  /** Silent refresh from a previously saved token. */
  refresh: (saved: types.MCToken) => Promise<MsaSession>
}

function toSession(mc: {
  profile?: types.MCProfile
  xuid: string
  mcToken: string
  exp: number
  isDemo: () => boolean
  getToken: (full: boolean) => types.MCToken
}): MsaSession {
  if (!mc.profile?.id) {
    throw new Error(
      'This account owns the game but has no Minecraft profile — create one in the official launcher first.'
    )
  }
  return {
    profile: { id: formatUuid(mc.profile.id), name: mc.profile.name },
    xuid: mc.xuid,
    mcToken: mc.mcToken,
    exp: mc.exp,
    demo: mc.isDemo(),
    saved: mc.getToken(true)
  }
}

/** Insert dashes into a 32-char hex uuid (msmc returns undashed). */
export function formatUuid(raw: string): string {
  const s = raw.replace(/-/g, '')
  if (s.length !== 32) return raw
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`
}

/** Production adapter over msmc. */
export function createMsmcClient(customClientId: () => string | null): MsmcClient {
  return {
    async login(onState) {
      const { Auth } = await import('msmc')
      const custom = customClientId()
      const auth = custom
        ? new Auth({
            client_id: custom,
            redirect: 'https://login.live.com/oauth20_desktop.srf',
            prompt: 'select_account'
          })
        : new Auth('select_account')
      onState('browser')
      const xbox = await auth.launch('electron', {
        title: 'Sign in to Minecraft',
        width: 520,
        height: 660,
        resizable: false,
        backgroundColor: '#0a0a0a',
        webPreferences: { contextIsolation: true, nodeIntegration: false }
      })
      onState('minecraft')
      const mc = await xbox.getMinecraft()
      onState('profile')
      log.info('[auth] msmc sign-in completed')
      return toSession(mc)
    },

    async refresh(saved) {
      const msmc = await import('msmc')
      const auth = new msmc.Auth('none')
      const mc = await msmc.tokenUtils.fromToken(auth, saved, true)
      return toSession(mc)
    }
  }
}
