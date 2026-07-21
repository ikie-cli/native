import { describe, expect, it } from 'vitest'
import { parseMrpackIndex, safePackPath } from '../../src/main/core/mrpack'

function index(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    formatVersion: 1,
    game: 'minecraft',
    versionId: '1.0.0',
    name: 'Test Pack',
    summary: 'A pack',
    dependencies: { minecraft: '1.20.1', 'fabric-loader': '0.15.0' },
    files: [
      {
        path: 'mods/sodium.jar',
        hashes: { sha1: 'abc', sha512: 'def' },
        env: { client: 'required', server: 'optional' },
        downloads: ['https://cdn.modrinth.com/sodium.jar'],
        fileSize: 1234
      }
    ],
    ...overrides
  })
}

describe('safePackPath', () => {
  it('accepts normal relative paths', () => {
    expect(safePackPath('mods/sodium.jar')).toBe(true)
    expect(safePackPath('config/some/deep/file.toml')).toBe(true)
    expect(safePackPath('options.txt')).toBe(true)
  })

  it('treats backslashes as separators', () => {
    expect(safePackPath('config\\mod\\file.cfg')).toBe(true)
    expect(safePackPath('..\\escape.jar')).toBe(false)
  })

  it('rejects traversal, absolute and drive paths', () => {
    expect(safePackPath('../evil.jar')).toBe(false)
    expect(safePackPath('mods/../../evil.jar')).toBe(false)
    expect(safePackPath('/etc/passwd')).toBe(false)
    expect(safePackPath('C:/Windows/system32')).toBe(false)
    expect(safePackPath('c:\\boot.ini')).toBe(false)
    expect(safePackPath('mods//x.jar')).toBe(false)
    expect(safePackPath('./mods/x.jar')).toBe(false)
    expect(safePackPath('')).toBe(false)
    expect(safePackPath(42)).toBe(false)
  })
})

describe('parseMrpackIndex', () => {
  it('parses a fabric pack', () => {
    const p = parseMrpackIndex(index())
    expect(p.name).toBe('Test Pack')
    expect(p.packVersion).toBe('1.0.0')
    expect(p.summary).toBe('A pack')
    expect(p.mcVersion).toBe('1.20.1')
    expect(p.loader).toBe('fabric')
    expect(p.loaderVersion).toBe('0.15.0')
    expect(p.files).toHaveLength(1)
    expect(p.files[0]).toEqual({
      path: 'mods/sodium.jar',
      sha1: 'abc',
      size: 1234,
      urls: ['https://cdn.modrinth.com/sodium.jar']
    })
  })

  it('maps every loader dependency key', () => {
    const cases: [string, string][] = [
      ['fabric-loader', 'fabric'],
      ['quilt-loader', 'quilt'],
      ['forge', 'forge'],
      ['neoforge', 'neoforge']
    ]
    for (const [key, loader] of cases) {
      const p = parseMrpackIndex(
        index({ dependencies: { minecraft: '1.20.1', [key]: '1.2.3' } })
      )
      expect(p.loader).toBe(loader)
      expect(p.loaderVersion).toBe('1.2.3')
    }
  })

  it('falls back to vanilla with no loader dependency', () => {
    const p = parseMrpackIndex(index({ dependencies: { minecraft: '1.20.1' } }))
    expect(p.loader).toBe('vanilla')
    expect(p.loaderVersion).toBeNull()
  })

  it('skips server-only files and counts them', () => {
    const p = parseMrpackIndex(
      index({
        files: [
          {
            path: 'mods/server-only.jar',
            hashes: { sha1: 'x' },
            env: { client: 'unsupported', server: 'required' },
            downloads: ['https://example.com/s.jar'],
            fileSize: 10
          },
          {
            path: 'mods/client.jar',
            hashes: { sha1: 'y' },
            env: { client: 'optional', server: 'unsupported' },
            downloads: ['https://example.com/c.jar'],
            fileSize: 20
          }
        ]
      })
    )
    expect(p.files.map((f) => f.path)).toEqual(['mods/client.jar'])
    expect(p.serverOnlyCount).toBe(1)
  })

  it('rejects unsafe file paths', () => {
    expect(() =>
      parseMrpackIndex(
        index({
          files: [
            {
              path: '../../.bashrc',
              hashes: { sha1: 'x' },
              downloads: ['https://example.com/x'],
              fileSize: 1
            }
          ]
        })
      )
    ).toThrow(/unsafe file path/)
  })

  it('rejects files without a usable download URL', () => {
    expect(() =>
      parseMrpackIndex(
        index({
          files: [
            { path: 'mods/x.jar', hashes: { sha1: 'x' }, downloads: ['ftp://nope'], fileSize: 1 }
          ]
        })
      )
    ).toThrow(/no download URL/)
  })

  it('rejects wrong format / game / missing minecraft version', () => {
    expect(() => parseMrpackIndex('not json')).toThrow(/not valid JSON/)
    expect(() => parseMrpackIndex(index({ formatVersion: 2 }))).toThrow(/formatVersion/)
    expect(() => parseMrpackIndex(index({ game: 'terraria' }))).toThrow(/not Minecraft/)
    expect(() => parseMrpackIndex(index({ dependencies: {} }))).toThrow(/Minecraft version/)
  })
})
