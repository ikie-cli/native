import { describe, expect, it } from 'vitest'
import {
  formatBytes,
  formatCount,
  formatEta,
  formatPlaytime,
  formatSpeed,
  hashHue,
  timeAgo
} from '@/lib/util'

describe('formatBytes', () => {
  it('formats across unit boundaries', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(1048576)).toBe('1.0 MB')
    expect(formatBytes(5 * 1024 ** 3)).toBe('5.0 GB')
  })

  it('drops decimals at 3 digits', () => {
    expect(formatBytes(150 * 1024)).toBe('150 KB')
  })

  it('handles negatives and non-finite', () => {
    expect(formatBytes(-1)).toBe('—')
    expect(formatBytes(NaN)).toBe('—')
    expect(formatBytes(Infinity)).toBe('—')
  })
})

describe('formatSpeed / formatEta', () => {
  it('suffixes /s', () => {
    expect(formatSpeed(2 * 1024 * 1024)).toBe('2.0 MB/s')
  })

  it('renders seconds, minutes, hours', () => {
    expect(formatEta(42)).toBe('42s')
    expect(formatEta(90)).toBe('1m 30s')
    expect(formatEta(3660)).toBe('1h 1m')
  })

  it('renders — for unknown', () => {
    expect(formatEta(0)).toBe('—')
    expect(formatEta(-5)).toBe('—')
    expect(formatEta(NaN)).toBe('—')
  })
})

describe('formatCount', () => {
  it('abbreviates thousands and millions', () => {
    expect(formatCount(999)).toBe('999')
    expect(formatCount(1500)).toBe('1.5K')
    expect(formatCount(210_230_000)).toBe('210.2M')
  })
})

describe('timeAgo', () => {
  it('buckets human intervals', () => {
    const now = Date.now()
    expect(timeAgo(now - 2_000)).toBe('just now')
    expect(timeAgo(now - 49_000)).toBe('49 seconds ago')
    expect(timeAgo(now - 4 * 60_000)).toBe('4 minutes ago')
    expect(timeAgo(now - 60 * 60_000)).toBe('1 hour ago')
    expect(timeAgo(now - 3 * 3600_000)).toBe('3 hours ago')
    expect(timeAgo(now - 26 * 3600_000)).toBe('1 day ago')
  })

  it('accepts ISO strings', () => {
    expect(timeAgo(new Date(Date.now() - 120_000).toISOString())).toBe('2 minutes ago')
  })

  it('returns empty for garbage', () => {
    expect(timeAgo('not a date')).toBe('')
  })
})

describe('formatPlaytime', () => {
  it('scales from minutes to hours', () => {
    expect(formatPlaytime(30_000)).toBe('less than a minute')
    expect(formatPlaytime(5 * 60_000)).toBe('5 min')
    expect(formatPlaytime(2 * 3600_000)).toBe('2 hours')
    expect(formatPlaytime(2 * 3600_000 + 30 * 60_000)).toBe('2h 30m')
  })
})

describe('hashHue', () => {
  it('is deterministic and within 0..359', () => {
    expect(hashHue('Fabric 1.21')).toBe(hashHue('Fabric 1.21'))
    for (const s of ['a', 'b', 'Instance', '日本語', '']) {
      const h = hashHue(s)
      expect(h).toBeGreaterThanOrEqual(0)
      expect(h).toBeLessThan(360)
    }
  })
})
