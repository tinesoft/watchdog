# watchdog

A static web app that collects public vulnerability data and tells a developer which of it affects the software they run.

## Language

### Collected data

**Threat**:
One vulnerability, merged from every source that mentions it, identified by its CVE ID or an alias.
_Avoid_: Vulnerability, issue, finding

**Advisory**:
One source's published record about a Threat. A Threat can have many Advisories.
_Avoid_: Bulletin, notice

**Exploited**:
A Threat is Exploited when CISA's Known Exploited Vulnerabilities catalog lists it. No other source sets it.
_Avoid_: Actively exploited, in the wild, KEV (in UI copy)

**Field report**:
A security lab's or news outlet's article about a campaign or research. It is not a Threat, but can name the Threats it covers.
_Avoid_: Blog post, intel, article

**Source**:
An authoritative site watchdog collects from, or lists as link-only.
_Avoid_: Feed, provider

**Sweep**:
One scheduled collection run across all Sources. The published data is the result of the latest Sweep.
_Avoid_: Sync, crawl, scrape

### The user's context

**Stack**:
The list of products and packages the user says they run.
_Avoid_: Tech stack, inventory, watchlist

**Mine**:
A Threat is Mine when it matches the Stack.
_Avoid_: Relevant, affected

**Triage status**:
The user's own decision on a Threat: investigating, patched, not affected or ignored. It is never part of the collected data.
_Avoid_: State, resolution

**Inbox**:
The Threats that are new since the user last cleared it and have no Triage status.
_Avoid_: Queue, unread

**Scan**:
Checking dependencies the user pastes in against the collected Threats.
_Avoid_: Audit, check

**Risk**:
The order Threats are ranked in: Exploited first, then Mine, then CVSS score.
_Avoid_: Priority, score

### Mascot

**Dog**:
The mascot. It barks when a Mine Threat in the Inbox is Exploited, and patrols otherwise.
_Avoid_: Watchdog (that is the product name), bot
