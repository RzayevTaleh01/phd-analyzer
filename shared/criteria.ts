// University search criteria shared by the profile UI and the AI prompts.

export interface Condition {
  key: string
  label: string
  /** Fits on a chip. */
  short: string
  /** How the AI should check it on official pages. */
  check: string
}

export const CONDITIONS: Condition[] = [
  {
    key: 'no_language_cert',
    label: 'Dil sertifikatı (IELTS/TOEFL) tələb etməyən',
    short: 'IELTS/TOEFL tələbsiz',
    check: 'No English test certificate (IELTS/TOEFL/etc.) is required, or a documented waiver applies to this applicant (check citizenship and language of previous degree against the official admissions/language requirements page).',
  },
  { key: 'funded', label: 'Təqaüdlü / maaşlı PhD (funded)', short: 'Funded', check: 'PhD positions are funded (salary, stipend or full scholarship), per official pages.' },
  { key: 'no_tuition', label: 'Təhsil haqqı yoxdur', short: 'Təhsil haqqısız', check: 'No tuition fees for doctoral students from this applicant\'s country.' },
  { key: 'english_taught', label: 'İngilis dilində proqram', short: 'İngiliscə', check: 'The doctoral programme/research can be done fully in English.' },
  { key: 'no_gre', label: 'GRE tələb etməyən', short: 'GRE-siz', check: 'GRE is not required.' },
  { key: 'no_app_fee', label: 'Müraciət haqqı yoxdur', short: 'Müraciət haqqısız', check: 'No application fee, or a fee waiver exists.' },
  { key: 'no_masters', label: 'Magistr tələb etməyən', short: 'Magistrsiz', check: 'Admission is possible with a bachelor\'s degree (no master\'s required).' },
  { key: 'rolling', label: 'İl boyu qəbul (rolling)', short: 'Rolling', check: 'Applications are accepted year-round or for open positions at any time.' },
]

export const CONDITION_BY_KEY = Object.fromEntries(CONDITIONS.map((c) => [c.key, c])) as Record<string, Condition>

export const DIRECTION_SUGGESTIONS = [
  'Natural Language Processing',
  'Adaptive learning systems',
  'Intelligent tutoring systems',
  'Educational data mining',
  'Learning analytics',
  'Multilingual / low-resource NLP',
  'Large language models',
  'Speech processing',
  'AI in education',
  'Human-computer interaction',
]

export const COUNTRY_SUGGESTIONS = [
  'Germany', 'Netherlands', 'Finland', 'Sweden', 'Norway', 'Denmark', 'Estonia', 'Switzerland', 'Austria', 'Belgium',
  'Italy', 'Spain', 'France', 'Czech Republic', 'Poland', 'Hungary', 'Ireland', 'United Kingdom', 'Turkey',
  'Canada', 'United States', 'South Korea', 'Japan', 'Australia', 'Singapore',
]

export const RANKING_SYSTEMS = ['QS', 'THE', 'ARWU', 'any'] as const
export const RANKING_LIMITS = [50, 100, 200, 300, 500, 1000, 0] as const

export function rankingLabel(system?: string, max?: number): string {
  if (!max) return 'Reytinq fərq etmir'
  return `${system && system !== 'any' ? system : 'Reytinq'} top ${max}`
}

export const LANG_CERT_AZ: Record<string, string> = {
  not_required: 'Dil sertifikatı tələb olunmur',
  waiver: 'Waiver mümkündür',
  required: 'Dil sertifikatı tələb olunur',
  unknown: 'Dil tələbi yoxlanılmayıb',
}

/** Bands for Talvis' 0-100 admission-chance estimate; the job prompt uses the same limits. tone is a chip colour. */
export const ADMIT_BANDS = [
  { min: 65, label: 'yaxşı', tone: 'green' },
  { min: 40, label: 'orta', tone: 'cyan' },
  { min: 20, label: 'aşağı', tone: 'amber' },
  { min: 0, label: 'çox aşağı', tone: 'red' },
] as const

export const admitBand = (chance: number) => ADMIT_BANDS.find((b) => chance >= b.min) ?? ADMIT_BANDS[ADMIT_BANDS.length - 1]

/** Highest admission chance first; universities without an estimate go last, by rank. */
export function byAdmitChance(a: { admitChance?: number; rank?: number }, b: { admitChance?: number; rank?: number }) {
  return (b.admitChance ?? -1) - (a.admitChance ?? -1) || (a.rank ?? 99999) - (b.rank ?? 99999)
}
