import { useState } from 'react'
import { CircleCheck, ExternalLink, KeyRound, LoaderCircle, RefreshCw } from 'lucide-react'
import { useStore } from '../store'

/**
 * Sign in to Claude from inside the app: open the link, approve, paste the code.
 * `onlyProgress` shows nothing unless a sign-in is under way (used in the accounts list).
 */
export default function ClaudeLogin({ onlyProgress = false }: { onlyProgress?: boolean }) {
  const { claudeInfo, loginState, login, submitLoginCode, cancelLogin, recheckClaude, accounts } = useStore()
  const [code, setCode] = useState('')
  const { phase } = loginState
  const label = accounts.accounts.find((a) => a.id === loginState.accountId)?.label
  const inProgress = phase === 'starting' || phase === 'waiting_code' || phase === 'verifying'

  if (phase === 'waiting_code' || phase === 'verifying')
    return (
      <div className="login-banner warn login-steps nodrag nowheel">
        {label && <div className="section-label" style={{ color: 'var(--amber)' }}>Sign in for {label}</div>}
        <div className="login-step">
          <span className="login-n">1</span>
          <div className="grow">
            Sign in to your Claude account and click <b>Authorize</b>. If the browser opened by itself, continue there.
            {accounts.accounts.length > 1 && ' For a different account, first sign out of claude.ai in the browser or open the link in a private window.'}
            <div style={{ marginTop: 6 }}>
              <a className="btn sm primary" href={loginState.url} target="_blank" rel="noreferrer"><ExternalLink size={12} /> Open sign-in page</a>
            </div>
          </div>
        </div>
        <div className="login-step">
          <span className="login-n">2</span>
          <div className="grow">
            Copy the code shown on the page and paste it here:
            <div className="row" style={{ marginTop: 6 }}>
              <input
                className="input sm grow"
                value={code}
                placeholder="Paste the code here"
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && code.trim() && submitLoginCode(code)}
                disabled={phase === 'verifying'}
              />
              <button className="btn sm primary" disabled={!code.trim() || phase === 'verifying'} onClick={() => submitLoginCode(code)}>
                {phase === 'verifying' ? <LoaderCircle size={12} className="spin" /> : <CircleCheck size={12} />} Confirm
              </button>
            </div>
          </div>
        </div>
        {loginState.message && <div className="faint" style={{ fontSize: 11.5 }}>{loginState.message}</div>}
        <div className="row"><span className="grow" /><button className="btn sm ghost" onClick={cancelLogin}>Cancel</button></div>
      </div>
    )

  if (phase === 'starting')
    return <div className="login-banner nodrag"><LoaderCircle size={13} className="spin" /> Preparing the sign-in page{label ? ` (${label})` : ''}...</div>

  if (onlyProgress) {
    if (phase === 'error' && loginState.message) return <div className="login-banner warn" style={{ color: 'var(--red)' }}>{loginState.message}</div>
    return null
  }
  if (claudeInfo.state === 'connected' && !inProgress) return null
  if (claudeInfo.state === 'checking')
    return <div className="login-banner"><LoaderCircle size={13} className="spin" /> Checking the Claude connection...</div>

  return (
    <div className="login-banner warn nodrag">
      <div className="grow">
        {phase === 'done' ? (
          <span style={{ color: 'var(--green)' }}>Signed in, checking the connection...</span>
        ) : (
          <>
            <b>Claude sign-in required{claudeInfo.label ? ` (${claudeInfo.label})` : ''}.</b> No API key needed: sign in once with your own Claude account.
            {phase === 'error' && loginState.message && <div style={{ marginTop: 4, color: 'var(--red)' }}>{loginState.message}</div>}
          </>
        )}
      </div>
      <button className="btn sm primary" onClick={() => login()}><KeyRound size={12} /> Connect to Claude</button>
      <button className="btn sm ghost" onClick={recheckClaude} title="Check again"><RefreshCw size={12} /></button>
    </div>
  )
}
