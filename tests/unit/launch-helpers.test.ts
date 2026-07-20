import { describe, expect, it } from 'vitest'
import { splitArgs } from '../../src/main/core/launch'
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
