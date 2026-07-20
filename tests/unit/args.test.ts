import { describe, expect, it } from 'vitest'
import {
  buildCommand,
  classpathSeparator,
  normalizeMemory,
  supportsQuickPlay,
  type LaunchSpec
} from '../../src/main/core/args'
import type { VersionJson } from '../../src/main/core/mojang-types'
import type { RuleContext } from '../../src/main/core/rules'

const linux: RuleContext = { osName: 'linux', osArch: 'x64', features: {} }
const windows: RuleContext = { osName: 'windows', osArch: 'x64', features: {} }

function modernVersion(): VersionJson {
  return {
    id: '1.21.4',
    type: 'release',
    mainClass: 'net.minecraft.client.main.Main',
    assetIndex: { id: '19', sha1: 'x', size: 1, url: 'http://x' },
    javaVersion: { component: 'java-runtime-delta', majorVersion: 21 },
    libraries: [],
    arguments: {
      jvm: [
        { rules: [{ action: 'allow', os: { name: 'windows' } }], value: '-XX:HeapDumpPath=win' },
        '-Djava.library.path=${natives_directory}',
        '-cp',
        '${classpath}'
      ],
      game: [
        '--username',
        '${auth_player_name}',
        '--version',
        '${version_name}',
        '--gameDir',
        '${game_directory}',
        '--assetsDir',
        '${assets_root}',
        '--assetIndex',
        '${assets_index_name}',
        '--uuid',
        '${auth_uuid}',
        '--accessToken',
        '${auth_access_token}',
        {
          rules: [{ action: 'allow', features: { is_demo_user: true } }],
          value: '--demo'
        },
        {
          rules: [{ action: 'allow', features: { has_custom_resolution: true } }],
          value: ['--width', '${resolution_width}', '--height', '${resolution_height}']
        },
        {
          rules: [{ action: 'allow', features: { is_quick_play_multiplayer: true } }],
          value: ['--quickPlayMultiplayer', '${quickPlayMultiplayer}']
        }
      ]
    }
  }
}

function legacyVersion(): VersionJson {
  return {
    id: '1.8.9',
    type: 'release',
    mainClass: 'net.minecraft.client.main.Main',
    assets: 'legacy',
    libraries: [],
    minecraftArguments:
      '--username ${auth_player_name} --version ${version_name} --gameDir ${game_directory} --assetsDir ${game_assets} --uuid ${auth_uuid} --accessToken ${auth_access_token} --userProperties ${user_properties}'
  }
}

function spec(version: VersionJson, overrides: Partial<LaunchSpec> = {}): LaunchSpec {
  return {
    version,
    versionId: version.id,
    gameDir: '/data/instances/i1/minecraft',
    assetsDir: '/data/assets',
    nativesDir: '/data/natives/x',
    librariesDir: '/data/libraries',
    classpath: ['/lib/a.jar', '/lib/b.jar', '/versions/1.21.4/1.21.4.jar'],
    memMinMB: 512,
    memMaxMB: 4096,
    extraJvmArgs: [],
    account: { name: 'Steve', uuid: 'u-u-i-d', accessToken: 'tok', type: 'msa', xuid: '123' },
    launcherName: 'Native',
    launcherVersion: '0.1.0',
    os: linux,
    ...overrides
  }
}

