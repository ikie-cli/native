import { describe, expect, it } from 'vitest'
import { formatUuid, offlineUuid, validOfflineName } from '../../src/main/services/auth'

describe('formatUuid', () => {
  it('inserts dashes into 32-char hex', () => {
    expect(formatUuid('069a79f444e94726a5befca90e38aaf5')).toBe(
      '069a79f4-44e9-4726-a5be-fca90e38aaf5'
    )
  })

  it('is idempotent on already-dashed uuids', () => {
    expect(formatUuid('069a79f4-44e9-4726-a5be-fca90e38aaf5')).toBe(
      '069a79f4-44e9-4726-a5be-fca90e38aaf5'
    )
  })

  it('passes through non-uuid strings unchanged', () => {
    expect(formatUuid('short')).toBe('short')
  })
})

describe('offlineUuid (vanilla OfflinePlayer derivation)', () => {
  it('produces stable md5("OfflinePlayer:"+name) UUIDv3 values', () => {
    // Golden values pin the algorithm (Java UUID.nameUUIDFromBytes semantics);
    // any change to hashing or bit-twiddling breaks singleplayer identity.
    expect(offlineUuid('Notch')).toBe('b50ad385-829d-3141-a216-7e7d7539ba7f')
    expect(offlineUuid('jeb_')).toBe('a762f560-4fce-3236-812a-b80efff0b62b')
  })

  it('is deterministic and case-sensitive', () => {
    expect(offlineUuid('Steve')).toBe(offlineUuid('Steve'))
    expect(offlineUuid('Steve')).not.toBe(offlineUuid('steve'))
  })

  it('sets UUID version 3 and IETF variant bits', () => {
    const u = offlineUuid('AnyName')
    expect(u[14]).toBe('3') // version nibble
    expect(['8', '9', 'a', 'b']).toContain(u[19]) // variant nibble
  })
})

describe('validOfflineName', () => {
  it('accepts 3–16 chars of letters/digits/underscore', () => {
    for (const n of ['abc', 'Steve', 'x_x', 'a1234567890123456'.slice(0, 16), 'CAPS_and_123']) {
      expect(validOfflineName(n), n).toBe(true)
    }
  })

  it('rejects invalid names', () => {
    for (const n of ['ab', '', 'seventeen_chars_x', 'has space', 'dash-name', 'émoji']) {
      expect(validOfflineName(n), n).toBe(false)
    }
  })
})
