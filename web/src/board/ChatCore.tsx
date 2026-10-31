import { useEffect, useRef } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CircleCheck, CircleX, LoaderCircle, MessageSquarePlus, SendHorizontal, Square } from 'lucide-react'
import ClaudeLogin from './ClaudeLogin'
import { Corners } from './ModuleCard'
import Reactor from './Reactor'
import { useStore } from '../store'

const QUICK = [
  'Bu gün nə etməliyəm?',
  'Mövzum üçün research gap tap',
  'Deadline-ları mənbədən yoxla',
  'Məqaləm üçün jurnal təklif et',
]

const WELCOME = `Salam! Mən **Talvis**-əm - PhD prosesinin mərkəzi. Bütün modulları görürəm və real mənbələrlə işləyirəm (OpenAlex, Semantic Scholar, arXiv, rəsmi universitet səhifələri).

Başlamaq üçün mənə bir mesajda yaz:
1. **Sahən və mövzun** (məs. "NLP, low-resource machine translation")
2. **Mərhələn** (məs. "Fall 2027 üçün PhD müraciəti")
3. **Hədəf ölkələr / universitetlər**

Mən profili, mövzuları və universitetləri board-a yazacam, sonra hər universitetdə mövzunu kimin araşdırdığını, onların məqalələrini və deadline-ları tapacam.`

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
          <div className="core-sub">PhD core · bütün modulları görür</div>
          <div className="core-meta">
            <span className="status-pill" title={claudeInfo.email ?? ''}>
              <span className={`dot ${claude === 'connected' ? 'on' : claude === 'checking' ? 'warn' : 'off'}`} />
              Claude · {claude === 'connected' ? `bağlı${claudeInfo.plan ? ` (${claudeInfo.plan})` : ''}` : claude === 'checking' ? 'yoxlanılır' : 'login lazımdır'}
            </span>
            {!docked && <span className="status-pill">OpenAlex · S2 · arXiv · Web</span>}
          </div>
        </div>
        <button className="icon-btn nodrag" title="Yeni söhbət" onClick={newChat}><MessageSquarePlus size={15} /></button>
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
            <span className="msg-who">{m.role === 'user' ? 'Sən' : 'Talvis'}</span>
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
          placeholder="Talvis-ə yaz... (Enter göndər, Shift+Enter yeni sətir)"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
        />
        {thinking ? (
          <button className="send-btn" onClick={stop} title="Dayandır"><Square size={15} /></button>
        ) : (
          <button className="send-btn" onClick={() => submit()} disabled={!draft.trim()} title="Göndər"><SendHorizontal size={17} /></button>
        )}
      </div>
    </div>
  )
}
