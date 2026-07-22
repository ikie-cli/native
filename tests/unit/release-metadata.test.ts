import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const script = resolve('scripts/prepare-release-metadata.mjs')

function metadata(version: string, files: Array<{ url: string; sha512?: string; size?: number }>) {
  return JSON.stringify({
    version,
    files: files.map((file) => ({ sha512: 'hash', size: 10, ...file })),
    path: files[0].url,
    sha512: 'hash',
    releaseDate: '2026-07-22T00:00:00.000Z'
  })
}

function fixture(version: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'native-release-meta-'))
  const write = (platform: string, arch: string, files: Array<{ url: string }>) =>
    writeFileSync(join(dir, `release-meta-${platform}-${arch}.yml`), metadata(version, files))

  write('windows', 'x64', [{ url: `Native-Setup-${version}-x64.exe` }])
  write('windows', 'arm64', [{ url: `Native-Setup-${version}-arm64.exe` }])
  write('linux', 'x64', [
    { url: `Native-${version}-x86_64.AppImage` },
    { url: `Native-${version}-amd64.deb` }
  ])
  write('linux', 'arm64', [
    { url: `Native-${version}-arm64.AppImage` },
    { url: `Native-${version}-arm64.deb` }
  ])
  write('mac', 'x64', [
    { url: `Native-${version}-x64.zip` },
    { url: `Native-${version}-x64.dmg` }
  ])
  write('mac', 'arm64', [
    { url: `Native-${version}-arm64.zip` },
    { url: `Native-${version}-arm64.dmg` }
  ])
  return dir
}

describe('release metadata preparation', () => {
  it('merges stable Windows/macOS architectures and preserves split Linux feeds', () => {
    const dir = fixture('3.3.2')
    execFileSync(process.execPath, [script, dir, 'v3.3.2'])

    expect(readFileSync(join(dir, 'latest.yml'), 'utf8')).toMatch(/x64\.exe[\s\S]*arm64\.exe/)
    expect(readFileSync(join(dir, 'latest-mac.yml'), 'utf8')).toMatch(/x64\.zip[\s\S]*arm64\.zip/)
    expect(readFileSync(join(dir, 'latest-linux.yml'), 'utf8')).toContain('x86_64.AppImage')
    expect(readFileSync(join(dir, 'latest-linux-arm64.yml'), 'utf8')).toContain('arm64.AppImage')
    expect(existsSync(join(dir, 'release-meta-windows-x64.yml'))).toBe(false)
  })

  it('emits channel-specific prerelease feed names', () => {
    const dir = fixture('3.3.2-beta.1')
    execFileSync(process.execPath, [script, dir, 'v3.3.2-beta.1'])

    for (const name of ['beta.yml', 'beta-linux.yml', 'beta-linux-arm64.yml', 'beta-mac.yml']) {
      expect(existsSync(join(dir, name)), name).toBe(true)
    }
    expect(existsSync(join(dir, 'latest.yml'))).toBe(false)
  })
})
