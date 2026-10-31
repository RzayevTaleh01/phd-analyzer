// robots.txt check for automated listing searches (rules for "User-agent: *", longest match wins).
import { cacheGet, cacheSet } from '../db'

interface Rule { allow: boolean; path: string }

function parse(txt: string): Rule[] {
  const rules: Rule[] = []
  let applies = false
  let inAgents = false
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim()
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i)
    if (!m) continue
    const [, key, value] = m
    const k = key.toLowerCase()
    if (k === 'user-agent') {
      // Consecutive user-agent lines form one group.
      applies = inAgents ? applies || value === '*' : value === '*'
      inAgents = true
      continue
    }
    inAgents = false
    if (applies && (k === 'allow' || k === 'disallow') && value) rules.push({ allow: k === 'allow', path: value })
  }
  return rules
}

function matches(pattern: string, path: string): boolean {
  const re = new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$')}`)
  return re.test(path)
}

export async function robotsAllowed(url: string): Promise<boolean> {
  const u = new URL(url)
  const key = `robots:${u.origin}`
  let txt = cacheGet(key, 24 * 3600_000)
  if (txt === undefined) {
    try {
      const res = await fetch(`${u.origin}/robots.txt`, { headers: { 'User-Agent': 'TalvisPhD/0.2' }, signal: AbortSignal.timeout(10_000) })
      txt = res.ok ? await res.text() : ''
    } catch {
      txt = ''
    }
    cacheSet(key, txt)
  }
  const path = u.pathname + u.search
  let best: Rule | undefined
  for (const r of parse(txt)) if (matches(r.path, path) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r
  return best ? best.allow : true
}
