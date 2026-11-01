import { useState } from 'react'
import { Check, KeyRound, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import ClaudeLogin from '../board/ClaudeLogin'
import { useStore, type Account } from '../store'

const hhmm = (t?: number | string | null) => (t ? new Date(t).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '?')

function UsageBar({ label, value, resets }: { label: string; value?: number | null; resets?: string | null }) {
  if (value === undefined || value === null) return null
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div className="usage" title={resets ? `Resets: ${hhmm(resets)}` : undefined}>
      <span className="mono faint">{label}</span>
      <div className="bar grow" style={{ '--accent': pct > 85 ? 'var(--red)' : pct > 60 ? 'var(--amber)' : 'var(--green)' } as React.CSSProperties}><i style={{ width: `${pct}%` }} /></div>
      <span className="mono">{Math.round(pct)}%</span>
    </div>
  )
}

function AccountRow({ a, active }: { a: Account; active: boolean }) {
  const { accountAction, login, accounts } = useStore()
  const [editing, setEditing] = useState(false)
  const [label, setLabel] = useState(a.label)
  const [ask, setAsk] = useState(false)
  const limited = Boolean(a.limitedUntil && a.limitedUntil > Date.now())
  const dup = Boolean(a.email && accounts.accounts.some((x) => x.id !== a.id && x.email === a.email))
  return (
    <div className={`acct ${active ? 'on' : ''}`}>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <span className={`dot ${a.state === 'connected' && !limited ? 'on' : a.state === 'checking' ? 'warn' : 'off'}`} style={{ marginTop: 5 }} />
        <div className="grow">
          <div className="row" style={{ gap: 8 }}>
            {editing ? (
              <input
                className="input sm"
                autoFocus
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                onBlur={() => {
                  setEditing(false)
                  if (label.trim() && label !== a.label) accountAction(`/${a.id}`, 'PATCH', { label })
                }}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              />
            ) : (
              <b>{a.label}</b>
            )}
            {!editing && <button className="mod-btn" title="Rename" onClick={() => setEditing(true)}><Pencil size={11} /></button>}
            {active && <span className="chip cyan solid">active</span>}
            {a.plan && <span className="chip">{a.plan}</span>}
          </div>
          <div className="faint" style={{ fontSize: 11.5, marginTop: 3 }}>
            {a.state === 'connected' ? a.email ?? 'connected' : a.state === 'checking' ? 'checking...' : a.state === 'error' ? `error: ${a.detail ?? ''}` : 'not signed in'}
          </div>
          {limited && <div style={{ fontSize: 11.5, marginTop: 3, color: 'var(--amber)' }}>Limit reached - resets {hhmm(a.limitedUntil)}</div>}
          {dup && <div style={{ fontSize: 11.5, marginTop: 3, color: 'var(--red)' }}>This is the same account as another row. Sign in with a different Claude account.</div>}
          {a.usage && (
            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <UsageBar label="5 HOURS" value={a.usage.fiveHour} resets={a.usage.fiveHourResetsAt} />
              <UsageBar label="7 DAYS" value={a.usage.sevenDay} resets={a.usage.sevenDayResetsAt} />
            </div>
          )}
        </div>
        <div className="row" style={{ gap: 4 }}>
          {a.state !== 'connected' && <button className="btn sm primary" onClick={() => login(a.id)}><KeyRound size={12} /> Sign in</button>}
          {!active && a.state === 'connected' && <button className="btn sm" onClick={() => accountAction(`/${a.id}/activate`)}><Check size={12} /> Activate</button>}
          <button className="mod-btn" title="Check" onClick={() => accountAction(`/${a.id}/check`)}><RefreshCw size={12} /></button>
          {a.id !== 'main' &&
            (ask ? (
              <>
                <button className="btn sm danger" onClick={() => accountAction(`/${a.id}`, 'DELETE')}>Delete</button>
                <button className="btn sm ghost" onClick={() => setAsk(false)}>Cancel</button>
              </>
            ) : (
              <button className="mod-btn" title="Delete account (removes its sign-in on this computer)" onClick={() => setAsk(true)}><Trash2 size={12} /></button>
            ))}
        </div>
      </div>
    </div>
  )
}

/** Claude accounts: which one is active, usage, and automatic switching when a limit is hit. */
export default function AccountsSection() {
  const { accounts, accountAction } = useStore()
  return (
    <div>
      <label className={`cond ${accounts.autoSwitch ? 'on' : ''}`} style={{ marginBottom: 10 }}>
        <input type="checkbox" checked={accounts.autoSwitch} onChange={(e) => accountAction('/auto-switch', 'PUT', { on: e.target.checked })} />
        When the active account hits its limit, switch to the next account automatically (the reply is not cut off; it continues with the new account)
      </label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {accounts.accounts.map((a) => <AccountRow key={a.id} a={a} active={a.id === accounts.activeId} />)}
      </div>
      <div style={{ marginTop: 10 }}><ClaudeLogin onlyProgress /></div>
      <button className="btn" style={{ marginTop: 10 }} onClick={() => accountAction('', 'POST', {})}><Plus size={13} /> Add account</button>
    </div>
  )
}
