export type Severity = 'critical' | 'high' | 'medium'
export type Category = 'packages' | 'languages' | 'os' | 'ai' | 'tools'
export type ThreatType = 'bug' | 'worm' | 'virus' | 'trojan' | 'hacker'
export type TriageStatus = 'investigating' | 'patched' | 'not_affected' | 'ignored'

/** One vulnerability, merged from every source that mentions it. */
export interface Threat {
  id: string
  title: string
  summary: string
  cvss: number
  severity: Severity
  published: string
  product: string
  exploited: boolean
  category: Category
  threat: ThreatType
  eco: string | null
  pkg: string
  affected: string | null
  fixed: string | null
  kevAction: string | null
}

export interface FieldReport {
  lab: string
  key: string
  date: string
  title: string
  summary: string
  cves: string[]
  url: string
}

/** What a Sweep publishes. `sample` is true for the seed fixtures shipped before the first Sweep. */
export interface Dataset<T> {
  sample: boolean
  collectedAt: string | null
  items: T[]
}

export interface SourceItem {
  name: string
  url: string
  host: string
}

export interface SourceGroup {
  name: string
  desc: string
  color: string
  icon: 'gov' | 'vendor' | 'db' | 'secvendor' | 'news'
  items: SourceItem[]
}

export interface CatalogEntry {
  label: string
  kind: string
}
