import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { AppState, ChatMessage, Job, ModuleKey } from '../../shared/types'
import { filterState } from '../../shared/directions'
import { api, emptyState } from './api'

export type ViewMode = 'modules' | 'graph'

export interface ClaudeState {
  state: 'checking' | 'connected' | 'login_required' | 'error'
  email?: string
  plan?: string
  detail?: string
  label?: string
  limitedUntil?: number
}

export interface LoginState {
  phase: 'idle' | 'starting' | 'waiting_code' | 'verifying' | 'done' | 'error'
  accountId?: string
  url?: string
  message?: string
}

export interface Account {
  id: string
  label: string
  configDir: string | null
  state: ClaudeState['state']
  email?: string
  plan?: string
  detail?: string
  limitedUntil?: number
  limitType?: string
  usage?: { fiveHour?: number | null; fiveHourResetsAt?: string | null; sevenDay?: number | null; sevenDayResetsAt?: string | null }
}

export interface AccountsView {
  accounts: Account[]
  activeId: string
  autoSwitch: boolean
}

interface Store {
  /** The board, filtered to the selected direction group (when one is selected). */
  state: AppState
  /** The whole board, ignoring the direction filter. */
  fullState: AppState
  direction: number | null
  setDirection: (id: number | null) => void
  loaded: boolean
  online: boolean
  demo: boolean
  chat: ChatMessage[]
  thinking: boolean
  live: Partial<Record<ModuleKey, number>>
  expanded: ModuleKey | null
  view: ViewMode
  claude: ClaudeState['state']
  claudeInfo: ClaudeState
  draft: string
  setDraft: (t: string) => void
  setExpanded: (k: ModuleKey | null) => void
  setView: (v: ViewMode) => void
  pulse: (k: ModuleKey, ms?: number) => void
  send: (text: string) => void
  stop: () => void
  newChat: () => void
  loginState: LoginState
  accounts: AccountsView
  accountAction: (path: string, method?: 'POST' | 'PATCH' | 'DELETE' | 'PUT', body?: unknown) => void
  login: (accountId?: string) => void
  submitLoginCode: (code: string) => void
  cancelLogin: () => void
  recheckClaude: () => void
  startJob: (kind: string, params?: Record<string, unknown>) => Promise<void>
  stopJob: (id: string) => void
  refresh: () => void
  toast: (t: string) => void
  toastText: string | null
}

