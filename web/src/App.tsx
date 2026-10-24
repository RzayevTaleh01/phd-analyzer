import { useEffect, useState } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { Crosshair, LayoutGrid, RotateCcw, Share2 } from 'lucide-react'
import Board from './board/Board'
import NetworkSplit from './board/NetworkSplit'
import Reactor from './board/Reactor'
import ModulePanel from './panels/ModulePanel'
import { daysUntil, fmtClock, fmtDate, fmtTime, todayISO, weekday } from './lib/util'
import { useStore } from './store'

function HudBar() {
  const { state, view, setView, claude, claudeInfo, accounts, setExpanded, demo } = useStore()
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(t)
  }, [])

  const next = state.deadlines
    .filter((d) => d.status === 'open' && daysUntil(d.dueDate) >= 0)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]
  const n = next ? daysUntil(next.dueDate) : null
  const today = todayISO()
  const open = state.tasks.filter((t) => t.status !== 'done' && (!t.dueDate || t.dueDate <= today)).length
  const uni = next?.universityId ? state.universities.find((u) => u.id === next.universityId)?.name : undefined

  return (
    <header className="hud">
      <div className="brand">
        <Reactor size={30} />
        <div>
          <div className="brand-title">PHD ANALYZER</div>
          <div className="brand-sub">TALVIS CORE</div>
        </div>
      </div>
      <div className="hud-center">
        <div className="hud-stat opt1"><span className="k">{weekday(now)}</span><span className="v">{fmtDate(today)}</span></div>
        <div className="hud-sep opt1" />
        <div className="hud-stat opt2"><span className="k">Saat</span><span className="v">{fmtTime(now)}</span></div>
        <div className="hud-sep opt2" />
        <div className="hud-stat">
          <span className="k">Növbəti deadline</span>
          <span className={`v ${n !== null && n <= 7 ? 'red' : 'amber'}`}>
            {next ? `T-${n}g · ${uni ?? next.title}` : 'yoxdur'}
          </span>
        </div>
        <div className="hud-sep" />
        <div className="hud-stat"><span className="k">Bugün</span><span className="v">{open} tapşırıq</span></div>
        <div className="hud-sep opt2" />
        <div className="hud-stat opt2"><span className="k">Kitabxana</span><span className="v">{state.papers.length} məqalə</span></div>
      </div>
      <div className="hud-right">
        {demo && <span className="demo-badge">DEMO DATA</span>}
        <div className="seg">
          <button className={view === 'modules' ? 'on' : ''} onClick={() => setView('modules')}>
            <LayoutGrid size={11} style={{ verticalAlign: -1, marginRight: 5 }} />Modullar
          </button>
          <button className={view === 'graph' ? 'on' : ''} onClick={() => setView('graph')}>
            <Share2 size={11} style={{ verticalAlign: -1, marginRight: 5 }} />Şəbəkə
          </button>
        </div>
        {view === 'modules' && (
          <>
            <button className="icon-btn" title="Hamısını göstər" onClick={() => window.dispatchEvent(new Event('board:fit'))}><Crosshair size={14} /></button>
            <button className="icon-btn" title="Layout-u sıfırla" onClick={() => window.dispatchEvent(new Event('board:reset'))}><RotateCcw size={14} /></button>
          </>
        )}
        <button
          className="status-pill"
          style={{ background: 'transparent', cursor: 'pointer' }}
          title={`Claude hesabları${claudeInfo.email ? ` · aktiv: ${claudeInfo.email}` : ''}`}
          onClick={() => {
            setExpanded('profile')
            window.setTimeout(() => document.getElementById('claude-accounts')?.scrollIntoView({ behavior: 'smooth' }), 200)
          }}
        >
          <span className={`dot ${claude === 'connected' && !(claudeInfo.limitedUntil && claudeInfo.limitedUntil > Date.now()) ? 'on' : claude === 'checking' ? 'warn' : 'off'}`} />
          CLAUDE{accounts.accounts.length > 1 && claudeInfo.label ? ` · ${claudeInfo.label}` : ''}
        </button>
      </div>
    </header>
  )
}

function SystemLog() {
  const { state } = useStore()
  const rows = [...state.activity].slice(-5).reverse()
  return (
    <div className="syslog">
      <div className="syslog-head"><span className="dot on" />Sistem jurnalı</div>
      <div className="syslog-body">
        {rows.length === 0 && <div className="syslog-line faint">Hələ fəaliyyət yoxdur</div>}
        {rows.map((a) => (
          <div key={a.id} className="syslog-line">
            <span className="ts">{fmtClock(a.at)}</span>
            <span className={`src ${a.source}`}>{a.source.toUpperCase()}</span>
            <span className="ellip">{a.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function App() {
  const { view, toastText, online } = useStore()
  return (
    <div className="app">
      <HudBar />
      <div className="stage">
        {view === 'modules' ? (
          <ReactFlowProvider key="modules">
            <Board />
          </ReactFlowProvider>
        ) : (
          <NetworkSplit />
        )}
        {view === 'modules' && <SystemLog />}
        <div className="scanlines" />
        {/* In the network view the panel opens inside the graph area, beside the chat. */}
        {view === 'modules' && <ModulePanel />}
        {!online && <div className="offline">Server ilə əlaqə yoxdur. Terminalda <code>npm run dev</code> işləyirmi?</div>}
        {toastText && <div className="toast">{toastText}</div>}
      </div>
    </div>
  )
}
