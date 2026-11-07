import { useEffect, useState } from 'react'
import { LockKeyhole, LogOut, Save } from 'lucide-react'
import { api, type Settings } from '../api'
import { useStore } from '../store'
import { logout, useAuth } from '../AuthGate'
import AccountsSection from './Accounts'
import { Ext, Field, Spinner } from './ui'

/** Claude accounts only: the navbar's Claude button opens this. */
export function ClaudeAccountsPanel() {
  return (
    <>
      <AccountsSection />
      <p className="faint" style={{ fontSize: 12.5, lineHeight: 1.55 }}>
        Talvis works with your Claude subscriptions (no API key needed). Each account is stored in its own folder on this computer.
        With several accounts, Talvis can switch to the next one when one reaches its usage limit.
      </p>
    </>
  )
}

/** Everything that configures the app rather than describes you: model, effort, data source keys, browser, TRDesk. */
export function SettingsPanel() {
  const { user } = useAuth()
  return (
    <>
      <AccountSection />
      {user.admin ? (
        <ServerSettings />
      ) : (
        <p className="faint" style={{ fontSize: 12.5, lineHeight: 1.55 }}>
          Model, data source keys, browser and TRDesk are set by the admin account for everyone on this PhD Analyzer.
        </p>
      )}
    </>
  )
}

/** Server-wide configuration, only for the admin: model, effort, data source keys, browser, TRDesk. */
function ServerSettings() {
  const { toast } = useStore()
  const [s, setS] = useState<Settings | null>(null)
  const [dirty, setDirty] = useState(false)
  useEffect(() => void api<Settings>('/settings').then(setS), [])
  if (!s) return <div className="panel-loading"><Spinner /></div>
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => {
    setS({ ...s, [k]: v })
    setDirty(true)
  }
  const save = () => api('/settings', { method: 'PUT', body: s }).then(() => {
    setDirty(false)
    toast('Settings saved')
  }).catch((e) => toast(String(e)))

  return (
    <>
      <div className="toolbar">
        <button className="btn primary" disabled={!dirty} onClick={save}><Save size={14} /> Save settings</button>
        {dirty && <span className="chip amber">unsaved</span>}
      </div>

      <div className="prof-block">
        <div className="section-label">Talvis</div>
        <div className="grid2">
          <Field label="Model">
            <select className="select" value={s.model} onChange={(e) => set('model', e.target.value)}>
              <option value="claude-opus-5-5">Claude Opus 5.5 (recommended)</option>
              <option value="claude-sonnet-5-5">Claude Sonnet 5.5 (fast)</option>
              <option value="claude-fable-5-1">Claude Fable 5.1 (most capable)</option>
              <option value="claude-haiku-5-5">Claude Haiku 5.5 (fastest)</option>
            </select>
          </Field>
          <Field label="Board language">
            <input className="input" value={s.language} placeholder="English" title="Language of the notes, analyses and reports Talvis saves. In the chat it answers in the language you write in." onChange={(e) => set('language', e.target.value)} />
          </Field>
          <Field label="Chat effort">
            <select className="select" value={s.chatEffort} onChange={(e) => set('chatEffort', e.target.value)}>
              {['low', 'medium', 'high', 'xhigh'].map((x) => <option key={x}>{x}</option>)}
            </select>
          </Field>
          <Field label="Research job effort">
            <select className="select" value={s.jobEffort} onChange={(e) => set('jobEffort', e.target.value)}>
              {['medium', 'high', 'xhigh', 'max'].map((x) => <option key={x}>{x}</option>)}
            </select>
          </Field>
        </div>
      </div>

      <div className="prof-block">
        <div className="section-label">Data sources</div>
        <div className="grid3">
          <Field label="OpenAlex API key (free)"><input className="input" type="password" value={s.openalexKey} onChange={(e) => set('openalexKey', e.target.value)} /></Field>
          <Field label="OpenAlex mailto (optional)"><input className="input" value={s.mailto} onChange={(e) => set('mailto', e.target.value)} /></Field>
          <Field label="Semantic Scholar key (optional)"><input className="input" type="password" value={s.s2Key} onChange={(e) => set('s2Key', e.target.value)} /></Field>
          <Field label="Reddit app client id (optional)"><input className="input" value={s.redditClientId} onChange={(e) => set('redditClientId', e.target.value)} /></Field>
          <Field label="Reddit app secret"><input className="input" type="password" value={s.redditSecret} onChange={(e) => set('redditSecret', e.target.value)} /></Field>
        </div>
        <p className="faint" style={{ fontSize: 12.5, lineHeight: 1.55 }}>
          OpenAlex works without a key, but the free daily limit per IP is small. Free key: <Ext href="https://openalex.org/settings/api">openalex.org/settings/api</Ext>
        </p>
        <p className="faint" style={{ fontSize: 12.5, lineHeight: 1.55 }}>
          Reddit works without a key (public RSS), but the limit is small and score/comment counts are not shown. Free "script" app: <Ext href="https://www.reddit.com/prefs/apps">reddit.com/prefs/apps</Ext> → paste the client id and secret here.
        </p>
      </div>

      <div className="prof-block">
        <div className="section-label">Browser for JS-heavy sites</div>
        <div className="grid2">
          <Field label="Browser">
            <select className="select" value={s.browser} onChange={(e) => set('browser', e.target.value)}>
              <option value="auto">Automatic (Edge, then Chrome)</option>
              <option value="msedge">Microsoft Edge</option>
              <option value="chrome">Google Chrome</option>
              <option value="chromium">Chromium (npm run browser:install)</option>
            </select>
          </Field>
          <Field label="Status"><BrowserCheck /></Field>
        </div>
        <label className="row" style={{ gap: 8, fontSize: 13.5, marginTop: 10 }}>
          <input type="checkbox" checked={s.browserVisible} onChange={(e) => set('browserVisible', e.target.checked)} />
          Show the browser window (for checking; it normally runs in the background)
        </label>
      </div>

      <div className="prof-block">
        <div className="section-label">TRDesk task manager (optional)</div>
        <div className="grid3">
          <Field label="TRDesk key (trd_...)"><input className="input" type="password" value={s.trdeskKey} onChange={(e) => set('trdeskKey', e.target.value)} /></Field>
          <Field label="TRDesk URL"><input className="input" value={s.trdeskUrl} placeholder="https://your-trdesk-address" onChange={(e) => set('trdeskUrl', e.target.value)} /></Field>
          <Field label="TRDesk plan (name or id)"><input className="input" value={s.trdeskPlan} placeholder="PhD plan" onChange={(e) => set('trdeskPlan', e.target.value)} /></Field>
        </div>
        <p className="faint" style={{ fontSize: 12.5, lineHeight: 1.55 }}>Leave the key empty if you do not use TRDesk: it then stays hidden and Talvis does not use it.</p>
      </div>
    </>
  )
}

