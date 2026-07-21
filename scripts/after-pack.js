/**
 * electron-builder afterPack hook — brands the freshly packed Windows exe
 * (icon + version info via scripts/brand-win-exe.mjs) BEFORE the NSIS
 * installer / portable zip are produced from the app directory. This is what
 * makes the installed exe, taskbar, and tray show the real Native icon on
 * hosts where rcedit/wine is unavailable (win.signAndEditExecutable=false).
 */
const { join } = require('node:path')
const { existsSync } = require('node:fs')
const { execFileSync } = require('node:child_process')

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return
  const exe = join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`)
  if (!existsSync(exe)) {
    console.warn(`[after-pack] exe not found at ${exe} — skipping branding`)
    return
  }
  execFileSync(process.execPath, [join(__dirname, 'brand-win-exe.mjs'), exe], {
    stdio: 'inherit'
  })
}
