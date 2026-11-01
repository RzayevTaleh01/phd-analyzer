const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function todayISO(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseDay(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

export function daysUntil(iso: string): number {
  const a = parseDay(todayISO())
  const b = parseDay(iso)
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

export function fmtDate(iso?: string): string {
  if (!iso) return '-'
  const d = parseDay(iso)
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export function fmtShort(iso?: string): string {
  if (!iso) return '-'
  const d = parseDay(iso)
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}

export function monthShort(d = new Date()): string {
  return MONTHS[d.getMonth()]
}

export function weekday(d = new Date()): string {
  return WEEKDAYS[d.getDay()]
}

export function fmtTime(d = new Date()): string {
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function fmtClock(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

export function initials(name: string): string {
  const parts = name.replace(/^(Prof\.|Dr\.)\s*/i, '').split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

export function dayLabel(n: number): string {
  if (n < 0) return `${-n}d ago`
  if (n === 0) return 'today'
  if (n === 1) return 'tomorrow'
  return `${n} days`
}

export function urgency(n: number): 'red' | 'amber' | 'cyan' {
  if (n <= 7) return 'red'
  if (n <= 30) return 'amber'
  return 'cyan'
}

export const STATUS_LABEL: Record<string, string> = {
  interested: 'Interested',
  researching: 'Researching',
  applying: 'Applying',
  applied: 'Applied',
  interview: 'Interview',
  accepted: 'Accepted',
  rejected: 'Rejected',
  new: 'New',
  to_contact: 'To contact',
  contacted: 'Contacted',
  replied: 'Replied',
  meeting: 'Meeting',
  declined: 'Declined',
  to_read: 'To read',
  reading: 'Reading',
  read: 'Read',
  key: 'Key',
  candidate: 'Candidate',
  shortlisted: 'Shortlisted',
  found: 'Found',
  dismissed: 'Dismissed',
  selected: 'Selected',
  discarded: 'Discarded',
  suggested: 'Suggested',
  submitted: 'Submitted',
  draft: 'Draft',
  review: 'Review',
  final: 'Final',
  todo: 'To do',
  doing: 'Doing',
  done: 'Done',
  open: 'Open',
  missed: 'Missed',
  application: 'Application',
  scholarship: 'Scholarship',
  document: 'Document',
  conference: 'Conference',
  journal: 'Journal',
  other: 'Other',
}

export function statusLabel(key?: string): string {
  return key ? STATUS_LABEL[key] ?? key : '-'
}
