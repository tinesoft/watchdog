export interface Debounced {
  (): void
  /** Runs the pending call now; does nothing when none is pending. */
  flush(): void
  /** Drops the pending call. */
  cancel(): void
}

/** Calls `fn` once, `ms` after the last of a burst of calls (trailing edge only). */
export function debounce(fn: () => void, ms: number): Debounced {
  let timer: ReturnType<typeof setTimeout> | undefined
  const cancel = () => {
    clearTimeout(timer)
    timer = undefined
  }
  const run = () => {
    cancel()
    fn()
  }
  return Object.assign(
    () => {
      clearTimeout(timer)
      timer = setTimeout(run, ms)
    },
    { flush: () => timer !== undefined && run(), cancel },
  )
}
