import { describe, expect, it } from 'vitest'
import { pickUpdate } from '../../src/main/core/updates'

const v = (id: string, date: string): { id: string; datePublished: string } => ({
  id,
  datePublished: date
})

describe('pickUpdate', () => {
  it('returns null when the installed version is the newest', () => {
    expect(
      pickUpdate('b', [v('b', '2025-02-01T00:00:00Z'), v('a', '2025-01-01T00:00:00Z')])
    ).toBeNull()
  })

  it('offers the newest version when a newer one exists', () => {
    const versions = [v('c', '2025-03-01T00:00:00Z'), v('b', '2025-02-01T00:00:00Z')]
    expect(pickUpdate('b', versions)?.id).toBe('c')
  })

  it('sorts by publish date instead of trusting API order', () => {
    const versions = [v('old', '2024-01-01T00:00:00Z'), v('new', '2025-06-01T00:00:00Z')]
    expect(pickUpdate('old', versions)?.id).toBe('new')
    expect(pickUpdate('new', versions)).toBeNull()
  })

  it('offers the newest compatible build when the installed one is filtered out', () => {
    // e.g. the instance moved to a newer MC version; the installed version no
    // longer appears in the compatible list
    const versions = [v('c', '2025-03-01T00:00:00Z')]
    expect(pickUpdate('a', versions)?.id).toBe('c')
  })

  it('never updates to an older version', () => {
    const versions = [v('older', '2024-01-01T00:00:00Z'), v('installed', '2025-01-01T00:00:00Z')]
    expect(pickUpdate('installed', versions)).toBeNull()
  })

  it('handles empty/unknown inputs', () => {
    expect(pickUpdate('a', [])).toBeNull()
    expect(pickUpdate(null, [v('a', '2025-01-01T00:00:00Z')])).toBeNull()
  })
})
