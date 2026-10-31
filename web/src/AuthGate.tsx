import { useEffect, useState, type ReactNode } from 'react'
import { LockKeyhole } from 'lucide-react'
import Reactor from './board/Reactor'

/** On a deployed Talvis (APP_PASSWORD set) the board loads only after the password; locally it passes straight through. */
export default function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'checking' | 'open' | 'locked'>('checking')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch('/api/auth')
      .then((r) => r.json())
      .then((a: { required: boolean; ok: boolean }) => setState(!a.required || a.ok ? 'open' : 'locked'))
      .catch(() => setState('open'))
  }, [])

  const submit = () => {
    setBusy(true)
    setError('')
    fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) })
      .then(async (r) => {
        if (r.ok) window.location.reload()
        else setError(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${r.status}`)
      })
      .catch((e) => setError(String(e)))
      .finally(() => setBusy(false))
  }

  if (state === 'open') return <>{children}</>
  if (state === 'checking') return null
  return (
    <div className="auth-screen">
      <div className="auth-box">
        <Reactor size={54} />
        <div className="brand-title" style={{ marginTop: 14 }}>PHD ANALYZER</div>
        <div className="brand-sub">TALVIS CORE</div>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
          style={{ width: '100%', marginTop: 22 }}
        >
          <input className="input" type="password" autoFocus placeholder="Parol" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button className="btn primary" style={{ width: '100%', marginTop: 10, justifyContent: 'center' }} disabled={busy || !password}>
            <LockKeyhole size={13} /> Daxil ol
          </button>
        </form>
        {error && <div className="chip red" style={{ marginTop: 10 }}>{error}</div>}
      </div>
    </div>
  )
}
