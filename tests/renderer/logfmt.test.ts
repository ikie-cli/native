import { describe, expect, it } from 'vitest'
import { parseLogLine, levelLabel } from '@/lib/logfmt'

describe('parseLogLine', () => {
  it('parses a standard Minecraft log line', () => {
    const p = parseLogLine('[12:34:56] [Render thread/INFO]: Loaded 7 mods')
    expect(p).toEqual({
      time: '12:34:56',
      thread: 'Render thread',
      message: 'Loaded 7 mods',
      isStackTrace: false
    })
  })

  it('parses WARN/ERROR levels and keeps the message', () => {
    expect(parseLogLine('[08:00:01] [main/WARN]: Missing texture: dirt').message).toBe(
      'Missing texture: dirt'
    )
    const err = parseLogLine('[08:00:02] [Netty Client IO/ERROR]: java.io.IOException')
    expect(err.thread).toBe('Netty Client IO')
    expect(err.message).toBe('java.io.IOException')
  })

  it('folds a secondary [minecraft/…] tag into the message', () => {
    const p = parseLogLine("[12:00:00] [Server thread/WARN] [minecraft/DedicatedServer]: Can't keep up!")
    expect(p.thread).toBe('Server thread')
    expect(p.message).toBe("[minecraft/DedicatedServer]: Can't keep up!")
  })

  it('handles a missing colon after the bracket', () => {
    const p = parseLogLine('[12:34:56] [main/INFO] hello')
    expect(p.message).toBe('hello')
  })

  it('flags stack-trace continuation lines', () => {
    for (const s of [
      '\tat net.minecraft.client.Main.main(Main.java:12)',
      '    at java.base/java.lang.Thread.run(Thread.java:840)',
      'Caused by: java.lang.NullPointerException',
      '\t... 14 more',
      '\tSuppressed: java.io.IOException'
    ]) {
      expect(parseLogLine(s).isStackTrace, s).toBe(true)
    }
  })

  it('falls back to raw for non-matching lines without dropping them', () => {
    const banner = '==== Fabric Loader 0.15.0 ===='
    const p = parseLogLine(banner)
    expect(p).toEqual({ time: null, thread: null, message: banner, isStackTrace: false })
  })

  it('never throws on empty or odd input', () => {
    expect(parseLogLine('').message).toBe('')
    expect(parseLogLine('[nonsense').isStackTrace).toBe(false)
  })
})

describe('levelLabel', () => {
  it('uppercases level names', () => {
    expect(levelLabel('info')).toBe('INFO')
    expect(levelLabel('warn')).toBe('WARN')
    expect(levelLabel('error')).toBe('ERROR')
    expect(levelLabel('debug')).toBe('DEBUG')
  })
})
