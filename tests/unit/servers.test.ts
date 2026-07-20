import { describe, expect, it } from 'vitest'
import {
  motdToText,
  parseAddress,
  readVarInt,
  writeVarInt
} from '../../src/main/services/servers'

describe('VarInt codec (SLP protocol)', () => {
  it('round-trips boundary values', () => {
    for (const v of [0, 1, 127, 128, 255, 300, 25565, 2097151, 2147483647]) {
      const buf = writeVarInt(v)
      const back = readVarInt(buf, 0)
      expect(back.value, `value ${v}`).toBe(v)
      expect(back.size).toBe(buf.length)
    }
  })

  it('encodes small values as a single byte', () => {
    expect(writeVarInt(0)).toEqual(Buffer.from([0]))
    expect(writeVarInt(127)).toEqual(Buffer.from([127]))
    expect(writeVarInt(128).length).toBe(2)
  })

  it('reads at an offset', () => {
    const buf = Buffer.concat([Buffer.from([0xff]), writeVarInt(300)])
    expect(readVarInt(buf, 1).value).toBe(300)
  })

  it('throws RangeError when bytes are missing (partial frame)', () => {
    expect(() => readVarInt(Buffer.from([0x80]), 0)).toThrow(RangeError)
    expect(() => readVarInt(Buffer.alloc(0), 0)).toThrow(RangeError)
  })
})

describe('parseAddress', () => {
  it('defaults to port 25565', () => {
    expect(parseAddress('mc.hypixel.net')).toEqual({ host: 'mc.hypixel.net', port: 25565 })
  })

  it('parses explicit ports', () => {
    expect(parseAddress('play.example.com:25566')).toEqual({ host: 'play.example.com', port: 25566 })
    expect(parseAddress(' localhost:1234 ')).toEqual({ host: 'localhost', port: 1234 })
  })

  it('rejects out-of-range ports', () => {
    expect(() => parseAddress('host:0')).toThrow(/Invalid port/)
    expect(() => parseAddress('host:70000')).toThrow(/Invalid port/)
  })
})

describe('motdToText', () => {
  it('strips § formatting codes from plain strings', () => {
    expect(motdToText('§aHypixel §cNetwork §7[1.8-1.21]')).toBe('Hypixel Network [1.8-1.21]')
  })

  it('flattens chat components with extra arrays', () => {
    expect(
      motdToText({
        text: 'Welcome ',
        extra: [{ text: '§bto ' }, { text: 'the server', extra: [{ text: '!' }] }]
      })
    ).toBe('Welcome to the server!')
  })

  it('handles null/undefined/odd shapes', () => {
    expect(motdToText(null)).toBe('')
    expect(motdToText(undefined)).toBe('')
    expect(motdToText(42)).toBe('')
  })
})
