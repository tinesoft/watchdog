const UA = 'watchdog-sweep (+https://github.com/tinesoft/watchdog)'
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

interface Opts {
  headers?: Record<string, string>
  retries?: number
  timeoutMs?: number
  /** Extra statuses that mean "slow down" for this Source, such as NVD's 403. */
  retryOn?: number[]
  /** First backoff when the answer carries no Retry-After. It doubles each attempt. */
  backoffMs?: number
  fetchImpl?: typeof fetch
}

/** GET with a timeout and bounded retries on network errors, 429, 5xx and `retryOn`. */
export async function get(
  url: string,
  {
    headers = {},
    retries = 2,
    timeoutMs = 45_000,
    retryOn = [],
    backoffMs = 2000,
    fetchImpl = fetch,
  }: Opts = {},
): Promise<Response> {
  let last: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchImpl(url, {
        headers: { 'user-agent': UA, accept: '*/*', ...headers },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'follow',
      })
      if (res.ok) return res
      last = new Error(`${url} answered ${res.status}`)
      if (res.status !== 429 && res.status < 500 && !retryOn.includes(res.status)) break
      const wait = Number(res.headers.get('retry-after'))
      await sleep(
        Math.min(
          Number.isFinite(wait) && wait > 0 ? wait * 1000 : backoffMs * 2 ** attempt,
          60_000,
        ),
      )
    } catch (err) {
      last = err
      await sleep(backoffMs * 0.75 * 2 ** attempt)
    }
  }
  throw last instanceof Error ? last : new Error(String(last))
}

export const getJson = async <T>(url: string, opts?: Opts): Promise<T> =>
  (await get(url, opts)).json() as Promise<T>
export const getText = async (url: string, opts?: Opts): Promise<string> =>
  (await get(url, opts)).text()
