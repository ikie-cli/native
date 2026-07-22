import { app } from 'electron'

/** Runtime package version from Electron's generated application metadata. */
export const APP_VERSION = app.getVersion()
export const USER_AGENT = `NativeLauncher/${APP_VERSION} (native-launcher)`
