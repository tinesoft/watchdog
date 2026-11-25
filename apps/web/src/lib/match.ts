import type { Threat } from './types'

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** A Stack term matches as a whole word in the title, product or package. */
export function isMine(
  t: Pick<Threat, 'title' | 'product' | 'pkg'>,
  stack: readonly string[],
): boolean {
  const hay = `${t.title} ${t.product} ${t.pkg}`.toLowerCase()
  return stack.some(term =>
    new RegExp(`(^|[^\\w.])${escape(term.toLowerCase())}($|[^\\w])`).test(hay),
  )
}
