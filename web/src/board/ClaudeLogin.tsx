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
        {label && <div className="section-label" style={{ color: 'var(--amber)' }}>{label} üçün giriş</div>}
        <div className="login-step">
          <span className="login-n">1</span>
          <div className="grow">
            Claude hesabına daxil ol və <b>Authorize</b> bas. Brauzer özü açılıbsa, orada davam et.
            {accounts.accounts.length > 1 && ' Başqa hesab üçün brauzerdə əvvəlcə claude.ai-dan çıxış et və ya gizli pəncərədə aç.'}
            <div style={{ marginTop: 6 }}>
              <a className="btn sm primary" href={loginState.url} target="_blank" rel="noreferrer"><ExternalLink size={12} /> Giriş səhifəsini aç</a>
            </div>
          </div>
        </div>
        <div className="login-step">
          <span className="login-n">2</span>
          <div className="grow">
            Səhifədə göstərilən kodu kopyala və bura yapışdır:
            <div className="row" style={{ marginTop: 6 }}>
              <input
                className="input sm grow"
                value={code}
                placeholder="Kodu bura yapışdır"
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && code.trim() && submitLoginCode(code)}
                disabled={phase === 'verifying'}
              />
              <button className="btn sm primary" disabled={!code.trim() || phase === 'verifying'} onClick={() => submitLoginCode(code)}>
                {phase === 'verifying' ? <LoaderCircle size={12} className="spin" /> : <CircleCheck size={12} />} Təsdiqlə
              </button>
            </div>
          </div>
        </div>
        {loginState.message && <div className="faint" style={{ fontSize: 11.5 }}>{loginState.message}</div>}
        <div className="row"><span className="grow" /><button className="btn sm ghost" onClick={cancelLogin}>Ləğv et</button></div>
      </div>
    )

  if (phase === 'starting')
    return <div className="login-banner nodrag"><LoaderCircle size={13} className="spin" /> Giriş səhifəsi hazırlanır{label ? ` (${label})` : ''}...</div>

  if (onlyProgress) {
    if (phase === 'error' && loginState.message) return <div className="login-banner warn" style={{ color: 'var(--red)' }}>{loginState.message}</div>
    return null
  }
  if (claudeInfo.state === 'connected' && !inProgress) return null
  if (claudeInfo.state === 'checking')
    return <div className="login-banner"><LoaderCircle size={13} className="spin" /> Claude bağlantısı yoxlanılır...</div>

  return (
    <div className="login-banner warn nodrag">
      <div className="grow">
        {phase === 'done' ? (
          <span style={{ color: 'var(--green)' }}>Daxil oldun, bağlantı yoxlanılır...</span>
        ) : (
          <>
            <b>Claude-a giriş lazımdır{claudeInfo.label ? ` (${claudeInfo.label})` : ''}.</b> API açarı lazım deyil: öz Claude hesabınla bir dəfə daxil ol.
            {phase === 'error' && loginState.message && <div style={{ marginTop: 4, color: 'var(--red)' }}>{loginState.message}</div>}
          </>
        )}
      </div>
      <button className="btn sm primary" onClick={() => login()}><KeyRound size={12} /> Claude-a qoşul</button>
      <button className="btn sm ghost" onClick={recheckClaude} title="Yenidən yoxla"><RefreshCw size={12} /></button>
    </div>
  )
}
