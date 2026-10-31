import { useMemo, useState, type CSSProperties } from 'react'
import { ArrowRight, Pencil, Plus, Star } from 'lucide-react'
import type { Direction } from '../../../shared/types'
import { classify, CRITERIA, DIRECTION_COLORS, directionCounts, interestScore, overallScore } from '../../../shared/directions'
import { items } from '../api'
import { useStore } from '../store'
import { DeleteBtn, Ext, Field, JobButton, JobLog, StatusSelect, TagInput } from './ui'

const STATUS = ['exploring', 'leaning', 'chosen', 'dropped'] as const
const STATUS_AZ: Record<Direction['status'], string> = { exploring: 'araşdırılır', leaning: 'meyilliyəm', chosen: 'seçildi', dropped: 'imtina' }
const COUNT_LABELS = [
  ['topics', 'mövzu'],
  ['papers', 'məqalə'],
  ['researchers', 'tədqiqatçı'],
  ['universities', 'universitet'],
  ['positions', 'PhD elanı'],
  ['gaps', 'gap'],
] as const

function ScoreBar({ v, color }: { v?: number; color: string }) {
  if (v === undefined) return <span className="faint">-</span>
  return (
    <span className="scorebar" style={{ '--dc': color } as CSSProperties}>
      <i style={{ width: `${v * 10}%` }} />
      <b>{v}</b>
    </span>
  )
}

function Interest({ d }: { d: Direction }) {
  return (
    <span className="row" style={{ gap: 2 }} title="Bu istiqamətə öz marağın (1-5). Analizdə 15% çəkisi var.">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} className="star-btn" onClick={() => items.patch<Direction>('directions', d.id, { interest: d.interest === n ? undefined : n } as Partial<Direction>)}>
          <Star size={14} fill={d.interest && n <= d.interest ? 'var(--amber)' : 'none'} color={d.interest && n <= d.interest ? 'var(--amber)' : 'var(--text-3)'} />
        </button>
      ))}
    </span>
  )
}

function Editor({ d, onDone }: { d?: Direction; onDone: () => void }) {
  const { fullState, toast } = useStore()
  const [name, setName] = useState(d?.name ?? '')
  const [description, setDescription] = useState(d?.description ?? '')
  const [keywords, setKeywords] = useState<string[]>(d?.keywords ?? [])
  const save = () => {
    if (!name.trim()) return toast('Ad lazımdır')
    const body = { name: name.trim(), description, keywords }
    const req = d
      ? items.patch<Direction>('directions', d.id, body)
      : items.create<Direction>('directions', { ...body, color: DIRECTION_COLORS[fullState.directions.length % DIRECTION_COLORS.length], status: 'exploring' })
    req.then(onDone).catch((e) => toast(String(e)))
  }
  return (
    <div className="prof-block" style={{ marginBottom: 14 }}>
      <div className="grid2">
        <Field label="Ad"><input className="input" value={name} placeholder="məs. Speech / Computer vision" onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Təsvir"><input className="input" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <Field label="Açar sözlər (board elementləri bunlara görə qruplaşır)" span={2}>
          <TagInput value={keywords} onChange={setKeywords} placeholder="məs. NLP, low-resource, tokenizer" />
        </Field>
      </div>
      <div className="row" style={{ gap: 6 }}>
        <button className="btn primary" onClick={save}>Yadda saxla</button>
        <button className="btn ghost" onClick={onDone}>Ləğv</button>
      </div>
    </div>
  )
}

