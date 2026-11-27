/** Knobs of the Sweep. The plan's data window lives here. */
export const WINDOW_DAYS = 90
export const MIN_CVSS = 7
/**
 * NVD supplies new Threats only for the last month's critical CVEs, scored by NVD or by the CVE's
 * assigner. That was about 1,600 in Nov 2026 (about 390 KB gzipped in all). The cap is a safety net
 * for SIZE_BUDGET_GZ, not a filter: when it bites, the highest scores and newest CVEs win.
 */
export const NVD_CRITICAL_DAYS = 30
export const NVD_CAP = 2500
/** Per-CVE NVD lookups per Sweep, for Threats that KEV or GitHub reported without a score. */
export const NVD_LOOKUP_CAP = Number(process.env.NVD_LOOKUP_CAP ?? 25)
export const REPORT_DAYS = 21
export const REPORTS_PER_LAB = 12
export const SIZE_BUDGET_GZ = 1_000_000
export const SITE = 'https://tinesoft.github.io/watchdog'
