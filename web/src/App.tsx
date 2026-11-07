import { Suspense, useEffect, useState } from 'react'
import { BookOpen, KeyRound, Library, LoaderCircle, LogOut, Settings2, Sparkles, UserRound, LayoutGrid, ListChecks, X } from 'lucide-react'
import Board from './board/Board'
import Welcome from './board/Welcome'
import ChatCore from './board/ChatCore'
import Logo from './board/Logo'
import ModulePanel from './panels/ModulePanel'
import { useStore, type ViewMode } from './store'
import { openSheet, useNarrow, type Sheet } from './ui/kit'
import { logout, OPEN_PROFILE_KEY, useAuth } from './AuthGate'
import { lazyPage } from './lib/lazy'

// Pages load on first visit; the network page also pulls in React Flow and d3.
const NetworkPage = lazyPage(() => import('./pages/NetworkPage'))
const UniversitiesPage = lazyPage(() => import('./pages/UniversitiesPage'))
const DirectionsPage = lazyPage(() => import('./pages/DirectionsPage'))
const LibraryPage = lazyPage(() => import('./pages/LibraryPage'))
const ClaudeAccountsPanel = lazyPage(() => import('./panels/SettingsPanels').then((m) => ({ default: m.ClaudeAccountsPanel })))
const SettingsPanel = lazyPage(() => import('./panels/SettingsPanels').then((m) => ({ default: m.SettingsPanel })))

const SHEETS: Record<Sheet, { title: string; desc: string; icon: typeof KeyRound }> = {
  accounts: { title: 'Claude accounts', desc: 'The Claude subscriptions Talvis runs on: sign in, switch, see usage', icon: KeyRound },
  settings: { title: 'Settings', desc: 'Your account; for the admin also model, data source keys, browser and TRDesk', icon: Settings2 },
}

/** Configuration opened from the navbar (Claude accounts, settings), over the current page. */
function SheetPanel({ sheet, onClose }: { sheet: Sheet; onClose: () => void }) {
  const def = SHEETS[sheet]
  const Icon = def.icon
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <>
      <div className="panel-veil sheet-veil" onClick={onClose} />
      <section className="panel sheet" aria-label={def.title}>
        <div className="panel-head">
          <span className="panel-icon"><Icon size={20} /></span>
          <div>
            <div className="panel-title">{def.title}</div>
            <div className="panel-desc">{def.desc}</div>
          </div>
          <div className="panel-actions">
            <button className="icon-btn" onClick={onClose} title="Close (Esc)" aria-label="Close"><X size={17} /></button>
          </div>
        </div>
        <div className="panel-body">
          <Suspense fallback={<div className="panel-loading"><LoaderCircle size={20} className="spin" /></div>}>
            {sheet === 'accounts' ? <ClaudeAccountsPanel /> : <SettingsPanel />}
          </Suspense>
        </div>
      </section>
    </>
  )
}

const NAV: [ViewMode, string][] = [
  ['modules', 'Board'],
  ['graph', 'Network'],
  ['directions', 'Directions'],
  ['universities', 'Universities'],
  ['library', 'Library'],
]

function TopBar({ onAsk }: { onAsk: () => void }) {
  const { view, setView, claude, claudeInfo, accounts, demo, toast } = useStore()
  const limited = Boolean(claudeInfo.limitedUntil && claudeInfo.limitedUntil > Date.now())
  const narrow = useNarrow()
  const { user } = useAuth()
  return (
    <header className="topbar">
      <div className="topbar-in">
        <button className="brand" onClick={() => setView('modules')} aria-label="PhD Analyzer, back to the board">
          <Logo />
        </button>
        {!narrow && (
          <nav className="topnav" aria-label="Main">
            {NAV.map(([v, label]) => (
              <button key={v} className={view === v ? 'on' : ''} aria-current={view === v ? 'page' : undefined} onClick={() => setView(v)}>{label}</button>
            ))}
          </nav>
        )}
        <span className="grow" />
        {demo && <span className="demo-badge">Demo data</span>}
        {/* The Claude subscriptions are the server's: only the admin manages them, everyone sees whether Talvis is ready. */}
        <button
          className="btn status-btn"
          title={`Claude${user.admin ? ' accounts' : ''}${claudeInfo.email && user.admin ? ` · active: ${claudeInfo.email}` : ''}`}
          aria-label="Claude status"
          onClick={() => (user.admin ? openSheet('accounts') : toast(claude === 'connected' && !limited ? 'Talvis is ready' : 'Talvis is not connected to Claude: the admin signs it in'))}
        >
          <span className={`dot ${claude === 'connected' && !limited ? 'on' : claude === 'checking' ? 'warn' : 'off'}`} />
          <span className="lbl">Claude{claudeInfo.plan ? ` · ${claudeInfo.plan}` : ''}{user.admin && accounts.accounts.length > 1 && claudeInfo.label ? ` · ${claudeInfo.label}` : ''}</span>
        </button>
        <button className="icon-btn" title="Settings and your account" aria-label="Settings" onClick={() => openSheet('settings')}><Settings2 size={17} /></button>
        <button className="icon-btn" title={`Sign out (${user.email})`} aria-label="Sign out" onClick={logout}><LogOut size={17} /></button>
        {!narrow && (
          <>
            <a className="icon-btn" href="/docs" target="_blank" rel="noreferrer" title="User guide" aria-label="User guide"><BookOpen size={17} /></a>
            <button className="btn dark" onClick={onAsk}><Sparkles size={16} color="#f5b82e" />Ask Talvis</button>
          </>
        )}
      </div>
    </header>
  )
}

