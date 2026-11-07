import { useEffect, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ArrowUp, CircleCheck, CircleX, LoaderCircle, MessageSquarePlus, Sparkles, Square, X } from 'lucide-react'
import ClaudeLogin from './ClaudeLogin'
import { fmtClock } from '../lib/util'
import { useStore } from '../store'
import { openSheet } from '../ui/kit'

const QUICK: [string, string][] = [
  ['Plan my day', 'What should I do today?'],
  ['Draft an email to a professor', 'Draft a short email to the best-matching professor on my board.'],
  ['Find gaps', 'Find a research gap for my main topic.'],
]

const WELCOME = `Hi! I'm **Talvis**, your research assistant in PhD Analyzer. I can see every module and I work only with real sources (OpenAlex, Semantic Scholar, arXiv, official university pages).

To get started, tell me:
1. **Your research interests** (e.g. "NLP, HCI, adaptive learning, LLMs")
2. **Your stage** (e.g. "applying for a PhD starting fall 2027")
3. **Target countries** (optional)

I'll group your interests into research directions, then find universities, supervisors, papers, open positions and deadlines for each one.`

function Activity() {
  const { state } = useStore()
  const rows = [...state.activity].slice(-4).reverse()
  return (
    <div className="chat-activity">
      <div className="eyebrow muted">Activity</div>
      {rows.length === 0 && <div className="act-line"><span className="t">No activity yet</span></div>}
      {rows.map((a) => (
        <div key={a.id} className="act-line">
          <span className="ts">{fmtClock(a.at)}</span>
          <span className={`src ${a.source}`}>{a.source === 'ai' ? 'TALVIS' : a.source === 'system' ? 'JOB' : 'YOU'}</span>
          <span className="t">{a.text}</span>
        </div>
      ))}
    </div>
  )
}

/** The Talvis chat: the rail beside the board, or the drawer on other pages. */
export default function ChatCore({ rail = false, onClose }: { rail?: boolean; onClose?: () => void }) {
  const { chat, thinking, send, stop, newChat, claude, claudeInfo, draft, setDraft, state } = useStore()
  const box = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  // Typing stays local so a keystroke doesn't re-render the whole board; the store draft only carries text in.
  const [text, setText] = useState('')

  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight, behavior: 'smooth' })
  }, [chat, thinking])

  useEffect(() => {
    if (!draft) return
    setText(draft)
    setDraft('')
    input.current?.focus()
  }, [draft, setDraft])

  useEffect(() => {
    const focus = () => input.current?.focus()
    window.addEventListener('talvis:focus', focus)
    return () => window.removeEventListener('talvis:focus', focus)
  }, [])

  const submit = (t = text) => {
    const msg = t.trim()
    if (!msg || thinking) return
    send(msg)
    setText('')
  }

  const last = chat.length ? chat[chat.length - 1] : undefined
  const waiting = thinking && (!last || last.role === 'user' || (!last.text && !(last.tools ?? []).length))
  const running = state.jobs.find((j) => j.status === 'running')

  return (
    <div className={`card chat ${rail ? 'rail' : ''} ${thinking ? 'thinking' : ''}`}>
      <div className="chat-head">
        <span className="talvis-mark"><Sparkles size={16} /></span>
        <div className="grow">
          <div className="chat-title">Talvis</div>
          <div className="chat-sub">Reads your whole board · 49 tools</div>
        </div>
        {claude === 'connected'
          ? claudeInfo.plan && <span className="pill t-n">{claudeInfo.plan}</span>
          : <button className="pill t-a" onClick={() => openSheet('accounts')} title="Claude accounts"><span className={`dot ${claude === 'checking' ? 'warn' : 'off'}`} />{claude === 'checking' ? 'checking' : 'sign in'}</button>}
        <button className="icon-ghost" title="New chat" aria-label="New chat" onClick={newChat}><MessageSquarePlus size={16} /></button>
        {onClose && <button className="icon-ghost" title="Close" aria-label="Close chat" onClick={onClose}><X size={17} /></button>}
      </div>

      <ClaudeLogin />

      <div className="chat-msgs" ref={box}>
        {chat.length === 0 && (
          <div className="msg assistant">
            <div className="bubble"><Markdown remarkPlugins={[remarkGfm]}>{WELCOME}</Markdown></div>
          </div>
        )}
        {chat.map((m) => (
          <div key={m.id} className={`msg ${m.role}`}>
            {m.tools && m.tools.length > 0 && (
              <div className="toolrun">
                {m.tools.map((t, i) => (
                  <div key={t.id ?? i} className={`toolline ${t.status === 'done' ? 'done' : t.status === 'error' ? 'err' : ''}`}>
                    {t.status === 'running' ? <LoaderCircle size={12} className="spin" /> : t.status === 'error' ? <CircleX size={12} /> : <CircleCheck size={12} />}
                    <span className="ellip">{t.label}</span>
                  </div>
                ))}
              </div>
            )}
            {m.text && (
              <div className="bubble">
                {m.role === 'assistant' ? (
                  <Markdown remarkPlugins={[remarkGfm]} components={{ a: (p) => <a {...p} target="_blank" rel="noreferrer" /> }}>{m.text}</Markdown>
                ) : m.text}
              </div>
            )}
          </div>
        ))}
        {waiting && <div className="msg assistant"><span className="typing"><i /><i /><i /></span></div>}
        {running && (
          <div className="chat-running"><span className="dot-gold" />Running: {running.title}{running.progress ? ` · ${running.progress}` : ''}</div>
        )}
      </div>

      <div className="chat-chips">
        {QUICK.map(([label, prompt]) => (
          <button key={label} className="qchip" onClick={() => submit(prompt)} disabled={thinking}>{label}</button>
        ))}
      </div>
      <div className="chat-input">
        <textarea
          ref={input}
          rows={1}
          value={text}
          aria-label="Message Talvis"
          placeholder="Ask anything about your board…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
        />
        <span className="pill t-n chat-ctx">Board · 14 modules</span>
        {thinking ? (
          <button className="send-btn" onClick={stop} title="Stop" aria-label="Stop"><Square size={14} /></button>
        ) : (
          <button className="send-btn" onClick={() => submit()} disabled={!text.trim()} title="Send" aria-label="Send"><ArrowUp size={18} /></button>
        )}
      </div>
      {rail && <Activity />}
    </div>
  )
}
