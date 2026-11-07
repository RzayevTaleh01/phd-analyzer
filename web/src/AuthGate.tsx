import { createContext, useCallback, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, BookOpen, Check, Eye, EyeOff, LogIn, UserPlus } from 'lucide-react'
import { COUNTRY_SUGGESTIONS, DIRECTION_SUGGESTIONS, RANKING_LIMITS, RANKING_SYSTEMS } from '../../shared/criteria'
import { COUNTRIES, FIELDS_OF_STUDY } from '../../shared/countries'
import { LogoMark, Wordmark } from './board/Logo'
import { WelcomePage } from './board/Welcome'
import { Spinner, TagInput } from './panels/ui'

export type User = { id: number; email: string; name: string; admin: boolean }
type AuthInfo = { user: User | null; hasUsers: boolean }
type AuthCtx = { user: User; refresh: () => Promise<void> }

const Ctx = createContext<AuthCtx>({ user: { id: 0, email: '', name: '', admin: false }, refresh: async () => {} })

/** The signed-in account. Every board, chat and job belongs to it. */
export const useAuth = () => useContext(Ctx)

/** Clear the session cookie and go back to the sign-in page. */
export function logout() {
  fetch('/api/auth/logout', { method: 'POST' }).finally(() => window.location.reload())
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`/api/auth/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = (await r.json().catch(() => ({}))) as T & { error?: string }
  if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`)
  return data
}

/** The board loads only for a signed-in account; otherwise the sign-in / register page. */
export default function AuthGate({ children }: { children: ReactNode }) {
  const [info, setInfo] = useState<AuthInfo | null>(null)
  const [failed, setFailed] = useState(false)
  const refresh = useCallback(
    () =>
      fetch('/api/auth')
        .then((r) => r.json() as Promise<AuthInfo>)
        .then((a) => {
          setInfo(a)
          setFailed(false)
        })
        .catch(() => setFailed(true)),
    [],
  )
  useEffect(() => void refresh(), [refresh])

  if (failed) return <div className="auth-screen"><div className="auth-box"><p>No connection to the server. Is <code>npm start</code> running?</p></div></div>
  if (!info) return null
  if (info.user) return <Ctx.Provider value={{ user: info.user, refresh }}>{children}</Ctx.Provider>
  return <AuthPage info={info} />
}

const STAGES = ['Bachelor’s student', 'Master’s student', 'Graduate, applying for a PhD', 'PhD student', 'Working in industry', 'Researcher changing field', 'Other']

const POINTS = [
  ['Directions from your interests', 'Type what you are curious about; Talvis names the fields behind it.'],
  ['Universities, supervisors, positions', 'Found in the background, filtered by your countries and conditions.'],
  ['Evidence for every item', 'Each paper, ranking and deadline links to the page it came from.'],
]
const SOURCES = ['OpenAlex', 'Semantic Scholar', 'arXiv', 'DAAD', 'EURAXESS', 'FindAPhD']

type View = { page: 'landing' } | { page: 'login' } | { page: 'register'; directions: string[]; countries: string[] }

