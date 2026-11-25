import type { Category, Severity, ThreatType } from '../../src/lib/types.ts'

export const severityOf = (cvss: number): Severity =>
  cvss >= 9 ? 'critical' : cvss >= 7 ? 'high' : 'medium'

const CWE: Record<string, ThreatType> = {
  'CWE-506': 'trojan',
  'CWE-912': 'trojan',
  'CWE-1357': 'trojan',
  'CWE-400': 'worm',
  'CWE-770': 'worm',
  'CWE-834': 'worm',
  'CWE-674': 'worm',
  'CWE-78': 'virus',
  'CWE-77': 'virus',
  'CWE-94': 'virus',
  'CWE-95': 'virus',
  'CWE-502': 'virus',
  'CWE-787': 'virus',
  'CWE-416': 'virus',
  'CWE-119': 'virus',
  'CWE-120': 'virus',
  'CWE-122': 'virus',
  'CWE-121': 'virus',
  'CWE-190': 'virus',
  'CWE-1321': 'virus',
  'CWE-287': 'hacker',
  'CWE-862': 'hacker',
  'CWE-863': 'hacker',
  'CWE-306': 'hacker',
  'CWE-269': 'hacker',
  'CWE-89': 'hacker',
  'CWE-79': 'hacker',
  'CWE-918': 'hacker',
  'CWE-22': 'hacker',
  'CWE-200': 'hacker',
  'CWE-352': 'hacker',
  'CWE-639': 'hacker',
}

const KEYWORDS: [ThreatType, RegExp][] = [
  [
    'trojan',
    /backdoor|malicious (package|code|release)|supply[- ]chain|compromised (release|package)|typosquat/i,
  ],
  [
    'worm',
    /wormable|denial[- ]of[- ]service|\bdos\b|resource exhaustion|flood|rapid reset|infinite loop/i,
  ],
  [
    'virus',
    /remote code execution|\brce\b|command injection|code injection|arbitrary (code|command)|deserializ|buffer overflow|memory corruption|use[- ]after[- ]free|heap[- ]based|out-of-bounds write/i,
  ],
  [
    'hacker',
    /authentication bypass|auth(entication|orization) (bypass|flaw)|privilege escalation|prompt injection|sql injection|cross-site|\bxss\b|\bssrf\b|information disclosure|path traversal|\bcsrf\b|data leak|sensitive information/i,
  ],
]

/** Keywords first, because CWE is often generic. Falls back to the CWE list, then "bug". */
export function threatTypeOf(text: string, cwes: readonly string[]): ThreatType {
  for (const [type, re] of KEYWORDS) if (re.test(text)) return type
  for (const c of cwes) if (CWE[c]) return CWE[c]
  return 'bug'
}

const LANG =
  /\b(php|python|java|openjdk|jdk|node\.?js|ruby|rust|golang|standard library|stdlib|\.net|dotnet|perl|kotlin|swift)\b/i
const OS =
  /windows|linux|kernel|ubuntu|debian|android|\bios\b|macos|red hat enterprise|centos|esxi|fortios|junos|cisco ios|firmware/i
const AI =
  /\bllm\b|\bmcp\b|model context|copilot|pytorch|tensorflow|ollama|langchain|openai|transformers|vllm|llama|hugging ?face|\bai\b|machine learning/i

const SUPPLY =
  /supply[- ]chain|malicious (package|code|version|release|commit)|backdoor|compromised (package|release|maintainer|account|dependency)|typosquat|dependency confusion|embedded malicious/i

export function categoryOf(
  text: string,
  eco: string | undefined,
  pkg: string | undefined,
): Category {
  if (AI.test(text)) return 'ai'
  if (SUPPLY.test(text)) return 'supply'
  if (pkg === 'stdlib' || (!eco && LANG.test(text))) return 'languages'
  if (!eco && OS.test(text)) return 'os'
  if (eco && !['Go'].includes(eco)) return 'packages'
  if (eco === 'Go') return 'packages'
  return 'tools'
}
