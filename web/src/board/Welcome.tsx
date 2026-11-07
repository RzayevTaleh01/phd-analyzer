import { useRef, useState, type ReactNode } from 'react'
import { ArrowRight, Check, MapPin } from 'lucide-react'
import { DIRECTION_SUGGESTIONS } from '../../../shared/criteria'
import { api } from '../api'
import { Spinner, TagInput } from '../panels/ui'
import { useStore } from '../store'
import Logo from './Logo'

const SKIP_KEY = 'phd-analyzer.welcome-skipped'

function wasSkipped() {
  try {
    return localStorage.getItem(SKIP_KEY) === '1'
  } catch {
    return false
  }
}

// The whole system in three steps; everything else on the page is a list, not prose.
const STEPS = [
  ['Type your interests', '“NLP”, “soil microbiology”, anything.'],
  ['Talvis researches', 'Directions, universities, supervisors, papers and open positions.'],
  ['You decide', 'Compare with evidence, then follow a daily plan.'],
]
const BOARD = ['Directions', 'Universities', 'Supervisors', 'Papers', 'PhD positions', 'Deadlines', 'Research gaps', 'Student voice', 'Documents', 'Daily plan']
/** Every database and portal the server actually queries (server/research), with what it is used for. */
const SOURCES: [string, string][] = [
  ['OpenAlex', 'Papers'], ['Semantic Scholar', 'Papers'], ['arXiv', 'Preprints'], ['Crossref', 'DOIs'], ['DOAJ', 'Journals'],
  ['DAAD', 'Positions'], ['EURAXESS', 'Positions'], ['FindAPhD', 'Positions'], ['jobs.ac.uk', 'Positions'], ['AcademicPositions', 'Positions'],
  ['Nature Careers', 'Positions'], ['PhDPortal', 'Positions'], ['ScholarshipPortal', 'Funding'], ['QS · THE · ARWU', 'Rankings'], ['Reddit', 'Student voice'],
]
const REPO = 'https://github.com/rzayevtaleh01/phd-analyzer'