/** Signed out: the landing page comes first; from there you sign in, or type your interests and create an account. */
function AuthPage({ info }: { info: AuthInfo }) {
  const [view, setView] = useState<View>({ page: 'landing' })
  const home = () => setView({ page: 'landing' })
  const toLogin = () => setView({ page: 'login' })
  const toRegister = () => setView({ page: 'register', directions: [], countries: [] })
  if (view.page === 'landing')
    return (
      <WelcomePage
        startLabel="Continue: create my account"
        onStart={(directions, countries) => setView({ page: 'register', directions, countries })}
        actions={
          <>
            <button className="btn" onClick={toLogin}><LogIn size={16} /> Sign in</button>
            <button className="btn primary" onClick={toRegister}><UserPlus size={16} /> Create account</button>
          </>
        }
      />
    )
  const login = view.page === 'login'
  return (
    <div className="auth">
      <aside className="auth-side">
        <button className="auth-brand" onClick={home} aria-label="PhD Analyzer, back to the home page">
          <LogoMark size={36} />
          <Wordmark />
        </button>
        <div className="auth-side-mid">
          <div className="auth-kicker"><i />For anyone planning a PhD</div>
          <h2>Your PhD search, <span className="hl">on one board</span>.</h2>
          <ol className="auth-points">
            {POINTS.map(([t, d], i) => (
              <li key={t}><span>{String(i + 1).padStart(2, '0')}</span><div><b>{t}</b><p>{d}</p></div></li>
            ))}
          </ol>
        </div>
        <div className="auth-side-foot">
          <div className="auth-eyebrow">Sources Talvis searches</div>
          <div className="auth-sources">{SOURCES.map((x) => <span key={x}>{x}</span>)}</div>
        </div>
      </aside>

      <main className="auth-main">
        <div className="auth-top">
          <button className="auth-back" onClick={home}><ArrowLeft size={15} /> Home</button>
          <span className="grow" />
          <span className="auth-switch">
            <span>{login ? 'New here?' : 'Already have an account?'}</span>
            <button onClick={login ? toRegister : toLogin}>{login ? 'Create an account' : 'Sign in'}</button>
          </span>
        </div>
        <div className={`auth-card ${login ? '' : 'wide'}`}>
          {login ? <LoginForm /> : <RegisterForm info={info} initialDirections={view.directions} initialCountries={view.countries} />}
        </div>
        <a className="auth-docs" href="/docs"><BookOpen size={13} /> What is PhD Analyzer? Read the user guide</a>
      </main>
    </div>
  )
}

/** A password field with a show / hide button. */
function PasswordInput({ value, onChange, autoComplete, placeholder, autoFocus }: {
  value: string
  onChange: (v: string) => void
  autoComplete: string
  placeholder?: string
  autoFocus?: boolean
}) {
  const [shown, setShown] = useState(false)
  return (
    <span className="auth-pw">
      <input className="input" type={shown ? 'text' : 'password'} autoComplete={autoComplete} placeholder={placeholder} autoFocus={autoFocus} value={value} onChange={(e) => onChange(e.target.value)} />
      <button type="button" onClick={() => setShown(!shown)} aria-label={shown ? 'Hide password' : 'Show password'} title={shown ? 'Hide password' : 'Show password'}>
        {shown ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </span>
  )
}

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    post('login', { email, password })
      .then(() => window.location.reload())
      .catch((err: Error) => setError(err.message))
      .finally(() => setBusy(false))
  }
  return (
    <form className="auth-form" onSubmit={submit}>
      <div className="auth-head">
        <h1>Welcome back</h1>
        <p>Sign in to open your board.</p>
      </div>
      <label className="auth-field"><span>Email</span><input className="input" type="email" autoComplete="email" autoFocus placeholder="you@university.edu" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label className="auth-field"><span>Password</span><PasswordInput autoComplete="current-password" value={password} onChange={setPassword} /></label>
      {error && <div className="auth-error" role="alert">{error}</div>}
      <button className="btn primary auth-submit" disabled={busy || !email || !password}>{busy ? <Spinner /> : null} Sign in <ArrowRight size={16} /></button>
    </form>
  )
}

// ---------- create account: three steps, mostly pickers; the rest is filled in on the Profile afterwards ----------

const STEP_NAMES = ['Account', 'Research', 'Targets'] as const
/** Set before the reload after registering: the app then opens the Profile panel. */
export const OPEN_PROFILE_KEY = 'phd-analyzer.open-profile'
const OTHER = '__other'
const year = new Date().getFullYear()
/** PhD start options: the next eight spring (February) and fall (September) terms that have not started yet. */
const TERMS = Array.from({ length: 5 }, (_, i) => [
  { t: `Spring ${year + i}`, at: new Date(year + i, 1, 1) },
  { t: `Fall ${year + i}`, at: new Date(year + i, 8, 1) },
])
  .flat()
  .filter((x) => x.at > new Date())
  .slice(0, 8)
  .map((x) => x.t)
const RANK_LABEL: Record<string, string> = { QS: 'QS', THE: 'Times Higher Ed.', ARWU: 'Shanghai (ARWU)', any: 'Any ranking' }

