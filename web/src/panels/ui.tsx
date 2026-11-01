import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ExternalLink, Eye, EyeOff, LoaderCircle, Sparkles, Trash2 } from 'lucide-react'
import { admitBand } from '../../../shared/criteria'
import type { ModuleKey } from '../../../shared/types'
import { items, type Coll } from '../api'
import { statusLabel } from '../lib/util'
import { useStore } from '../store'

export function Field({ label, children, span }: { label: string; children: ReactNode; span?: number }) {
  return (
    <div className="field" style={span ? { gridColumn: `span ${span}` } : undefined}>
      <label>{label}</label>
      {children}
    </div>
  )
}

export function Ext({ href, children }: { href?: string; children?: ReactNode }) {
  if (!href) return null
  return (
    <a href={href} target="_blank" rel="noreferrer" className="ext">
      {children ?? <ExternalLink size={12} />}
    </a>
  )
}

export function StatusSelect<T extends string>({ value, options, onChange }: { value: T; options: readonly T[]; onChange: (v: T) => void }) {
  return (
    <select className="select sm" value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => (
        <option key={o} value={o}>{statusLabel(o)}</option>
      ))}
    </select>
  )
}

export function DeleteBtn({ coll, id, label }: { coll: Coll; id: number; label?: string }) {
  const [ask, setAsk] = useState(false)
  const { toast } = useStore()
  if (ask)
    return (
      <span className="row" style={{ gap: 4 }}>
        <button className="btn sm danger" onClick={() => items.remove(coll, id).catch((e) => toast(String(e)))}>Delete</button>
        <button className="btn sm ghost" onClick={() => setAsk(false)}>Cancel</button>
      </span>
    )
  return (
    <button className="mod-btn" title={label ?? 'Delete'} onClick={() => setAsk(true)}>
      <Trash2 size={13} />
    </button>
  )
}

/** Button that starts a background Claude job, showing progress while this module has one running. */
export function JobButton({ kind, params, module, label, disabled }: { kind: string; params?: Record<string, unknown>; module: ModuleKey; label: string; disabled?: boolean }) {
  const { state, startJob, stopJob, claude } = useStore()
  const running = state.jobs.find((j) => j.module === module && j.status === 'running' && j.kind === kind)
  if (running)
    return (
      <span className="row" style={{ gap: 6 }}>
        <span className="chip violet"><LoaderCircle size={10} className="spin" /> {running.progress.slice(0, 60)}</span>
        <button className="btn sm ghost" onClick={() => stopJob(running.id)}>Stop</button>
      </span>
    )
  return (
    <button
      className="btn primary"
      disabled={disabled || claude !== 'connected'}
      title={claude !== 'connected' ? 'Connect to Claude first' : undefined}
      onClick={() => startJob(kind, params)}
    >
      <Sparkles size={13} /> {label}
    </button>
  )
}

export function AskTalvis({ text, label }: { text: string; label: string }) {
  const { setDraft } = useStore()
  return (
    <button className="btn sm ghost" onClick={() => setDraft(text)} title="Puts the text in the chat; you send it">
      <Sparkles size={12} /> {label}
    </button>
  )
}

export function JobLog({ module }: { module: ModuleKey }) {
  const { state } = useStore()
  const jobs = state.jobs.filter((j) => j.module === module).slice(0, 4)
  if (!jobs.length) return null
  return (
    <div className="joblog">
      {jobs.map((j) => (
        <div key={j.id} className="row" style={{ gap: 8 }}>
          <span className={`chip ${j.status === 'running' ? 'violet' : j.status === 'done' ? 'green' : 'red'}`}>
            {j.status === 'running' ? 'running' : j.status === 'done' ? 'done' : 'error'}
          </span>
          <span className="ellip" style={{ fontSize: 12 }}>{j.title}</span>
          <span className="faint ellip" style={{ fontSize: 11 }}>{j.progress}</span>
        </div>
      ))}
    </div>
  )
}

/** Chips with remove buttons, free-text entry (Enter or comma) and one-click suggestions. */
export function TagInput({ value, onChange, suggestions = [], placeholder }: { value: string[]; onChange: (v: string[]) => void; suggestions?: string[]; placeholder?: string }) {
  const [text, setText] = useState('')
  const has = (s: string) => value.some((v) => v.toLowerCase() === s.toLowerCase())
  const add = (raw: string) => {
    const parts = raw.split(',').map((s) => s.trim()).filter((s) => s && !has(s))
    if (parts.length) onChange([...value, ...parts])
    setText('')
  }
  return (
    <div className="taginput">
      <div className="tags">
        {value.map((v) => (
          <span key={v} className="chip cyan solid tag">
            {v}
            <button title="Delete" onClick={() => onChange(value.filter((x) => x !== v))}>×</button>
          </span>
        ))}
        <input
          className="tag-entry"
          value={text}
          placeholder={value.length ? '' : placeholder}
          onChange={(e) => (e.target.value.endsWith(',') ? add(e.target.value) : setText(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add(text)
            } else if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1))
          }}
          onBlur={() => text.trim() && add(text)}
        />
      </div>
      {suggestions.length > 0 && (
        <div className="row" style={{ gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
          {suggestions.filter((s) => !has(s)).map((s) => (
            <button key={s} className="qchip" onClick={() => onChange([...value, s])}>+ {s}</button>
          ))}
        </div>
      )}
    </div>
  )
}

export function Spinner() {
  return <LoaderCircle size={14} className="spin" />
}

/** One line of text while it fits; when it does not, an eye icon that opens the whole text in place. */
export function Peek({ text, label }: { text?: string; label?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [over, setOver] = useState(false)
  const [open, setOpen] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || open) return
    const check = () => setOver(el.scrollWidth > el.clientWidth + 1)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [text, open])
  if (!text) return null
  return (
    <div className={`peek ${open ? 'open' : over ? 'over' : ''}`}>
      <span ref={ref} className="peek-text">{text}</span>
      {(over || open) && (
        <button className="peek-btn" title={open ? 'Hide' : text} onClick={() => setOpen(!open)}>
          {open ? <EyeOff size={13} /> : <Eye size={13} />}
          {label && !open && <span>{label}</span>}
        </button>
      )}
    </div>
  )
}

/** Talvis' admission-chance estimate as a scale coloured by band. */
export function AdmitBar({ chance, compact }: { chance?: number; compact?: boolean }) {
  if (chance === undefined) return compact ? null : <span className="faint">not estimated</span>
  const band = admitBand(chance)
  const style = { '--dc': `var(--${band.tone})` } as CSSProperties
  if (compact)
    return (
      <span className="admit-mini" style={style} title={`Admission chance (Talvis estimate): ${chance}% · ${band.label}`}>
        <span className="admit-track"><i style={{ width: `${chance}%` }} /></span>
        <b>{chance}%</b>
      </span>
    )
  return (
    <span className="admit" style={style}>
      <span className="scorebar"><i style={{ width: `${chance}%` }} /><b>{chance}%</b></span>
      <span className="admit-band">{band.label}</span>
    </span>
  )
}

export const yearNow = new Date().getFullYear()