/** The signed-in account: who you are, change the password, sign out. */
function AccountSection() {
  const { toast } = useStore()
  const { user } = useAuth()
  const [current, setCurrent] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const change = () => {
    setBusy(true)
    api('/auth/password', { body: { current, next: pw } })
      .then(() => {
        setCurrent('')
        setPw('')
        setPw2('')
        toast('Password changed. Other devices are signed out.')
      })
      .catch((e) => toast(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(false))
  }
  const mismatch = pw2 !== '' && pw !== pw2
  return (
    <div className="prof-block">
      <div className="section-label">Your account</div>
      <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
        <b>{user.name}</b>
        <span className="dim">{user.email}</span>
        {user.admin && <span className="chip amber" title="Manages settings and Claude accounts">admin</span>}
        <span className="grow" />
        <button className="btn" onClick={logout}><LogOut size={14} /> Sign out</button>
      </div>
      <div className="grid3">
        <Field label="Current password"><input className="input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /></Field>
        <Field label="New password"><input className="input" type="password" autoComplete="new-password" placeholder="At least 6 characters" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
        <Field label="Repeat new password"><input className="input" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field>
      </div>
      <span className="row" style={{ gap: 8 }}>
        <button className="btn" disabled={busy || !current || pw.length < 6 || pw !== pw2} onClick={change}><LockKeyhole size={14} /> Change password</button>
        {mismatch && <span className="chip red">The new passwords do not match</span>}
      </span>
    </div>
  )
}

function BrowserCheck() {
  const [st, setSt] = useState<{ ok: boolean; version?: string; error?: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const check = () => {
    setBusy(true)
    api<{ ok: boolean; version?: string; error?: string }>('/browser/status')
      .then(setSt)
      .finally(() => setBusy(false))
  }
  return (
    <span className="row" style={{ gap: 8, minHeight: 40 }}>
      <button className="btn sm" onClick={check}>{busy ? <Spinner /> : null} Check browser</button>
      {st && <span className={`chip ${st.ok ? 'green' : 'red'}`} title={st.error}>{st.ok ? `ready ${st.version ?? ''}` : 'not found'}</span>}
    </span>
  )
}
