import { describe, expect, it } from 'vitest'
import { isServerDisconnectLog, serverAddressFromLog, splitArgs } from '../../src/main/core/launch'
import { uniqueName } from '../../src/main/services/instances'

describe('splitArgs (JVM args field parsing)', () => {
  it('splits on whitespace', () => {
    expect(splitArgs('-XX:+UseG1GC -Xss4M')).toEqual(['-XX:+UseG1GC', '-Xss4M'])
  })

  it('treats fully-quoted tokens as one argument', () => {
    expect(splitArgs('"/with space/dir" -Da=1')).toEqual(['/with space/dir', '-Da=1'])
  })

  it('respects single quotes', () => {
    expect(splitArgs("'-Dname=two words' -Db=2")).toEqual(['-Dname=two words', '-Db=2'])
  })

  it('returns empty for empty/whitespace input', () => {
    expect(splitArgs('')).toEqual([])
    expect(splitArgs('   ')).toEqual([])
  })
})

describe('uniqueName (duplicate naming)', () => {
  it('returns base when unused', () => {
    expect(uniqueName('Fabric 1.21', [])).toBe('Fabric 1.21')
  })

  it('suffixes with 2, then 3...', () => {
    expect(uniqueName('Copy', ['Copy'])).toBe('Copy 2')
    expect(uniqueName('Copy', ['Copy', 'Copy 2'])).toBe('Copy 3')
  })
})

describe('multiplayer log detection', () => {
  it('extracts current and legacy server connection formats', () => {
    expect(
      serverAddressFromLog('[Render thread/INFO]: Connecting to play.example.net, 25565')
    ).toBe('play.example.net')
    expect(serverAddressFromLog('[Client thread/INFO]: Connecting to localhost:25566')).toBe(
      'localhost:25566'
    )
    expect(serverAddressFromLog('Connecting to example.net/192.0.2.4, 25565')).toBe('example.net')
    expect(serverAddressFromLog('Connecting to [2001:db8::1], 25565')).toBe('[2001:db8::1]')
  })

  it('ignores invalid ports and recognizes disconnect messages', () => {
    expect(serverAddressFromLog('Connecting to example.net, 99999')).toBeNull()
    expect(serverAddressFromLog('[CHAT] Connecting to my friends later')).toBeNull()
    expect(isServerDisconnectLog('[Render thread/INFO]: Disconnecting from server')).toBe(true)
    expect(isServerDisconnectLog('[Render thread/WARN]: Connection reset')).toBe(true)
  })
})
