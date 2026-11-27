import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { debounce } from '../src/lib/debounce'

describe('debounce', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('merges a burst of calls into one, after the wait', () => {
    const fn = vi.fn()
    const d = debounce(fn, 150)
    d()
    vi.advanceTimersByTime(100)
    d()
    vi.advanceTimersByTime(100)
    d()
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(150)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('flush runs the pending call now, and only once', () => {
    const fn = vi.fn()
    const d = debounce(fn, 150)
    d()
    d.flush()
    expect(fn).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(300)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('flush does nothing when no call is pending', () => {
    const fn = vi.fn()
    debounce(fn, 150).flush()
    expect(fn).not.toHaveBeenCalled()
  })

  it('cancel drops the pending call', () => {
    const fn = vi.fn()
    const d = debounce(fn, 150)
    d()
    d.cancel()
    vi.advanceTimersByTime(300)
    expect(fn).not.toHaveBeenCalled()
  })
})
