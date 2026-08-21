import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useStreamStore } from './streamStore'
import type { FukanEvent } from '~/types/telemetry'

let scheduled: FrameRequestCallback | null = null

function event(ts: number, h3: string = '872830828ffffff'): FukanEvent {
  return {
    ts,
    id: 'abc',
    type: 'aircraft',
    callsign: 'TEST',
    origin: '',
    cat: '',
    lat: 377749000,
    lon: -1224194000,
    alt: 1000,
    spd: 100,
    hdg: 90,
    vr: 0,
    h3,
    src: 'test',
    squawk: '',
  }
}

function flushFrame(): void {
  const callback = scheduled
  scheduled = null
  callback?.(performance.now())
}

describe('streamStore', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      scheduled = callback
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', () => undefined)
    useStreamStore.getState().clearAll()
    scheduled = null
  })

  it('keeps the newest event when updates arrive out of order', () => {
    useStreamStore.getState().upsert(event(20))
    useStreamStore.getState().upsert(event(10))
    flushFrame()

    expect(useStreamStore.getState().aircraft.get('abc')?.ts).toBe(20)
  })

  it('does not replace a stored event with an older later delivery', () => {
    useStreamStore.getState().upsert(event(20))
    flushFrame()
    useStreamStore.getState().upsert(event(10))
    flushFrame()

    expect(useStreamStore.getState().aircraft.get('abc')?.ts).toBe(20)
  })

  it('normalizes legacy numeric H3 values from live broadcasts', () => {
    const legacy = event(10, 617700169958293500 as unknown as string)
    useStreamStore.getState().upsert(legacy)
    flushFrame()

    expect(typeof useStreamStore.getState().aircraft.get('abc')?.h3).toBe('string')
  })
})
