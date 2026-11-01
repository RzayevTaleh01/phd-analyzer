import { useEffect, useState } from 'react'
import { BookOpen, ChevronsDownUp, LayoutGrid, Share2 } from 'lucide-react'
import Board from './board/Board'
import Welcome from './board/Welcome'
import NetworkSplit, { DockSplit } from './board/NetworkSplit'
import Reactor from './board/Reactor'
import DirectionBar from './board/DirectionBar'
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
        <div className="hud-stat opt2"><span className="k">Time</span><span className="v">{fmtTime(now)}</span></div>
        <div className="hud-sep opt2" />
        <div className="hud-stat">
          <span className="k">Next deadline</span>
          <span className={`v ${n !== null && n <= 7 ? 'red' : 'amber'}`}>
            {next ? `T-${n}d · ${uni ?? next.title}` : 'none'}
          </span>
        </div>
        <div className="hud-sep" />
        <div className="hud-stat"><span className="k">Today</span><span className="v">{open} tasks</span></div>
        <div className="hud-sep opt2" />
        <div className="hud-stat opt2"><span className="k">Library</span><span className="v">{state.papers.length} papers</span></div>
      </div>
      <div className="hud-right">
        {demo && <span className="demo-badge">DEMO DATA</span>}
        <div className="seg">
          <button className={view === 'modules' ? 'on' : ''} onClick={() => setView('modules')}>
            <LayoutGrid size={11} style={{ verticalAlign: -1, marginRight: 5 }} />Modules
          </button>
          <button className={view === 'graph' ? 'on' : ''} onClick={() => setView('graph')}>
            <Share2 size={11} style={{ verticalAlign: -1, marginRight: 5 }} />Network
          </button>
        </div>
        {view === 'modules' && (
          <button className="icon-btn" title="Close all cards" onClick={() => window.dispatchEvent(new Event('board:reset'))}><ChevronsDownUp size={14} /></button>
        )}
        <a className="icon-btn" href="/docs" target="_blank" rel="noreferrer" title="User guide"><BookOpen size={14} /></a>
        <button
          className="status-pill"
          style={{ background: 'transparent', cursor: 'pointer' }}
          title={`Claude accounts${claudeInfo.email ? ` · active: ${claudeInfo.email}` : ''}`}
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
      <div className="syslog-head"><span className="dot on" />System log</div>
      <div className="syslog-body">
        {rows.length === 0 && <div className="syslog-line faint">No activity yet</div>}
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
      <DirectionBar />
      <div className="stage">
        {view === 'modules' ? (
          <DockSplit key="modules" fixed="board">
            <Board />
            <SystemLog />
          </DockSplit>
        ) : (
          <NetworkSplit />
        )}
        <div className="scanlines" />
        {/* The card column is narrow, so here the panel opens over the whole stage; the network view opens it beside the chat. */}
        {view === 'modules' && <ModulePanel />}
        {!online && <div className="offline">No connection to the server. Is <code>npm start</code> running in the terminal?</div>}
        {toastText && <div className="toast">{toastText}</div>}
      </div>
      <Welcome />
    </div>
  )
}