describe('buildCommand — modern versions', () => {
  it('places memory flags first and mainClass between jvm and game args', () => {
    const cmd = buildCommand(spec(modernVersion()))
    expect(cmd.jvm[0]).toBe('-Xms512M')
    expect(cmd.jvm[1]).toBe('-Xmx4096M')
    const mainIdx = cmd.all.indexOf('net.minecraft.client.main.Main')
    expect(mainIdx).toBeGreaterThan(1)
    expect(cmd.all.slice(mainIdx + 1)).toEqual(cmd.game)
  })

  it('substitutes auth/game variables', () => {
    const cmd = buildCommand(spec(modernVersion()))
    expect(cmd.game).toContain('Steve')
    expect(cmd.game).toContain('tok')
    expect(cmd.game).toContain('/data/instances/i1/minecraft')
    expect(cmd.game).toContain('19') // asset index id
  })

  it('joins classpath with ":" on linux and ";" on windows', () => {
    const linuxCmd = buildCommand(spec(modernVersion()))
    const cpIdx = linuxCmd.jvm.indexOf('-cp')
    expect(linuxCmd.jvm[cpIdx + 1]).toBe('/lib/a.jar:/lib/b.jar:/versions/1.21.4/1.21.4.jar')

    const winCmd = buildCommand(spec(modernVersion(), { os: windows }))
    const winCpIdx = winCmd.jvm.indexOf('-cp')
    expect(winCmd.jvm[winCpIdx + 1]).toBe('/lib/a.jar;/lib/b.jar;/versions/1.21.4/1.21.4.jar')
    expect(classpathSeparator('windows')).toBe(';')
    expect(classpathSeparator('linux')).toBe(':')
  })

  it('applies os-gated jvm args (windows-only arg excluded on linux)', () => {
    const linuxCmd = buildCommand(spec(modernVersion()))
    expect(linuxCmd.jvm).not.toContain('-XX:HeapDumpPath=win')
    const winCmd = buildCommand(spec(modernVersion(), { os: windows }))
    expect(winCmd.jvm).toContain('-XX:HeapDumpPath=win')
  })

  it('emits resolution args only when a resolution is set', () => {
    const noRes = buildCommand(spec(modernVersion()))
    expect(noRes.game).not.toContain('--width')
    const withRes = buildCommand(spec(modernVersion(), { resolution: { width: 1280, height: 720 } }))
    const wIdx = withRes.game.indexOf('--width')
    expect(wIdx).toBeGreaterThan(-1)
    expect(withRes.game[wIdx + 1]).toBe('1280')
    expect(withRes.game[withRes.game.indexOf('--height') + 1]).toBe('720')
  })

  it('uses quickPlayMultiplayer for servers when supported', () => {
    const cmd = buildCommand(spec(modernVersion(), { server: { host: 'mc.example.com', port: 25565 } }))
    const qIdx = cmd.game.indexOf('--quickPlayMultiplayer')
    expect(qIdx).toBeGreaterThan(-1)
    expect(cmd.game[qIdx + 1]).toBe('mc.example.com:25565')
    expect(cmd.game).not.toContain('--server')
  })

  it('always hardens log4j', () => {
    const cmd = buildCommand(spec(modernVersion()))
    expect(cmd.jvm).toContain('-Dlog4j2.formatMsgNoLookups=true')
  })

  it('appends extra jvm args after defaults', () => {
    const cmd = buildCommand(spec(modernVersion(), { extraJvmArgs: ['-XX:+UseG1GC'] }))
    expect(cmd.jvm[cmd.jvm.length - 1]).toBe('-XX:+UseG1GC')
  })

  it('never emits --demo for non-demo accounts', () => {
    const cmd = buildCommand(spec(modernVersion()))
    expect(cmd.game).not.toContain('--demo')
    const demo = buildCommand(spec(modernVersion(), { demo: true }))
    expect(demo.game).toContain('--demo')
  })
})

describe('buildCommand — legacy versions', () => {
  it('parses minecraftArguments and supplies classic jvm scaffold', () => {
    const cmd = buildCommand(spec(legacyVersion()))
    expect(cmd.jvm).toContain('-Djava.library.path=/data/natives/x')
    expect(cmd.jvm).toContain('-cp')
    expect(cmd.game).toContain('Steve')
    expect(cmd.game).toContain('{}') // user_properties
  })

  it('falls back to --server/--port for servers without quickplay', () => {
    const cmd = buildCommand(spec(legacyVersion(), { server: { host: 'play.x.net', port: 25566 } }))
    expect(cmd.game).toContain('--server')
    expect(cmd.game[cmd.game.indexOf('--server') + 1]).toBe('play.x.net')
    expect(cmd.game[cmd.game.indexOf('--port') + 1]).toBe('25566')
  })

  it('supportsQuickPlay distinguishes the formats', () => {
    expect(supportsQuickPlay(modernVersion())).toBe(true)
    expect(supportsQuickPlay(legacyVersion())).toBe(false)
  })
})

describe('normalizeMemory (RAM math)', () => {
  it('passes through sane values', () => {
    expect(normalizeMemory(512, 4096, 16384)).toEqual({ minMB: 512, maxMB: 4096 })
  })

  it('clamps max to system total minus 1GB headroom', () => {
    expect(normalizeMemory(512, 32768, 8192)).toEqual({ minMB: 512, maxMB: 7168 })
  })

  it('enforces a 256MB floor', () => {
    expect(normalizeMemory(0, 100, 16384)).toEqual({ minMB: 256, maxMB: 256 })
  })

  it('swaps min/max when inverted', () => {
    const r = normalizeMemory(8192, 1024, 16384)
    expect(r.minMB).toBeLessThanOrEqual(r.maxMB)
  })

  it('handles NaN/Infinity without exploding', () => {
    const r = normalizeMemory(NaN, Infinity, 16384)
    expect(Number.isFinite(r.minMB)).toBe(true)
    expect(Number.isFinite(r.maxMB)).toBe(true)
    expect(r.minMB).toBeGreaterThanOrEqual(256)
    expect(r.maxMB).toBeLessThanOrEqual(15360)
  })

  it('never exceeds the ceiling even on tiny systems', () => {
    const r = normalizeMemory(512, 4096, 1024)
    expect(r.maxMB).toBeLessThanOrEqual(Math.max(256, 1024 - 1024))
  })
})
