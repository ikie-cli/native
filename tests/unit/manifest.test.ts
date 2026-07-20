import { describe, expect, it } from 'vitest'
import { mergeVersionJson, parseManifest } from '../../src/main/core/manifest'
import type { VersionJson } from '../../src/main/core/mojang-types'

const rawManifest = {
  latest: { release: '1.21.4', snapshot: '25w03a' },
  versions: [
    { id: '25w03a', type: 'snapshot', url: 'https://x/25w03a.json', releaseTime: '2026-01-15T10:00:00+00:00' },
    { id: '1.21.4', type: 'release', url: 'https://x/1.21.4.json', releaseTime: '2024-12-03T10:12:57+00:00' },
    { id: 'b1.7.3', type: 'old_beta', url: 'https://x/b173.json', releaseTime: '2011-07-08T22:00:00+00:00' },
    { id: 'weird', type: 'experimental', url: 'https://x/w.json', releaseTime: '2020-01-01T00:00:00+00:00' }
  ]
}

describe('parseManifest', () => {
  it('parses latest + versions', () => {
    const m = parseManifest(structuredClone(rawManifest))
    expect(m.latest.release).toBe('1.21.4')
    expect(m.latest.snapshot).toBe('25w03a')
    expect(m.versions).toHaveLength(4)
    expect(m.versions[1]).toEqual({
      id: '1.21.4',
      type: 'release',
      releaseTime: '2024-12-03T10:12:57+00:00'
    })
  })

  it('coerces unknown version types to snapshot', () => {
    const m = parseManifest(structuredClone(rawManifest))
    expect(m.versions.find((v) => v.id === 'weird')?.type).toBe('snapshot')
  })

  it('preserves old_beta/old_alpha types', () => {
    const m = parseManifest(structuredClone(rawManifest))
    expect(m.versions.find((v) => v.id === 'b1.7.3')?.type).toBe('old_beta')
  })

  it('rejects malformed manifests', () => {
    expect(() => parseManifest(null as never)).toThrow(/Malformed/)
    expect(() => parseManifest({} as never)).toThrow(/Malformed/)
    expect(() =>
      parseManifest({ latest: { release: 'x', snapshot: 'y' }, versions: [{}] } as never)
    ).toThrow(/Malformed/)
    expect(() =>
      parseManifest({ latest: {}, versions: [] } as never)
    ).toThrow(/Malformed/)
  })
})

describe('mergeVersionJson (loader inheritance)', () => {
  const parent: VersionJson = {
    id: '1.20.1',
    type: 'release',
    mainClass: 'net.minecraft.client.main.Main',
    assetIndex: { id: '5', sha1: 'p', size: 10, url: 'http://assets' },
    javaVersion: { component: 'gamma', majorVersion: 17 },
    downloads: { client: { url: 'http://client.jar', sha1: 'c', size: 100 } },
    arguments: { game: ['--base'], jvm: ['-Dparent=1'] },
    libraries: [{ name: 'com.mojang:vanilla-lib:1' }]
  }
  const child: VersionJson = {
    id: 'fabric-loader-0.16.9-1.20.1',
    type: 'release',
    inheritsFrom: '1.20.1',
    mainClass: 'net.fabricmc.loader.impl.launch.knot.KnotClient',
    arguments: { game: ['--fabric'], jvm: ['-Dchild=1'] },
    libraries: [{ name: 'net.fabricmc:fabric-loader:0.16.9', url: 'https://maven.fabricmc.net/' }]
  }

  it('child mainClass wins', () => {
    const merged = mergeVersionJson(parent, child)
    expect(merged.mainClass).toBe('net.fabricmc.loader.impl.launch.knot.KnotClient')
  })

  it('inherits assetIndex/javaVersion/downloads from parent', () => {
    const merged = mergeVersionJson(parent, child)
    expect(merged.assetIndex?.id).toBe('5')
    expect(merged.javaVersion?.majorVersion).toBe(17)
    expect(merged.downloads?.client?.url).toBe('http://client.jar')
  })

  it('concatenates arguments parent-then-child', () => {
    const merged = mergeVersionJson(parent, child)
    expect(merged.arguments?.game).toEqual(['--base', '--fabric'])
    expect(merged.arguments?.jvm).toEqual(['-Dparent=1', '-Dchild=1'])
  })

  it('lists child libraries before parent libraries', () => {
    const merged = mergeVersionJson(parent, child)
    expect(merged.libraries[0].name).toBe('net.fabricmc:fabric-loader:0.16.9')
    expect(merged.libraries[1].name).toBe('com.mojang:vanilla-lib:1')
  })

  it('clears inheritsFrom on the merged result', () => {
    const merged = mergeVersionJson(parent, child)
    expect(merged.inheritsFrom).toBeUndefined()
  })

  it('keeps the child id', () => {
    const merged = mergeVersionJson(parent, child)
    expect(merged.id).toBe('fabric-loader-0.16.9-1.20.1')
  })
})
