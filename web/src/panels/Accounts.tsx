import { useState } from 'react'
import { Check, KeyRound, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import ClaudeLogin from '../board/ClaudeLogin'
import { useStore, type Account } from '../store'

const hhmm = (t?: number | string | null) => (t ? new Date(t).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '?')

function UsageBar({ label, value, resets }: { label: string; value?: number | null; resets?: string | null }) {
  if (value === undefined || value === null) return null
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div className="usage" title={resets ? `Sıfırlanır: ${hhmm(resets)}` : undefined}>
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
            {!editing && <button className="mod-btn" title="Adını dəyiş" onClick={() => setEditing(true)}><Pencil size={11} /></button>}
            {active && <span className="chip cyan solid">aktiv</span>}
            {a.plan && <span className="chip">{a.plan}</span>}
          </div>
          <div className="faint" style={{ fontSize: 11.5, marginTop: 3 }}>
            {a.state === 'connected' ? a.email ?? 'bağlı' : a.state === 'checking' ? 'yoxlanılır...' : a.state === 'error' ? `xəta: ${a.detail ?? ''}` : 'giriş edilməyib'}
          </div>
          {limited && <div style={{ fontSize: 11.5, marginTop: 3, color: 'var(--amber)' }}>Limit bitib - {hhmm(a.limitedUntil)} sıfırlanır</div>}
          {dup && <div style={{ fontSize: 11.5, marginTop: 3, color: 'var(--red)' }}>Bu, başqa sətirdəki hesabın eynisidir. Fərqli Claude hesabı ilə daxil ol.</div>}
          {a.usage && (
            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <UsageBar label="5 SAAT" value={a.usage.fiveHour} resets={a.usage.fiveHourResetsAt} />
              <UsageBar label="7 GÜN" value={a.usage.sevenDay} resets={a.usage.sevenDayResetsAt} />
            </div>
          )}
        </div>
        <div className="row" style={{ gap: 4 }}>
          {a.state !== 'connected' && <button className="btn sm primary" onClick={() => login(a.id)}><KeyRound size={12} /> Daxil ol</button>}
          {!active && a.state === 'connected' && <button className="btn sm" onClick={() => accountAction(`/${a.id}/activate`)}><Check size={12} /> Aktiv et</button>}
          <button className="mod-btn" title="Yoxla" onClick={() => accountAction(`/${a.id}/check`)}><RefreshCw size={12} /></button>
          {a.id !== 'main' &&
            (ask ? (
              <>
                <button className="btn sm danger" onClick={() => accountAction(`/${a.id}`, 'DELETE')}>Sil</button>
                <button className="btn sm ghost" onClick={() => setAsk(false)}>Ləğv</button>
              </>
            ) : (
              <button className="mod-btn" title="Hesabı sil (bu kompüterdəki girişi)" onClick={() => setAsk(true)}><Trash2 size={12} /></button>
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
        Aktiv hesabın limiti bitəndə avtomatik növbəti hesaba keç (cavab yarımçıq qalmır, yeni hesabla davam edir)
      </label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {accounts.accounts.map((a) => <AccountRow key={a.id} a={a} active={a.id === accounts.activeId} />)}
      </div>
      <div style={{ marginTop: 10 }}><ClaudeLogin onlyProgress /></div>
      <button className="btn" style={{ marginTop: 10 }} onClick={() => accountAction('', 'POST', {})}><Plus size={13} /> Hesab əlavə et</button>
    </div>
  )
}