/** Phone: ask bar and tab bar along the bottom, as in the design. */
function PhoneBar({ onAsk }: { onAsk: () => void }) {
  const { view, setView, setExpanded } = useStore()
  const tabs: [string, typeof ListChecks, () => void, boolean][] = [
    ['Today', ListChecks, () => { setView('modules'); document.getElementById('board-scroll')?.scrollTo({ top: 0, behavior: 'smooth' }) }, view === 'modules'],
    ['Board', LayoutGrid, () => { setView('modules'); window.setTimeout(() => document.getElementById('board-cards')?.scrollIntoView({ behavior: 'smooth' }), 50) }, false],
    ['Library', Library, () => setView('library'), view === 'library'],
    ['Profile', UserRound, () => setExpanded('profile'), false],
  ]
  return (
    <div className="phonebar">
      <button className="ask-bar" onClick={onAsk}><span>Ask Talvis…</span><span className="send-btn" aria-hidden="true">↑</span></button>
      <nav className="tabbar" aria-label="Sections">
        {tabs.map(([label, Icon, go, on]) => (
          <button key={label} className={on ? 'on' : ''} onClick={go}><i /><Icon size={18} />{label}</button>
        ))}
      </nav>
    </div>
  )
}

export default function App() {
  const { view, toastText, online, setDraft, setExpanded } = useStore()
  const narrow = useNarrow()
  const [drawer, setDrawer] = useState(false)
  const [sheet, setSheet] = useState<Sheet | null>(null)
  useEffect(() => {
    const h = (e: Event) => setSheet((e as CustomEvent<Sheet>).detail)
    window.addEventListener('sheet:open', h)
    return () => window.removeEventListener('sheet:open', h)
  }, [])
  // Right after creating an account the board opens on the Profile, to finish background and conditions.
  useEffect(() => {
    try {
      if (sessionStorage.getItem(OPEN_PROFILE_KEY)) {
        sessionStorage.removeItem(OPEN_PROFILE_KEY)
        setExpanded('profile')
      }
    } catch {
      // Storage blocked: nothing to open.
    }
  }, [setExpanded])
  // The rail on the board answers "Ask Talvis" there; everywhere else (and on phones) the chat opens as a drawer.
  const railShown = view === 'modules' && !narrow

  useEffect(() => {
    const onAsk = (e: Event) => {
      const text = (e as CustomEvent<string>).detail
      if (text) setDraft(text)
      if (railShown) window.dispatchEvent(new Event('talvis:focus'))
      else setDrawer(true)
    }
    window.addEventListener('talvis:ask', onAsk)
    return () => window.removeEventListener('talvis:ask', onAsk)
  }, [railShown, setDraft])
  useEffect(() => {
    if (railShown) setDrawer(false)
  }, [railShown])

  const ask = () => window.dispatchEvent(new CustomEvent('talvis:ask', { detail: '' }))
  const fallback = <div className="panel-loading"><LoaderCircle size={20} className="spin" /></div>

  return (
    <div className={`app ${narrow ? 'is-narrow' : ''}`}>
      <TopBar onAsk={ask} />
      <div className="stage">
        {view === 'modules' ? <Board /> : (
          <Suspense fallback={fallback}>
            {view === 'graph' && <NetworkPage />}
            {view === 'universities' && <UniversitiesPage />}
            {view === 'directions' && <DirectionsPage />}
            {view === 'library' && <LibraryPage />}
          </Suspense>
        )}
        <ModulePanel />
        {sheet && <SheetPanel sheet={sheet} onClose={() => setSheet(null)} />}
        {drawer && !railShown && (
          <>
            <div className="panel-veil" onClick={() => setDrawer(false)} />
            <aside className="chat-drawer" aria-label="Talvis chat"><ChatCore onClose={() => setDrawer(false)} /></aside>
          </>
        )}
        {!online && <div className="offline">No connection to the server. Is <code>npm start</code> running in the terminal?</div>}
        {toastText && <div className="toast" role="status">{toastText}</div>}
      </div>
      {narrow && <PhoneBar onAsk={ask} />}
      <Welcome />
    </div>
  )
}
