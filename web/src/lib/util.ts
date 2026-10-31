const MONTHS = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'İyn', 'İyl', 'Avq', 'Sen', 'Okt', 'Noy', 'Dek']
const WEEKDAYS = ['Bazar', 'Bazar ertəsi', 'Çərşənbə axşamı', 'Çərşənbə', 'Cümə axşamı', 'Cümə', 'Şənbə']

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
  if (n < 0) return `${-n}g keçib`
  if (n === 0) return 'bu gün'
  if (n === 1) return 'sabah'
  return `${n} gün`
}

export function urgency(n: number): 'red' | 'amber' | 'cyan' {
  if (n <= 7) return 'red'
  if (n <= 30) return 'amber'
  return 'cyan'
}

export const STATUS_AZ: Record<string, string> = {
  interested: 'Maraqlı',
  researching: 'Araşdırılır',
  applying: 'Müraciət',
  applied: 'Göndərildi',
  interview: 'Müsahibə',
  accepted: 'Qəbul',
  rejected: 'Rədd',
  new: 'Yeni',
  to_contact: 'Yazılacaq',
  contacted: 'Yazıldı',
  replied: 'Cavab verdi',
  meeting: 'Görüş',
  declined: 'İmtina',
  to_read: 'Oxunacaq',
  reading: 'Oxunur',
  read: 'Oxundu',
  key: 'Əsas',
  candidate: 'Namizəd',
  shortlisted: 'Seçilmiş',
  found: 'Tapıldı',
  dismissed: 'Atıldı',
  selected: 'Mövzum',
  discarded: 'Atıldı',
  suggested: 'Təklif',
  submitted: 'Göndərildi',
  draft: 'Qaralama',
  review: 'Yoxlanış',
  final: 'Hazır',
  todo: 'Ediləcək',
  doing: 'Gedir',
  done: 'Bitdi',
  open: 'Açıq',
  missed: 'Buraxıldı',
  application: 'Müraciət',
  scholarship: 'Təqaüd',
  document: 'Sənəd',
  conference: 'Konfrans',
  journal: 'Jurnal',
  other: 'Digər',
}

export function az(key?: string): string {
  return key ? STATUS_AZ[key] ?? key : '-'
}