/** First run after signing in, when the board has no interests yet: the same page, saving straight to the profile. */
export default function Welcome() {
  const { fullState, loaded, claude, startJob, toast } = useStore()
  const [skipped, setSkipped] = useState(wasSkipped)
  const [busy, setBusy] = useState(false)
  if (skipped || !loaded || fullState.profile.directions.length || fullState.directions.length) return null

  const skip = () => {
    try {
      localStorage.setItem(SKIP_KEY, '1')
    } catch {
      // Private window: it simply shows again next time.
    }
    setSkipped(true)
  }
  const start = async (interests: string[], countries: string[]) => {
    setBusy(true)
    try {
      await api('/profile', { method: 'PUT', body: { ...fullState.profile, directions: interests, countries } })
      // Saving the interests closes this page; the job then fills the board.
      if (claude === 'connected') await startJob('setup_directions')
      else toast('Interests saved. Sign in from the Talvis panel, then use “Group my interests into directions” in your Profile.')
    } catch (e) {
      toast(String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <WelcomePage
      busy={busy}
      startLabel="Start my board"
      onStart={start}
      actions={<button className="btn" onClick={skip}>Skip to the board <ArrowRight size={16} /></button>}
    />
  )
}

/**
 * The landing page (canvas: 02 Welcome): one question, three steps, what you get and where it comes from.
 * Signed out it is the first page anyone sees and leads to creating an account; signed in it starts the board.
 */
export function WelcomePage({ actions, onStart, startLabel, busy = false }: {
  actions: ReactNode
  onStart: (interests: string[], countries: string[]) => void
  startLabel: string
  busy?: boolean
}) {
  const [interests, setInterests] = useState<string[]>([])
  const [countries, setCountries] = useState('')
  const start = () => onStart(interests, countries.split(',').map((c) => c.trim()).filter(Boolean))
  const page = useRef<HTMLDivElement>(null)
  const toTop = () => {
    page.current?.scrollTo({ top: 0, behavior: 'smooth' })
    window.setTimeout(() => document.getElementById('wl-interests')?.querySelector('input')?.focus(), 400)
  }

  return (
    <div className="wl" ref={page}>
      <header className="wl-head">
        <div className="wl-head-in">
          <Logo />
          <span className="grow" />
          <div className="wl-head-actions">{actions}</div>
        </div>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <h1>What do you want to <span className="hl">research</span>?</h1>
          <p className="hero-lead">Type your interests. Talvis finds directions, universities, supervisors and open positions, and links each one to its source.</p>

          <div className="hero-form" id="wl-interests">
            <label className="hero-label">Research interests</label>
            <TagInput value={interests} onChange={setInterests} suggestions={DIRECTION_SUGGESTIONS.slice(0, 4)} placeholder="e.g. NLP, HCI, LLMs (Enter after each)" />
            <div className="hero-row">
              <span className="hero-country">
                <MapPin size={16} aria-hidden="true" />
                <input aria-label="Countries (optional)" value={countries} placeholder="Countries (optional)" onChange={(e) => setCountries(e.target.value)} />
              </span>
              <button className="btn primary lg" disabled={!interests.length || busy} onClick={start}>
                {busy ? <Spinner /> : null} {startLabel} <ArrowRight size={18} />
              </button>
            </div>
          </div>

          <div className="wl-trust">
            {['Free and open source', 'A private board for you', 'Every item has a source'].map((t) => (
              <span key={t}><Check size={15} strokeWidth={2.6} />{t}</span>
            ))}
          </div>
        </div>

        <BoardPreview />
      </section>

      <section className="hero-steps" aria-label="How it works">
        <ol>
          {STEPS.map(([t, d], i) => (
            <li key={t}>
              <span className="n">{String(i + 1).padStart(2, '0')}</span>
              <div><b>{t}</b><p>{d}</p></div>
            </li>
          ))}
        </ol>
      </section>

      <section className="wl-sources" aria-labelledby="wl-sources-title">
        <div className="eyebrow" id="wl-sources-title">Databases and portals Talvis searches</div>
        {/* A ribbon that loops: the list is drawn twice and slides by half its width. */}
        <div className="ribbon">
          <ul className="ribbon-track">
            {[...SOURCES, ...SOURCES].map(([n, k], i) => (
              <li key={i} aria-hidden={i >= SOURCES.length || undefined}><b>{n}</b><span>{k}</span></li>
            ))}
          </ul>
        </div>
        <p>Every paper, ranking and deadline on your board keeps the link it came from.</p>
      </section>

      <footer className="wl-foot">
        <div className="wl-foot-in">
          <div className="wl-foot-brand">
            <Logo />
            <p>An open-source PhD research assistant. Talvis searches academic databases and PhD portals, and keeps every result, with its source, on your own board.</p>
          </div>
          <nav className="wl-foot-cols" aria-label="Footer">
            <div>
              <b>Product</b>
              <button onClick={toTop}>Get started</button>
              <a href="/docs">User guide</a>
              <a href={REPO} target="_blank" rel="noreferrer">Source code</a>
            </div>
            <div>
              <b>On your board</b>
              {BOARD.slice(0, 6).map((x) => <span key={x}>{x}</span>)}
            </div>
            <div>
              <b>Sources</b>
              {SOURCES.slice(0, 6).map(([n]) => <span key={n}>{n}</span>)}
            </div>
          </nav>
        </div>
        <div className="wl-foot-bar">
          <span>© {new Date().getFullYear()} PhD Analyzer · MIT License</span>
          <span>Free and open source</span>
        </div>
      </footer>
    </div>
  )
}

/** An illustration of a filled board for the hero; the names are examples, not data. */
function BoardPreview() {
  const unis: [string, string, number][] = [
    ['University of Helsinki', 'Finland', 68],
    ['TU Munich', 'Germany', 54],
    ['KTH Stockholm', 'Sweden', 47],
  ]
  return (
    <div className="preview" aria-hidden="true">
      <div className="preview-win">
        <div className="preview-bar"><i /><i /><i /><span>Your board</span><em>Example</em></div>
        <div className="preview-body">
          <div className="preview-dirs">
            <span className="on">Natural Language Processing</span>
            <span>Learning analytics</span>
            <span>HCI</span>
          </div>
          <div className="preview-card">
            <div className="preview-head"><b>Universities</b><small>Admission chance</small></div>
            {unis.map(([n, c, v]) => (
              <div key={n} className="preview-uni">
                <div><b>{n}</b><small>{c}</small></div>
                <span className="preview-meter"><i style={{ width: `${v}%` }} /></span>
                <em>{v}%</em>
              </div>
            ))}
          </div>
          <div className="preview-grid">
            <div className="preview-card">
              <div className="preview-head"><b>Next deadline</b></div>
              <div className="preview-big">12 days</div>
              <small className="preview-ok"><Check size={12} strokeWidth={3} /> verified on the official page</small>
            </div>
            <div className="preview-card">
              <div className="preview-head"><b>Supervisors</b></div>
              <div className="preview-big">9</div>
              <small>publishing on your topics</small>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
