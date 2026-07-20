import { describe, expect, it } from 'vitest'
import { guessJavaMajor, parseJavaVersion } from '../../src/main/core/java'

describe('parseJavaVersion', () => {
  it('parses legacy 1.8 format', () => {
    const out = 'java version "1.8.0_392"\nJava(TM) SE Runtime Environment'
    expect(parseJavaVersion(out)).toEqual({ version: '1.8.0_392', major: 8 })
  })

  it('parses modern versions', () => {
    expect(parseJavaVersion('openjdk version "17.0.10" 2024-01-16')).toEqual({
      version: '17.0.10',
      major: 17
    })
    expect(parseJavaVersion('openjdk version "21.0.5" 2024-10-15 LTS')).toEqual({
      version: '21.0.5',
      major: 21
    })
    expect(parseJavaVersion('openjdk version "25.0.3" 2026-04-21 LTS')?.major).toBe(25)
  })

  it('returns null on garbage', () => {
    expect(parseJavaVersion('command not found')).toBeNull()
    expect(parseJavaVersion('')).toBeNull()
  })
})

describe('guessJavaMajor (auto-matching 8/17/21)', () => {
  it('maps legacy versions to Java 8', () => {
    for (const v of ['1.8.9', '1.12.2', '1.16.5', '1.7.10']) {
      expect(guessJavaMajor(v), v).toBe(8)
    }
  })

  it('maps 1.17–1.20.4 to Java 17', () => {
    for (const v of ['1.17', '1.17.1', '1.18.2', '1.19.4', '1.20', '1.20.4']) {
      expect(guessJavaMajor(v), v).toBe(17)
    }
  })

  it('maps 1.20.5+ and 1.21+ to Java 21', () => {
    for (const v of ['1.20.5', '1.20.6', '1.21', '1.21.4', '1.22']) {
      expect(guessJavaMajor(v), v).toBe(21)
    }
  })

  it('defaults unknown formats to 21 (snapshots etc.)', () => {
    expect(guessJavaMajor('25w03a')).toBe(21)
    expect(guessJavaMajor('garbage')).toBe(21)
  })
})
