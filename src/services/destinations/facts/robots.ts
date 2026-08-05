export interface RobotsDecision {
  allowed: boolean
  matchedRule?: string
  robotsUrl: string
  checkedAt: Date
  reason: string
}

export interface RobotsRule {
  userAgents: string[]
  allows: string[]
  disallows: string[]
}

interface CachedRobots {
  rules: RobotsRule[]
  checkedAt: Date
}

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>

const ROBOTS_CACHE = new Map<string, CachedRobots>()
const CACHE_TTL_MS = 10 * 60 * 1000
const DEFAULT_USER_AGENT = 'RoamlyBot/0.1 (+https://roamly.local)'

function robotsUrlFor(url: string): string {
  const parsed = new URL(url)
  return `${parsed.origin}/robots.txt`
}

function parseRulePath(line: string): string | null {
  const [, value = ''] = line.split(':')
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

export function parseRobotsTxt(text: string): RobotsRule[] {
  const groups: RobotsRule[] = []
  let current: RobotsRule | null = null

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, '').trim()
    if (!line) continue
    const [field = ''] = line.split(':')
    const normalizedField = field.trim().toLowerCase()

    if (normalizedField === 'user-agent') {
      const agent = parseRulePath(line)?.toLowerCase()
      if (!agent) continue
      if (current && (current.allows.length > 0 || current.disallows.length > 0)) {
        current = null
      }
      if (!current) {
        current = { userAgents: [], allows: [], disallows: [] }
        groups.push(current)
      }
      current.userAgents.push(agent)
      continue
    }

    if (!current) continue
    const path = parseRulePath(line)
    if (!path) continue

    if (normalizedField === 'allow') current.allows.push(path)
    if (normalizedField === 'disallow') current.disallows.push(path)
  }

  return groups
}

function groupMatches(rule: RobotsRule, userAgent: string): boolean {
  const normalized = userAgent.toLowerCase()
  return rule.userAgents.some((agent) => agent === '*' || normalized.includes(agent))
}

function ruleMatches(pathname: string, rulePath: string): boolean {
  if (!rulePath) return false
  return pathname.startsWith(rulePath)
}

function evaluateRules(rules: RobotsRule[], url: string, userAgent: string): RobotsDecision {
  const parsed = new URL(url)
  const robotsUrl = robotsUrlFor(url)
  const checkedAt = new Date()
  const matchingGroups = rules.filter((rule) => groupMatches(rule, userAgent))

  if (matchingGroups.length === 0) {
    return {
      allowed: true,
      robotsUrl,
      checkedAt,
      reason: 'No matching robots.txt user-agent group.',
    }
  }

  const ruleCandidates = matchingGroups.flatMap((group) => [
    ...group.allows.map((path) => ({ path, allowed: true })),
    ...group.disallows.map((path) => ({ path, allowed: false })),
  ])
  const matchingRules = ruleCandidates
    .filter((rule) => ruleMatches(parsed.pathname, rule.path))
    .sort((first, second) => second.path.length - first.path.length)

  const matched = matchingRules[0]
  if (!matched) {
    return {
      allowed: true,
      robotsUrl,
      checkedAt,
      reason: 'No robots.txt rule matched the target path.',
    }
  }

  return {
    allowed: matched.allowed,
    matchedRule: `${matched.allowed ? 'Allow' : 'Disallow'}: ${matched.path}`,
    robotsUrl,
    checkedAt,
    reason: matched.allowed ? 'Allowed by robots.txt rule.' : 'Disallowed by robots.txt rule.',
  }
}

async function fetchRobots(url: string, fetcher: Fetcher, userAgent: string): Promise<CachedRobots | null> {
  const robotsUrl = robotsUrlFor(url)
  const cached = ROBOTS_CACHE.get(robotsUrl)
  if (cached && Date.now() - cached.checkedAt.getTime() < CACHE_TTL_MS) return cached

  try {
    const response = await fetcher(robotsUrl, {
      headers: { 'user-agent': userAgent },
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) return null

    const rules = parseRobotsTxt(await response.text())
    const entry = { rules, checkedAt: new Date() }
    ROBOTS_CACHE.set(robotsUrl, entry)
    return entry
  } catch {
    return null
  }
}

export async function checkRobotsAllowed(
  url: string,
  options: { fetcher?: Fetcher; userAgent?: string } = {}
): Promise<RobotsDecision> {
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT
  const robotsUrl = robotsUrlFor(url)
  const entry = await fetchRobots(url, options.fetcher ?? fetch, userAgent)

  if (!entry) {
    return {
      allowed: false,
      robotsUrl,
      checkedAt: new Date(),
      reason: 'robots.txt could not be fetched; refusing conservatively.',
    }
  }

  return evaluateRules(entry.rules, url, userAgent)
}

export function clearRobotsCache() {
  ROBOTS_CACHE.clear()
}
