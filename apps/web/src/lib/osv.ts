import type { Dep } from './scan'

const ENDPOINT = 'https://api.osv.dev/v1/querybatch'
const CHUNK = 500

export interface OsvHit {
  dep: Dep
  ids: string[]
}

/**
 * The only request watchdog makes to another origin, and only when the user ticks "Check with OSV.dev".
 * It sends package names, ecosystems and versions: nothing else.
 */
export async function queryOsv(deps: Dep[], fetchFn: typeof fetch = fetch): Promise<OsvHit[]> {
  const hits: OsvHit[] = []
  for (let i = 0; i < deps.length; i += CHUNK) {
    const slice = deps.slice(i, i + CHUNK)
    const res = await fetchFn(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        queries: slice.map(d => ({
          package: { name: d.name, ecosystem: d.eco },
          version: d.version,
        })),
      }),
    })
    if (!res.ok) throw new Error(`OSV answered ${res.status}`)
    const json = (await res.json()) as { results?: { vulns?: { id: string }[] }[] }
    slice.forEach((dep, j) => {
      const ids = (json.results?.[j]?.vulns ?? []).map(v => v.id)
      if (ids.length) hits.push({ dep, ids })
    })
  }
  return hits
}
