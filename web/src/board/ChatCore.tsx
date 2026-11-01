import { useEffect, useRef } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CircleCheck, CircleX, LoaderCircle, MessageSquarePlus, SendHorizontal, Square } from 'lucide-react'
import ClaudeLogin from './ClaudeLogin'
import { Corners } from './ModuleCard'
import Reactor from './Reactor'
import { useStore } from '../store'

const QUICK = [
  'What should I do today?',
  'Find a research gap for my topic',
  'Verify deadlines from the source',
  'Suggest a journal for my paper',
]

const WELCOME = `Hi! I'm **Talvis**, the research core of PhD Analyzer. I can see every module and I work only with real sources (OpenAlex, Semantic Scholar, arXiv, official university pages).

To get started, tell me:
1. **Your research interests** (e.g. "NLP, HCI, adaptive learning, LLMs")
2. **Your stage** (e.g. "applying for a PhD starting fall 2027")
3. **Target countries** (optional)

I'll group your interests into research directions, then find universities, supervisors, papers, open positions and deadlines for each one.`

/** The Talvis chat, docked to the right of the modules board and the network view. */
export default function ChatCore({ docked = false }: { docked?: boolean }) {
  const { chat, thinking, send, stop, newChat, claude, claudeInfo, draft, setDraft } = useStore()
  const box = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight, behavior: 'smooth' })
  }, [chat, thinking])

  useEffect(() => {
    if (draft) input.current?.focus()
  }, [draft])

  const submit = (t = draft) => {
    const text = t.trim()
    if (!text || thinking) return
    send(text)
    setDraft('')
  }

  const lastText = chat.length ? chat[chat.length - 1] : undefined
  const waiting = thinking && (!lastText || lastText.role === 'user' || (!lastText.text && !(lastText.tools ?? []).length))

  return (
    <div className={`core ${docked ? 'docked' : ''} ${thinking ? 'thinking' : ''}`}>
      <Corners />
      <div className="core-head">
        <Reactor size={docked ? 54 : 76} />
        <div className="grow">
          <div className="core-title">T.A.L.V.I.S</div>
          <div className="core-sub">PhD core · sees all modules</div>
          <div className="core-meta">
            <span className="status-pill" title={claudeInfo.email ?? ''}>
              <span className={`dot ${claude === 'connected' ? 'on' : claude === 'checking' ? 'warn' : 'off'}`} />
              Claude · {claude === 'connected' ? `connected${claudeInfo.plan ? ` (${claudeInfo.plan})` : ''}` : claude === 'checking' ? 'checking' : 'sign-in required'}
            </span>
            {!docked && <span className="status-pill">OpenAlex · S2 · arXiv · Web</span>}
          </div>
        </div>
        <button className="icon-btn nodrag" title="New chat" onClick={newChat}><MessageSquarePlus size={15} /></button>
      </div>

      <ClaudeLogin />

      <div className="core-msgs nowheel nodrag" ref={box}>
        {chat.length === 0 && (
          <div className="msg assistant">
            <span className="msg-who">Talvis</span>
            <div className="bubble"><Markdown remarkPlugins={[remarkGfm]}>{WELCOME}</Markdown></div>
          </div>
        )}
        {chat.map((m) => (
          <div key={m.id} className={`msg ${m.role}`}>
            <span className="msg-who">{m.role === 'user' ? 'You' : 'Talvis'}</span>
            {m.tools && m.tools.length > 0 && (
              <div className="toolrun">
                {m.tools.map((t, i) => (
                  <div key={t.id ?? i} className={`toolline ${t.status === 'done' ? 'done' : t.status === 'error' ? 'err' : ''}`}>
                    {t.status === 'running' ? <LoaderCircle size={11} className="spin" /> : t.status === 'error' ? <CircleX size={11} /> : <CircleCheck size={11} />}
                    <span className="ellip">{t.label}</span>
                  </div>
                ))}
              </div>
            )}
            {m.text && (
              <div className="bubble">
                {m.role === 'assistant' ? (
                  <Markdown remarkPlugins={[remarkGfm]} components={{ a: (p) => <a {...p} target="_blank" rel="noreferrer" /> }}>
                    {m.text}
                  </Markdown>
                ) : (
                  m.text
                )}
              </div>
            )}
          </div>
        ))}
        {waiting && (
          <div className="msg assistant">
            <span className="typing"><i /><i /><i /></span>
          </div>
        )}
      </div>

      <div className="core-chips nodrag">
        {QUICK.map((q) => (
          <button key={q} className="qchip" onClick={() => submit(q)} disabled={thinking}>{q}</button>
        ))}
      </div>
      <div className="core-input nodrag">
        <textarea
          ref={input}
          rows={2}
          value={draft}
          placeholder="Message Talvis... (Enter to send, Shift+Enter for a new line)"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
        />
        {thinking ? (
          <button className="send-btn" onClick={stop} title="Stop"><Square size={15} /></button>
        ) : (
          <button className="send-btn" onClick={() => submit()} disabled={!draft.trim()} title="Send"><SendHorizontal size={17} /></button>
        )}
      </div>
    </div>
  )
}