/** Toggle chips for a short list of countries. */
function ChipPick({ options, value, onChange }: { options: readonly string[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="pick">
      {options.map((o) => {
        const on = value.includes(o)
        return (
          <button type="button" key={o} className={on ? 'on' : ''} aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])}>
            {on && <Check size={14} strokeWidth={2.6} />}{o}
          </button>
        )
      })}
    </div>
  )
}

function Select({ value, onChange, options, placeholder, labels }: { value: string; onChange: (v: string) => void; options: readonly (string | number)[]; placeholder?: string; labels?: (o: string) => string }) {
  return (
    <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => <option key={o} value={String(o)}>{labels ? labels(String(o)) : o}</option>)}
    </select>
  )
}

function RegisterForm({ info, initialDirections, initialCountries }: { info: AuthInfo; initialDirections: string[]; initialCountries: string[] }) {
  const [step, setStep] = useState(0)
  const [done, setDone] = useState(0)
  // 1 Account
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  // 2 Research
  const [directions, setDirections] = useState<string[]>(initialDirections)
  const [field, setField] = useState('')
  const [fieldOther, setFieldOther] = useState('')
  const [stage, setStage] = useState('')
  // 3 Targets
  const [countries, setCountries] = useState<string[]>(initialCountries)
  const [term, setTerm] = useState('')
  const [rankingSystem, setRankingSystem] = useState('QS')
  const [rankingMax, setRankingMax] = useState('0')

  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const check = (i: number): string => {
    if (i === 0) {
      if (!name.trim()) return 'Enter your name'
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Enter a valid email address'
      if (password.length < 6) return 'Use a password of at least 6 characters'
      if (password !== password2) return 'The passwords do not match'
    }
    if (i === 1) {
      if (!directions.length) return 'Add at least one research interest'
      if (!field || (field === OTHER && !fieldOther.trim())) return 'Choose your field of study'
      if (!stage) return 'Choose where you are now'
    }
    return ''
  }
  const go = (to: number) => {
    // Forward only through steps that pass; back is always allowed.
    for (let i = step; i < to; i++) {
      const msg = check(i)
      if (msg) {
        setStep(i)
        return setError(msg)
      }
    }
    setError('')
    setStep(to)
    setDone((d) => Math.max(d, to))
  }

  const submit = () => {
    for (let i = 0; i < STEP_NAMES.length; i++) {
      const msg = check(i)
      if (msg) {
        setStep(i)
        return setError(msg)
      }
    }
    setBusy(true)
    setError('')
    const fieldName = field === OTHER ? fieldOther.trim() : field
    const profile = { directions, field: fieldName, stage, countries, targetTerm: term, rankingSystem, rankingMax: Number(rankingMax) }
    post('register', { name, email, password, profile })
      .then(() => {
        // The new board opens on the Profile, where background and conditions are added.
        try {
          sessionStorage.setItem(OPEN_PROFILE_KEY, '1')
        } catch {
          // Storage blocked: the board just opens without it.
        }
        window.location.reload()
      })
      .catch((err: Error) => {
        setError(err.message)
        // Account problems (a taken email) are fixed on the first step.
        if (!/interest/i.test(err.message)) setStep(0)
      })
      .finally(() => setBusy(false))
  }
  const last = step === STEP_NAMES.length - 1
  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (last) submit()
    else go(step + 1)
  }

  const HEADS = [
    ['Create your account', 'Your own private board for universities, supervisors, papers and deadlines.'],
    ['What do you want to research?', 'Talvis groups your interests into research directions. You can change them later.'],
    ['Where do you want to go?', 'Searches keep only universities that fit these. All optional; the rest is on your Profile next.'],
  ]

  return (
    <form className="auth-form" onSubmit={onSubmit}>
      <ol className="stepper" aria-label="Create account steps">
        {STEP_NAMES.map((n, i) => (
          <li key={n} className={i === step ? 'on' : i <= done ? 'done' : ''}>
            <button type="button" disabled={i > done} onClick={() => go(i)} aria-current={i === step ? 'step' : undefined}>
              <span>{i < step || (i <= done && i !== step) ? <Check size={13} strokeWidth={3} /> : i + 1}</span>
              <b>{n}</b>
            </button>
          </li>
        ))}
      </ol>

      <div className="auth-head">
        <h1>{HEADS[step][0]}</h1>
        <p>{HEADS[step][1]}</p>
      </div>

      {step === 0 && (
        <>
          {initialDirections.length > 0 && (
            <div className="auth-carry"><span>Your interests are saved</span>{initialDirections.map((d) => <i key={d}>{d}</i>)}</div>
          )}
          {!info.hasUsers && <p className="auth-note">This is the first account: it becomes the admin and keeps the board that is already here.</p>}
          <label className="auth-field"><span>Full name</span><input className="input" autoComplete="name" autoFocus placeholder="Your full name" value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="auth-field"><span>Email</span><input className="input" type="email" autoComplete="email" placeholder="you@university.edu" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <div className="auth-grid">
            <label className="auth-field"><span>Password</span><PasswordInput autoComplete="new-password" placeholder="At least 6 characters" value={password} onChange={setPassword} /></label>
            <label className="auth-field"><span>Repeat password</span><PasswordInput autoComplete="new-password" value={password2} onChange={setPassword2} /></label>
          </div>
        </>
      )}

      {step === 1 && (
        <>
          <div className="auth-field">
            <span>Research interests</span>
            <TagInput value={directions} onChange={setDirections} suggestions={DIRECTION_SUGGESTIONS} placeholder="Type one and press Enter, or pick below" />
          </div>
          <div className="auth-grid">
            <label className="auth-field">
              <span>Field of study</span>
              <Select value={field} onChange={setField} options={[...FIELDS_OF_STUDY, OTHER]} placeholder="Choose a field…" labels={(o) => (o === OTHER ? 'Other (type it)' : o)} />
            </label>
            <label className="auth-field">
              <span>Where you are now</span>
              <Select value={stage} onChange={setStage} options={STAGES} placeholder="Choose…" />
            </label>
          </div>
          {field === OTHER && (
            <label className="auth-field"><span>Your field</span><input className="input" autoFocus placeholder="e.g. Marine biology" value={fieldOther} onChange={(e) => setFieldOther(e.target.value)} /></label>
          )}
        </>
      )}

      {step === 2 && (
        <>
          <div className="auth-field">
            <span>Target countries <span className="dim">(none = anywhere)</span></span>
            <ChipPick options={[...new Set([...COUNTRY_SUGGESTIONS, ...countries])]} value={countries} onChange={setCountries} />
            <Select value="" onChange={(c) => c && !countries.includes(c) && setCountries([...countries, c])} options={COUNTRIES.filter((c) => !countries.includes(c))} placeholder="Add another country…" />
          </div>
          <div className="auth-grid three">
            <label className="auth-field"><span>PhD start</span><Select value={term} onChange={setTerm} options={TERMS} placeholder="Not sure yet" /></label>
            <label className="auth-field"><span>Ranking</span><Select value={rankingSystem} onChange={setRankingSystem} options={RANKING_SYSTEMS} labels={(o) => RANK_LABEL[o] ?? o} /></label>
            <label className="auth-field">
              <span>Only the top</span>
              <Select value={rankingMax} onChange={setRankingMax} options={RANKING_LIMITS} labels={(o) => (o === '0' ? 'No limit' : `Top ${o}`)} />
            </label>
          </div>
        </>
      )}

      {error && <div className="auth-error" role="alert">{error}</div>}
      <div className="auth-row">
        {step > 0 && <button type="button" className="btn auth-back-btn" onClick={() => go(step - 1)}><ArrowLeft size={16} /> Back</button>}
        <button className="btn primary auth-submit" disabled={busy}>
          {busy ? <Spinner /> : null}
          {last ? <><UserPlus size={16} /> Create account</> : <>Continue <ArrowRight size={16} /></>}
        </button>
      </div>
    </form>
  )
}
