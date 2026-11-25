import type { Threat } from './types'

const byVersion = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true })

/** The install command that moves to the highest fixed version, or '' when there is no package manager. */
export function fixCommand(t: Pick<Threat, 'eco' | 'pkg' | 'fixed'>): string {
  const versions = String(t.fixed ?? '').match(/\d+(\.\d+)+/g)
  if (!versions || !t.eco) return ''
  const fixed = [...versions].sort(byVersion).at(-1)
  if (!fixed) return ''
  switch (t.eco) {
    case 'npm':
      return `npm install ${t.pkg}@${fixed}`
    case 'PyPI':
      return `pip install ${t.pkg}==${fixed}`
    case 'Maven':
      return `implementation("${t.pkg}:${fixed}")`
    case 'Go':
      return `go mod edit -toolchain=go${fixed}`
    default:
      return ''
  }
}
