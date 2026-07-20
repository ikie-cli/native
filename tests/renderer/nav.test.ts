import { beforeEach, describe, expect, it } from 'vitest'
import { useNav, useModals } from '@/stores/nav'

function resetNav(): void {
  useNav.setState({ route: { name: 'home' }, stack: [{ name: 'home' }], index: 0 })
}

describe('nav store (history navigation)', () => {
  beforeEach(resetNav)

  it('starts at home with no history', () => {
    const s = useNav.getState()
    expect(s.route).toEqual({ name: 'home' })
    expect(s.canBack()).toBe(false)
    expect(s.canForward()).toBe(false)
  })

  it('pushes routes and navigates back/forward', () => {
    const s = useNav.getState()
    s.go({ name: 'library' })
    useNav.getState().go({ name: 'servers' })
    expect(useNav.getState().route).toEqual({ name: 'servers' })
    expect(useNav.getState().canBack()).toBe(true)

    useNav.getState().back()
    expect(useNav.getState().route).toEqual({ name: 'library' })
    expect(useNav.getState().canForward()).toBe(true)

    useNav.getState().forward()
    expect(useNav.getState().route).toEqual({ name: 'servers' })
  })

  it('going somewhere new truncates the forward stack', () => {
    useNav.getState().go({ name: 'library' })
    useNav.getState().go({ name: 'servers' })
    useNav.getState().back() // at library
    useNav.getState().go({ name: 'discover' })
    expect(useNav.getState().canForward()).toBe(false)
    expect(useNav.getState().stack.map((r) => r.name)).toEqual(['home', 'library', 'discover'])
  })

  it('ignores duplicate navigation to the identical route', () => {
    useNav.getState().go({ name: 'library' })
    const len = useNav.getState().stack.length
    useNav.getState().go({ name: 'library' })
    expect(useNav.getState().stack.length).toBe(len)
  })

  it('treats different instance tabs as distinct routes', () => {
    useNav.getState().go({ name: 'instance', id: 'i1', tab: 'content' })
    useNav.getState().go({ name: 'instance', id: 'i1', tab: 'logs' })
    expect(useNav.getState().stack.length).toBe(3)
    useNav.getState().back()
    expect(useNav.getState().route).toEqual({ name: 'instance', id: 'i1', tab: 'content' })
  })

  it('back at the root is a no-op', () => {
    useNav.getState().back()
    expect(useNav.getState().route).toEqual({ name: 'home' })
  })
})

describe('modal store', () => {
  it('toggles modal layers independently', () => {
    useModals.getState().setSettingsOpen(true)
    useModals.getState().setCreateOpen(true)
    expect(useModals.getState().settingsOpen).toBe(true)
    expect(useModals.getState().createOpen).toBe(true)
    useModals.getState().setSettingsOpen(false)
    expect(useModals.getState().settingsOpen).toBe(false)
    expect(useModals.getState().createOpen).toBe(true)
    useModals.getState().setCreateOpen(false)
  })
})
