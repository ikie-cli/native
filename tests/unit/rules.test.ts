import { describe, expect, it } from 'vitest'
import {
  mavenToPath,
  resolveArgs,
  rulesAllow,
  substitute,
  type RuleContext
} from '../../src/main/core/rules'
import type { OsRule } from '../../src/main/core/mojang-types'

const linux: RuleContext = { osName: 'linux', osArch: 'x64', features: {} }
const windows: RuleContext = { osName: 'windows', osArch: 'x64', features: {} }
const osx: RuleContext = { osName: 'osx', osArch: 'arm64', features: {} }

describe('rulesAllow', () => {
  it('allows when no rules exist', () => {
    expect(rulesAllow(undefined, linux)).toBe(true)
    expect(rulesAllow([], linux)).toBe(true)
  })

  it('defaults to deny when rules exist but none match', () => {
    const rules: OsRule[] = [{ action: 'allow', os: { name: 'osx' } }]
    expect(rulesAllow(rules, linux)).toBe(false)
    expect(rulesAllow(rules, osx)).toBe(true)
  })

  it('applies last matching rule (allow-all then disallow-osx)', () => {
    const rules: OsRule[] = [
      { action: 'allow' },
      { action: 'disallow', os: { name: 'osx' } }
    ]
    expect(rulesAllow(rules, linux)).toBe(true)
    expect(rulesAllow(rules, windows)).toBe(true)
    expect(rulesAllow(rules, osx)).toBe(false)
  })

  it('matches os arch', () => {
    const rules: OsRule[] = [{ action: 'allow', os: { arch: 'x86' } }]
    expect(rulesAllow(rules, { ...windows, osArch: 'x86' })).toBe(true)
    expect(rulesAllow(rules, windows)).toBe(false)
  })

  it('matches os version regex', () => {
    const rules: OsRule[] = [{ action: 'allow', os: { name: 'windows', version: '^10\\.' } }]
    expect(rulesAllow(rules, { ...windows, osVersion: '10.0.19045' })).toBe(true)
    expect(rulesAllow(rules, { ...windows, osVersion: '6.1.7601' })).toBe(false)
  })

  it('matches feature flags exactly', () => {
    const rules: OsRule[] = [{ action: 'allow', features: { is_demo_user: true } }]
    expect(rulesAllow(rules, { ...linux, features: { is_demo_user: true } })).toBe(true)
    expect(rulesAllow(rules, { ...linux, features: { is_demo_user: false } })).toBe(false)
    expect(rulesAllow(rules, linux)).toBe(false) // missing => false
  })
})

describe('resolveArgs', () => {
  it('passes through plain strings and applies rules to conditionals', () => {
    const args = resolveArgs(
      [
        '--username',
        { rules: [{ action: 'allow', os: { name: 'windows' } }], value: '-Dwin=1' },
        { rules: [{ action: 'allow', os: { name: 'linux' } }], value: ['-Da=1', '-Db=2'] }
      ],
      linux
    )
    expect(args).toEqual(['--username', '-Da=1', '-Db=2'])
  })

  it('returns empty for undefined', () => {
    expect(resolveArgs(undefined, linux)).toEqual([])
  })
})

describe('substitute', () => {
  it('replaces ${var} template placeholders', () => {
    expect(substitute(['--name', '${auth_player_name}'], { auth_player_name: 'Steve' })).toEqual([
      '--name',
      'Steve'
    ])
  })

  it('resolves unknown vars to empty string', () => {
    expect(substitute(['${nope}'], {})).toEqual([''])
  })

  it('handles multiple placeholders in one arg', () => {
    expect(substitute(['${a}-${b}'], { a: 'x', b: 'y' })).toEqual(['x-y'])
  })
})

describe('mavenToPath', () => {
  it('converts a plain coordinate', () => {
    expect(mavenToPath('org.ow2.asm:asm:9.7')).toBe('org/ow2/asm/asm/9.7/asm-9.7.jar')
  })

  it('converts a coordinate with classifier', () => {
    expect(mavenToPath('org.lwjgl:lwjgl:3.3.3:natives-linux')).toBe(
      'org/lwjgl/lwjgl/3.3.3/lwjgl-3.3.3-natives-linux.jar'
    )
  })

  it('honors @ext extensions', () => {
    expect(mavenToPath('net.minecraftforge:forge:1.20.1-47.2.0:universal@zip')).toBe(
      'net/minecraftforge/forge/1.20.1-47.2.0/forge-1.20.1-47.2.0-universal.zip'
    )
  })

  it('throws on malformed coordinates', () => {
    expect(() => mavenToPath('justone:two')).toThrow(/bad maven coordinate/)
  })
})