const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(emptyState)
  const [loaded, setLoaded] = useState(false)
  const [online, setOnline] = useState(true)
  const [chat, setChat] = useState<ChatMessage[]>([])
  const [thinking, setThinking] = useState(false)
  const [live, setLive] = useState<Partial<Record<ModuleKey, number>>>({})
  const [expanded, setExpanded] = useState<ModuleKey | null>(null)
  const [view, setView] = useState<ViewMode>('modules')
  const [claudeInfo, setClaudeInfo] = useState<ClaudeState>({ state: 'checking' })
  const [loginState, setLoginState] = useState<LoginState>({ phase: 'idle' })
  const [accounts, setAccounts] = useState<AccountsView>({ accounts: [], activeId: 'main', autoSwitch: true })
  const [draft, setDraft] = useState('')
  const [direction, setDirectionRaw] = useState<number | null>(() => {
    try {
      return Number(localStorage.getItem('talvis.direction')) || null
    } catch {
      return null
    }
  })
  const setDirection = useCallback((id: number | null) => {
    setDirectionRaw(id)
    try {
      localStorage.setItem('talvis.direction', id ? String(id) : '')
    } catch {
      /* private mode */
    }
  }, [])
  const [toastText, setToastText] = useState<string | null>(null)
  const timers = useRef<Record<string, number>>({})
  const refetchTimer = useRef(0)

  const toast = useCallback((t: string) => {
    setToastText(t)
    window.clearTimeout(timers.current.__toast)
    timers.current.__toast = window.setTimeout(() => setToastText(null), 4200)
  }, [])

  const pulse = useCallback((k: ModuleKey, ms = 2600) => {
    setLive((l) => ({ ...l, [k]: Date.now() }))
    window.clearTimeout(timers.current[k])
    timers.current[k] = window.setTimeout(() => {
      setLive((l) => {
        const next = { ...l }
        delete next[k]
        return next
      })
    }, ms)
  }, [])

  const refresh = useCallback(() => {
    api<AppState>('/state')
      .then((s) => {
        setState(s)
        setLoaded(true)
        setOnline(true)
      })
      .catch(() => setOnline(false))
  }, [])

  const loadChat = useCallback(() => {
    api<{ messages: ChatMessage[]; busy: boolean }>('/chat')
      .then((c) => {
        setChat(c.messages)
        setThinking(c.busy)
      })
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    refresh()
    loadChat()
    api<ClaudeState>('/claude').then(setClaudeInfo).catch(() => undefined)
    const es = new EventSource('/api/events')
    // (Re)connected, e.g. after a server restart: pull a fresh snapshot.
    es.onopen = () => {
      setOnline(true)
      refresh()
      loadChat()
      api<ClaudeState>('/claude').then(setClaudeInfo).catch(() => undefined)
      api<LoginState>('/claude/login').then(setLoginState).catch(() => undefined)
      api<AccountsView>('/accounts').then(setAccounts).catch(() => undefined)
    }
    es.addEventListener('login', (e) => setLoginState(JSON.parse((e as MessageEvent).data)))
    es.addEventListener('accounts', (e) => setAccounts(JSON.parse((e as MessageEvent).data)))
    es.onerror = () => setOnline(false)
    es.addEventListener('changed', () => {
      window.clearTimeout(refetchTimer.current)
      refetchTimer.current = window.setTimeout(refresh, 150)
    })
    es.addEventListener('activity', (e) => {
      const a = JSON.parse((e as MessageEvent).data)
      setState((s) => ({ ...s, activity: [...s.activity, a].slice(-60) }))
    })
    es.addEventListener('pulse', (e) => pulse(JSON.parse((e as MessageEvent).data).module))
    es.addEventListener('claude', (e) => setClaudeInfo(JSON.parse((e as MessageEvent).data)))
    es.addEventListener('job', (e) => {
      const j: Job = JSON.parse((e as MessageEvent).data)
      setState((s) => ({ ...s, jobs: [j, ...s.jobs.filter((x) => x.id !== j.id)] }))
      if (j.status === 'running') pulse(j.module, 3000)
    })
    es.addEventListener('chat', (e) => {
      const ev = JSON.parse((e as MessageEvent).data)
      if (ev.kind === 'message') setChat((c) => (c.some((m) => m.id === ev.message.id) ? c : [...c, ev.message]))
      else if (ev.kind === 'start') {
        setThinking(true)
        setChat((c) => [...c, ev.message])
      } else if (ev.kind === 'delta') setChat((c) => c.map((m) => (m.id === ev.id ? { ...m, text: m.text + ev.text } : m)))
      else if (ev.kind === 'tool')
        setChat((c) =>
          c.map((m) => {
            if (m.id !== ev.id || !ev.tool) return m
            const tools = m.tools ?? []
            const i = tools.findIndex((t) => t.id === ev.tool.id)
            return { ...m, tools: i >= 0 ? tools.map((t, k) => (k === i ? ev.tool : t)) : [...tools, ev.tool] }
          }),
        )
      else if (ev.kind === 'done') {
        setThinking(false)
        setChat((c) => c.map((m) => (m.id === ev.message.id ? ev.message : m)))
      } else if (ev.kind === 'reset') {
        setChat([])
        setThinking(false)
      }
    })
    return () => es.close()
  }, [refresh, loadChat, pulse])

  // A remembered direction that no longer exists is ignored.
  const activeDirection = direction && state.directions.some((d) => d.id === direction) ? direction : null
  const shown = useMemo(() => (activeDirection ? filterState(state, activeDirection) : state), [state, activeDirection])

  const send = useCallback(
    (text: string) => {
      api('/chat', { body: { text, directionId: activeDirection } }).catch((e) => toast((e as Error).message))
    },
    [toast, activeDirection],
  )
  const stop = useCallback(() => void api('/chat/stop', { body: {} }), [])
  const newChat = useCallback(() => void api('/chat/new', { body: {} }), [])
  const login = useCallback((accountId?: string) => {
    setLoginState({ phase: 'starting', accountId })
    api<LoginState>('/claude/login', { body: { accountId } }).then(setLoginState).catch((e) => setLoginState({ phase: 'error', message: String(e) }))
  }, [])
  const accountAction = useCallback(
    (path: string, method: 'POST' | 'PATCH' | 'DELETE' | 'PUT' = 'POST', body: unknown = {}) => {
      api<AccountsView | { account: Account; login: LoginState }>(`/accounts${path}`, { method, body: method === 'DELETE' ? undefined : body })
        .then((r) => {
          if ('accounts' in r) setAccounts(r)
          else setLoginState(r.login)
        })
        .catch((e) => toast((e as Error).message))
    },
    [toast],
  )
  const submitLoginCode = useCallback((code: string) => {
    api<LoginState>('/claude/login/code', { body: { code } }).then(setLoginState).catch((e) => setLoginState({ phase: 'error', message: String(e) }))
  }, [])
  const cancelLogin = useCallback(() => void api<LoginState>('/claude/login/cancel', { body: {} }).then(setLoginState), [])
  const recheckClaude = useCallback(() => {
    setClaudeInfo({ state: 'checking' })
    api<ClaudeState>('/claude?refresh=1').then(setClaudeInfo).catch(() => setClaudeInfo({ state: 'error' }))
  }, [])
  const startJob = useCallback(
    async (kind: string, params: Record<string, unknown> = {}) => {
      try {
        await api('/jobs', { body: { kind, ...params } })
        toast('Arxa plan işi başladı - nəticə kartda və çatda görünəcək')
      } catch (e) {
        toast((e as Error).message)
      }
    },
    [toast],
  )
  const stopJob = useCallback((id: string) => void api(`/jobs/${id}/stop`, { body: {} }), [])

  const value = useMemo<Store>(
    () => ({
      state: shown, fullState: state, direction: activeDirection, setDirection, loaded, online, demo: false, chat, thinking, live, expanded, view,
      claude: claudeInfo.state, claudeInfo, draft, setDraft, setExpanded, setView, pulse, send, stop, newChat,
      loginState, accounts, accountAction, login, submitLoginCode, cancelLogin, recheckClaude, startJob, stopJob, refresh, toast, toastText,
    }),
    [shown, state, activeDirection, setDirection, loaded, online, chat, thinking, live, expanded, view, claudeInfo, draft, pulse, send, stop, newChat, loginState, accounts, accountAction, login, submitLoginCode, cancelLogin, recheckClaude, startJob, stopJob, refresh, toast, toastText],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('StoreProvider missing')
  return s
}
