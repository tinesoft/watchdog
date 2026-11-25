/** What one Source says about one CVE, before the Sweep merges it into a Threat. */
export interface Candidate {
  id: string
  source: string
  title?: string
  summary?: string
  cvss?: number
  published?: string
  product?: string
  eco?: string
  pkg?: string
  affected?: string
  fixed?: string
  cwes?: string[]
}
