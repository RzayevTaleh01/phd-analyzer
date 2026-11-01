import { useState } from 'react'
import { BookOpen, Sparkles } from 'lucide-react'
import { COUNTRY_SUGGESTIONS, DIRECTION_SUGGESTIONS } from '../../../shared/criteria'
import { api } from '../api'
import { Spinner, TagInput } from '../panels/ui'
import { useStore } from '../store'
import ClaudeLogin from './ClaudeLogin'
import { Corners } from './ModuleCard'
import Reactor from './Reactor'

const SKIP_KEY = 'phd-analyzer.welcome-skipped'

function wasSkipped() {
  try {
    return localStorage.getItem(SKIP_KEY) === '1'
  } catch {
    return false
  }
}

/** First run: the user only types research interests; Talvis groups them into directions and starts the research. */
export default function Welcome() {
  const { fullState, loaded, claude, startJob, toast } = useStore()
  const [skipped, setSkipped] = useState(wasSkipped)
  const [interests, setInterests] = useState<string[]>([])
  const [countries, setCountries] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  if (skipped || !loaded || fullState.profile.directions.length || fullState.directions.length) return null

  const ready = claude === 'connected'
  const skip = () => {
    try {
      localStorage.setItem(SKIP_KEY, '1')
    } catch {
      // Private window: it simply shows again next time.
    }
    setSkipped(true)
  }
  const start = async () => {
    setBusy(true)
    try {
      await api('/profile', { method: 'PUT', body: { ...fullState.profile, directions: interests, countries } })
      // Saving the interests closes this screen; the job then fills the board.
      if (ready) await startJob('setup_directions')
      else toast('Interests saved. Connect Claude, then use "Group my interests into directions" in the Profile.')
    } catch (e) {
      toast(String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="welcome-veil">
      <section className="welcome">
        <Corners />
        <div className="row" style={{ gap: 14 }}>
          <Reactor size={46} />
          <div>
            <div className="brand-title">PHD ANALYZER</div>
            <div className="welcome-title">What do you want to research?</div>
          </div>
        </div>
        <p className="welcome-lead">
          Type your research interests the way you would say them. Talvis groups them into research directions, then finds universities,
          supervisors, papers and open PhD positions for each one. You can change everything later.
        </p>

        <div className="section-label">Research interests</div>
        <TagInput value={interests} onChange={setInterests} suggestions={DIRECTION_SUGGESTIONS} placeholder="e.g. NLP, HCI, adaptive learning, LLMs (Enter after each)" />

        <div className="section-label" style={{ marginTop: 16 }}>Target countries (optional)</div>
        <TagInput value={countries} onChange={setCountries} suggestions={COUNTRY_SUGGESTIONS.slice(0, 12)} placeholder="Leave empty for anywhere" />

        {!ready && (
          <div style={{ marginTop: 16 }}>
            <div className="section-label" style={{ marginBottom: 8 }}>Connect Claude</div>
            <ClaudeLogin />
          </div>
        )}

        <div className="row" style={{ marginTop: 20, gap: 10, flexWrap: 'wrap' }}>
          <button className="btn primary" disabled={!interests.length || busy} onClick={start}>
            {busy ? <Spinner /> : <Sparkles size={13} />} {ready ? 'Group my interests and start' : 'Save my interests'}
          </button>
          <button className="btn ghost" onClick={skip}>Skip, I will fill the board myself</button>
          <span className="grow" />
          <a className="btn ghost" href="/docs" target="_blank" rel="noreferrer"><BookOpen size={13} /> How it works</a>
        </div>
      </section>
    </div>
  )
}
