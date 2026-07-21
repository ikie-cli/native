import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { safeRelPath, TEXT_PREVIEW_RE } from '../../src/main/services/files'

describe('safeRelPath (instance file browser path guard)', () => {
  it('accepts the root as empty string or "."', () => {
    expect(safeRelPath('')).toBe('')
    expect(safeRelPath('.')).toBe('')
  })

  it('accepts plain relative paths and normalizes separators', () => {
    expect(safeRelPath('options.txt')).toBe('options.txt')
    expect(safeRelPath('config/foo.toml')).toBe(join('config', 'foo.toml'))
    expect(safeRelPath('saves/')).toBe('saves')
  })

  it('rejects parent traversal in any position', () => {
    expect(safeRelPath('..')).toBeNull()
    expect(safeRelPath('../x')).toBeNull()
    expect(safeRelPath('a/../../b')).toBeNull()
    expect(safeRelPath('config/../../escape')).toBeNull()
  })

  it('rejects absolute and drive-prefixed paths', () => {
    expect(safeRelPath('/etc/passwd')).toBeNull()
    expect(safeRelPath('C:\\Windows')).toBeNull()
    expect(safeRelPath('c:evil')).toBeNull()
  })

  it('collapses inner ./ segments without rejecting them', () => {
    expect(safeRelPath('config/./mod.cfg')).toBe(join('config', 'mod.cfg'))
  })
})

describe('TEXT_PREVIEW_RE (preview allow-list)', () => {
  it('matches previewable extensions case-insensitively', () => {
    for (const n of ['a.txt', 'b.JSON', 'server.properties', 'c.toml', 'latest.log', 'd.yml', 'e.cfg']) {
      expect(TEXT_PREVIEW_RE.test(n), n).toBe(true)
    }
  })

  it('does not match binaries or archives', () => {
    for (const n of ['mod.jar', 'pack.zip', 'icon.png', 'level.dat', 'noext']) {
      expect(TEXT_PREVIEW_RE.test(n), n).toBe(false)
    }
  })
})