function EvidenceRef({ r }: { r: string }) {
  if (/^https?:\/\//.test(r)) return <Ext href={r}>{new URL(r).hostname.replace(/^www\./, '')}</Ext>
  return <span className="chip">{r.replace(/[[\]]/g, '')}</span>
}

export default function DirectionsPanel() {
  const { fullState, direction, setDirection, setExpanded } = useStore()
  const [editing, setEditing] = useState<number | 'new' | null>(null)
  const dirs = fullState.directions
  const counts = useMemo(() => directionCounts(fullState, classify(fullState)), [fullState])
  const analysed = dirs.filter((d) => d.analysis)
  const best = [...dirs]
    .map((d) => ({ d, s: overallScore(d.analysis?.scores, d.interest) }))
    .filter((x) => x.s !== undefined && x.d.analysis)
    .sort((a, b) => b.s! - a.s!)[0]

  return (
    <>
      <JobLog module="directions" />
      <div className="toolbar">
        <JobButton kind="direction_fit" module="directions" label="AI: istiqamətləri araşdır və müqayisə et" disabled={!dirs.length} />
        <button className="btn" onClick={() => setEditing('new')}><Plus size={13} /> Yeni istiqamət</button>
        <span className="faint" style={{ fontSize: 12 }}>Talvis hər istiqamət üçün eyni dərinlikdə trend, məqalə, rəhbər və PhD elanı axtarır, board-u doldurur və 8 meyarla qiymətləndirir.</span>
      </div>
      {editing === 'new' && <Editor onDone={() => setEditing(null)} />}
      {dirs.some((d) => !d.interest) && (
        <div className="muted-box" style={{ marginBottom: 14, fontSize: 12 }}>
          Hər istiqamət üçün öz marağını ulduzla qiymətləndir: AI bunu təxmin etmir, sənin qiymətin nəticəyə 15% təsir edir.
        </div>
      )}
      {best && analysed.length > 1 && (
        <div className="verdict" style={{ '--dc': best.d.color } as CSSProperties}>
          İndiki sübutlara görə ən uyğun: <b>{best.d.name}</b> ({best.s}/10). Analiz tarixi: {best.d.analysis!.analyzedAt.slice(0, 10)}.
        </div>
      )}

      <div className="dir-grid" style={{ gridTemplateColumns: `repeat(${Math.max(dirs.length, 1)}, minmax(240px, 1fr))` }}>
        {dirs.map((d) => {
          const score = overallScore(d.analysis?.scores, d.interest)
          const c = counts[d.id]
          return (
            <div key={d.id} className={`dir-card ${direction === d.id ? 'on' : ''}`} style={{ '--dc': d.color } as CSSProperties}>
              <div className="row" style={{ gap: 8 }}>
                <span className="dir-dot" />
                <b style={{ fontSize: 15 }}>{d.name}</b>
                <span className="grow" />
                <button className="mod-btn" title="Redaktə" onClick={() => setEditing(editing === d.id ? null : d.id)}><Pencil size={12} /></button>
                <DeleteBtn coll="directions" id={d.id} />
              </div>
              <div className="faint" style={{ fontSize: 11.5, lineHeight: 1.45, margin: '6px 0 10px' }}>{d.description}</div>
              {editing === d.id && <Editor d={d} onDone={() => setEditing(null)} />}
              <div className="row" style={{ gap: 10, alignItems: 'flex-end' }}>
                <div>
                  <div className="big-count" style={{ color: d.color }}>{score ?? '-'}</div>
                  <div className="faint mono" style={{ fontSize: 10 }}>/10 uyğunluq</div>
                </div>
                <span className="grow" />
                <div style={{ textAlign: 'right' }}>
                  <Interest d={d} />
                  <div style={{ marginTop: 6 }}>
                    <StatusSelect value={d.status} options={STATUS} onChange={(v) => items.patch<Direction>('directions', d.id, { status: v })} />
                  </div>
                </div>
              </div>
              <div className="dir-counts">
                {COUNT_LABELS.map(([k, label]) => (
                  <span key={k}><b>{c?.[k] ?? 0}</b> {label}</span>
                ))}
              </div>
              <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                <button className="btn sm" onClick={() => { setDirection(d.id); setExpanded(null) }}><ArrowRight size={12} /> Board-u bu istiqamətə süz</button>
                <JobButton kind="direction_fit" module="directions" params={{ directionId: d.id }} label="Yalnız bunu araşdır" />
              </div>
              <div className="faint" style={{ fontSize: 10.5, marginTop: 8 }}>Status: {STATUS_AZ[d.status]} · açar sözlər: {d.keywords.slice(0, 8).join(', ')}{d.keywords.length > 8 ? '...' : ''}</div>
            </div>
          )
        })}
      </div>

      {dirs.length > 0 && (
        <>
          <div className="section-label" style={{ margin: '20px 0 8px' }}>Meyarlar</div>
          <table className="table">
            <thead>
              <tr>
                <th>Meyar</th>
                <th>Çəki</th>
                {dirs.map((d) => <th key={d.id} style={{ color: d.color }}>{d.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {CRITERIA.map((cr) => (
                <tr key={cr.key}>
                  <td><b>{cr.label}</b><div className="faint" style={{ fontSize: 11 }}>{cr.hint}</div></td>
                  <td className="mono">{Math.round(cr.weight * 100)}%</td>
                  {dirs.map((d) => {
                    const v = cr.key === 'interest' ? interestScore(d.interest) ?? d.analysis?.scores.interest?.score : d.analysis?.scores[cr.key]?.score
                    const note = cr.key === 'interest' && d.interest ? `Sənin qiymətin: ${d.interest}/5` : d.analysis?.scores[cr.key]?.note
                    return (
                      <td key={d.id} style={{ maxWidth: 280 }}>
                        <ScoreBar v={v} color={d.color} />
                        {note && <div className="faint" style={{ fontSize: 11, marginTop: 4, lineHeight: 1.4 }}>{note}</div>}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {analysed.map((d) => {
        const a = d.analysis!
        return (
          <div key={d.id} className="hit" style={{ marginTop: 14, '--dc': d.color } as CSSProperties}>
            <div className="row" style={{ gap: 8 }}>
              <span className="dir-dot" />
              <b>{d.name}</b>
              <span className="faint mono" style={{ fontSize: 11 }}>{a.analyzedAt.slice(0, 10)}</span>
            </div>
            <p className="dim" style={{ fontSize: 12.5, lineHeight: 1.55 }}>{a.summary}</p>
            <div className="grid3" style={{ gap: 14 }}>
              {([['Güclü tərəflər', a.strengths, 'green'], ['Risklər', a.risks, 'red'], ['Növbəti addımlar', a.nextSteps, 'cyan']] as const).map(([label, list, chip]) => (
                <div key={label}>
                  <div className="section-label" style={{ marginBottom: 6 }}><span className={`chip ${chip}`}>{label}</span></div>
                  {list.map((x) => <div key={x} style={{ fontSize: 12, lineHeight: 1.45, marginBottom: 4 }}>- {x}</div>)}
                </div>
              ))}
            </div>
            <div className="section-label" style={{ margin: '10px 0 6px' }}>Sübutlar</div>
            {a.evidence.map((e) => (
              <div key={e.ref + e.note} style={{ fontSize: 12, lineHeight: 1.45, marginBottom: 4 }}><EvidenceRef r={e.ref} /> {e.note}</div>
            ))}
          </div>
        )
      })}
    </>
  )
}
