import { getJson } from './http.ts'

export interface KevEntry {
  id: string
  name: string
  vendor: string
  product: string
  summary: string
  action: string
  dateAdded: string
}

interface Raw {
  vulnerabilities: {
    cveID: string
    vendorProject: string
    product: string
    vulnerabilityName: string
    dateAdded: string
    shortDescription: string
    requiredAction: string
  }[]
}

export const KEV_URL =
  'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json'

export async function fetchKev(): Promise<KevEntry[]> {
  const raw = await getJson<Raw>(KEV_URL)
  return raw.vulnerabilities.map(v => ({
    id: v.cveID,
    name: v.vulnerabilityName,
    vendor: v.vendorProject,
    product: v.product,
    summary: v.shortDescription,
    action: v.requiredAction,
    dateAdded: v.dateAdded,
  }))
}
