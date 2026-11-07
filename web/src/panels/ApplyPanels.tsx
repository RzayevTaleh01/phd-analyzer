import { useEffect, useState } from 'react'
import { Check, Plus, Save, Search, ShieldAlert, ShieldCheck } from 'lucide-react'
import type { Deadline, Doc, Profile, Task, University } from '../../../shared/types'
import { api, items, type InstitutionHit } from '../api'
import { statusLabel, dayLabel, daysUntil, fmtDate, todayISO, urgency } from '../lib/util'
import { useStore } from '../store'
import { byAdmitChance, CONDITIONS, COUNTRY_SUGGESTIONS, CONDITION_BY_KEY, DIRECTION_SUGGESTIONS, LANG_CERT_LABEL, RANKING_LIMITS, RANKING_SYSTEMS, rankingLabel } from '../../../shared/criteria'
import { AdmitBar, AskTalvis, DeleteBtn, Ext, Field, JobButton, JobLog, Peek, Spinner, StatusSelect, TagInput } from './ui'

const UNI_STATUS = ['interested', 'researching', 'applying', 'applied', 'interview', 'accepted', 'rejected'] as const
const DL_KIND = ['application', 'scholarship', 'interview', 'document', 'conference', 'journal', 'other'] as const

// ---------------- Profile + settings ----------------

export function ProfilePanel() {
  const { state, toast } = useStore()
  const [p, setP] = useState<Profile>(state.profile)
  const [dirty, setDirty] = useState(false)
  // Only reset the form when the saved profile changes, not on every board refresh.
  useEffect(() => {
    setP(state.profile)
    setDirty(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.profile.updatedAt])
  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => {
    setP((x) => ({ ...x, [k]: v }))
    setDirty(true)
  }
  const save = () =>
    api('/profile', { method: 'PUT', body: p }).then(() => {
      setDirty(false)
      toast('Profile saved')
    })
  const toggleCond = (key: string) => set('conditions', p.conditions.includes(key) ? p.conditions.filter((c) => c !== key) : [...p.conditions, key])

  return (
    <>
      <JobLog module="universities" />
      <div className="toolbar">
        <button className="btn primary" disabled={!dirty} onClick={save}><Save size={13} /> Save</button>
        {dirty && <span className="chip amber">unsaved</span>}
        <span className="grow" />
        <JobButton kind="setup_directions" module="directions" label="Group my interests into directions" disabled={dirty || !p.directions.length} />
        <JobButton kind="find_universities" module="universities" label="Find universities with these criteria" disabled={dirty || !(p.directions.length || state.topics.length || state.directions.length)} />
      </div>

      <div className="prof-block">
        <div className="section-label">Research interests</div>
        <TagInput value={p.directions} onChange={(v) => set('directions', v)} suggestions={DIRECTION_SUGGESTIONS} placeholder="e.g. NLP, HCI, adaptive learning, LLMs" />
        <p className="faint" style={{ fontSize: 12, lineHeight: 1.5, margin: '6px 0 0' }}>
          Write them the way you would say them. Talvis groups them into research directions{state.directions.length ? ` (now: ${state.directions.map((d) => d.name).join(', ')})` : ''} and searches universities, supervisors and papers for each.
        </p>
      </div>

      <div className="prof-block">
        <div className="section-label">Target countries</div>
        <TagInput value={p.countries} onChange={(v) => set('countries', v)} suggestions={COUNTRY_SUGGESTIONS} placeholder="Type a country and press Enter" />
      </div>

      <div className="prof-block">
        <div className="section-label">University ranking</div>
        <div className="row" style={{ flexWrap: 'wrap', gap: 10 }}>
          <select className="select" style={{ width: 'auto' }} value={p.rankingSystem} onChange={(e) => set('rankingSystem', e.target.value)}>
            {RANKING_SYSTEMS.map((r) => <option key={r} value={r}>{r === 'any' ? 'Any ranking' : r}</option>)}
          </select>
          <select className="select" style={{ width: 'auto' }} value={p.rankingMax} onChange={(e) => set('rankingMax', Number(e.target.value))}>
            {RANKING_LIMITS.map((n) => <option key={n} value={n}>{n ? `Top ${n}` : 'No limit'}</option>)}
          </select>
          <span className="faint" style={{ fontSize: 12 }}>Talvis records the ranking from the official ranking site, with the publication year and link.</span>
        </div>
      </div>

      <div className="prof-block">
        <div className="section-label">Additional conditions</div>
        <div className="cond-grid">
          {CONDITIONS.map((c) => (
            <label key={c.key} className={`cond ${p.conditions.includes(c.key) ? 'on' : ''}`}>
              <input type="checkbox" checked={p.conditions.includes(c.key)} onChange={() => toggleCond(c.key)} />
              {c.label}
            </label>
          ))}
        </div>
        <textarea
          className="textarea"
          style={{ marginTop: 8, minHeight: 56 }}
          placeholder="Other conditions (e.g. Erasmus+ links, big city, joint program with industry...)"
          value={p.conditionsNote}
          onChange={(e) => set('conditionsNote', e.target.value)}
        />
      </div>

      <div className="prof-block">
        <div className="section-label">About me</div>
        <div className="grid2">
          <Field label="Name"><input className="input" value={p.name} onChange={(e) => set('name', e.target.value)} /></Field>
          <Field label="Field"><input className="input" value={p.field} placeholder="e.g. Computer Science / NLP" onChange={(e) => set('field', e.target.value)} /></Field>
          <Field label="Stage"><input className="input" value={p.stage} placeholder="e.g. PhD application" onChange={(e) => set('stage', e.target.value)} /></Field>
          <Field label="Target intake"><input className="input" value={p.targetTerm} placeholder="e.g. Fall 2027" onChange={(e) => set('targetTerm', e.target.value)} /></Field>
          <Field label="Citizenship"><input className="input" value={p.citizenship} placeholder="e.g. Brazil" onChange={(e) => set('citizenship', e.target.value)} /></Field>
          <Field label="Languages"><input className="input" value={p.languages} onChange={(e) => set('languages', e.target.value)} /></Field>
          <Field label="Education (degree, university, language of instruction)" span={2}>
            <input className="input" value={p.education} placeholder="e.g. MSc Computer Science, University of X, taught in English, 2025" onChange={(e) => set('education', e.target.value)} />
          </Field>
          <Field label="More about your interests (optional)" span={2}><textarea className="textarea" value={p.interests} placeholder="What questions excite you, what you would like to build or study" onChange={(e) => set('interests', e.target.value)} /></Field>
          <Field label="Background (work, projects, publications)" span={2}><textarea className="textarea" value={p.background} onChange={(e) => set('background', e.target.value)} /></Field>
        </div>
        <p className="faint" style={{ fontSize: 12, lineHeight: 1.5 }}>Your citizenship and the language of your previous education decide whether a language certificate waiver applies to you.</p>
      </div>

    </>
  )
}

// ---------------- Universities ----------------

export function UniversitiesPanel() {
  const { state, toast, setExpanded } = useStore()
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<InstitutionHit[] | null>(null)
  const [busy, setBusy] = useState(false)
  const search = () => {
    if (!q.trim()) return
    setBusy(true)
    api<InstitutionHit[]>(`/research/institutions?q=${encodeURIComponent(q)}`)
      .then(setHits)
      .catch((e) => toast(String(e)))
      .finally(() => setBusy(false))
  }
  const add = (h: InstitutionHit) =>
    api('/universities/resolve', { body: { name: h.name, openalexId: h.openalexId, countryCode: h.countryCode, city: h.city, website: h.homepage } })
      .then(() => {
        toast(`${h.name} added`)
        setHits(null)
        setQ('')
      })
      .catch((e) => toast(String(e)))

  const prof = state.profile
  const sorted = [...state.universities].sort(byAdmitChance)

  return (
    <>
      <JobLog module="universities" />
      <div className="criteria-bar">
        <span className="section-label" style={{ marginRight: 4 }}>Criteria</span>
        {prof.directions.map((d) => <span key={d} className="chip cyan solid">{d}</span>)}
        {prof.countries.map((c) => <span key={c} className="chip cyan">{c}</span>)}
        <span className="chip">{rankingLabel(prof.rankingSystem, prof.rankingMax)}</span>
        {prof.conditions.map((k) => <span key={k} className="chip green" title={CONDITION_BY_KEY[k]?.label}>{CONDITION_BY_KEY[k]?.short ?? k}</span>)}
        {!prof.directions.length && !prof.countries.length && <span className="faint" style={{ fontSize: 12 }}>Choose directions, countries, ranking and conditions in Profile.</span>}
        <span className="grow" />
        <button className="btn sm ghost" onClick={() => setExpanded('profile')}>Edit</button>
      </div>
      <div className="toolbar">
        <JobButton kind="find_universities" module="universities" label="AI: find universities matching the criteria" disabled={!(prof.directions.length || state.topics.length)} />
        <input className="input" style={{ maxWidth: 300 }} value={q} placeholder="Or search by name (OpenAlex)..." onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} />
        <button className="btn" onClick={search}>{busy ? <Spinner /> : <Search size={13} />} Search</button>
        <span className="grow" />
        <JobButton kind="admission_chance" module="universities" label="AI: estimate admission chance" disabled={!state.universities.length} />
        <JobButton kind="verify_deadlines" module="deadlines" label="Verify deadlines" disabled={!state.universities.length} />
      </div>
      {hits && (
        <div className="hits" style={{ marginBottom: 16 }}>
          {hits.length === 0 && <div className="empty">Nothing found.</div>}
          {hits.map((h) => (
            <div key={h.openalexId} className="hit row">
              <span className="flag">{h.countryCode ?? '?'}</span>
              <div className="grow">
                <div className="hit-title">{h.name}</div>
                <div className="hit-meta">{h.city} · {h.worksCount?.toLocaleString()} works · <Ext href={h.homepage}>{h.homepage}</Ext></div>
              </div>
              <button className="btn sm" onClick={() => add(h)}><Plus size={12} /> Add</button>
            </div>
          ))}
        </div>
      )}
      {state.universities.length === 0 ? (
        <div className="muted-box">No universities yet. "AI: find universities matching the criteria" finds real universities based on the directions, countries, ranking and conditions in your profile and writes them here (ranking and language requirement with a source link). You can also search by name and add one.</div>
      ) : (
        <table className="table">
          <thead><tr><th>University</th><th title="Talvis's estimate, based on formal requirements, competition, matching professors, funding and your background">Admission chance</th><th>Ranking</th><th>Language certificate</th><th>Status</th><th>Researchers</th><th>Deadline</th><th>AI</th><th /></tr></thead>
          <tbody>
            {sorted.map((u) => {
              const dls = state.deadlines.filter((d) => d.universityId === u.id && d.status === 'open').sort((a, b) => a.dueDate.localeCompare(b.dueDate))
              const lc = u.langCert ?? 'unknown'
              return (
                <tr key={u.id}>
                  <td style={{ minWidth: 210 }}>
                    <div className="row"><span className="flag">{u.countryCode || '?'}</span><b>{u.name}</b> <Ext href={u.website} /></div>
                    <div className="faint" style={{ fontSize: 11, marginTop: 3 }}>{u.city}{u.openalexId ? ` · ${u.openalexId}` : ' · no OpenAlex id'}</div>
                    <Peek text={u.fitNote} label="fit" />
                  </td>
                  <td style={{ minWidth: 150 }}>
                    <AdmitBar chance={u.admitChance} />
                    <Peek text={u.admitNote} label="why" />
                    {u.admitSource && <div style={{ marginTop: 4 }}><Ext href={u.admitSource}>source</Ext></div>}
                  </td>
                  <td>
                    {u.rankLabel ? <span className="chip cyan">{u.rankLabel}</span> : <span className="faint">-</span>}
                    <div style={{ marginTop: 4 }}><Ext href={u.rankSource}>source</Ext></div>
                  </td>
                  <td style={{ minWidth: 150 }}>
                    <span className={`chip ${lc === 'not_required' ? 'green' : lc === 'waiver' ? 'amber' : lc === 'required' ? 'red' : ''}`} title={u.langCertNote}>{LANG_CERT_LABEL[lc]}</span>
                    <Peek text={u.langCertNote} label="note" />
                    <div style={{ marginTop: 4 }}><Ext href={u.langCertSource}>source</Ext></div>
                  </td>
                  <td><StatusSelect value={u.status} options={UNI_STATUS} onChange={(v) => items.patch<University>('universities', u.id, { status: v })} /></td>
                  <td className="mono">{state.researchers.filter((r) => r.universityId === u.id).length}</td>
                  <td>{dls[0] ? <span className={`chip ${urgency(daysUntil(dls[0].dueDate))}`}>{fmtDate(dls[0].dueDate)}</span> : <span className="faint">-</span>}</td>
                  <td>
                    <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                      <JobButton kind="scout_university" module="researchers" params={{ universityId: u.id }} label="Scout" disabled={!(state.topics.length || prof.directions.length)} />
                      <JobButton kind="verify_deadlines" module="deadlines" params={{ universityId: u.id }} label="Deadline" />
                      <JobButton kind="student_voice" module="insights" params={{ universityId: u.id }} label="Reddit" />
                    </div>
                  </td>
                  <td><DeleteBtn coll="universities" id={u.id} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      {state.universities.length > 0 && !state.topics.length && !prof.directions.length && <p className="faint" style={{ fontSize: 12 }}>To use "Scout", add a direction in Profile or a topic in the Topics module.</p>}
    </>
  )
}

// ---------------- Deadlines ----------------

export function DeadlinesPanel() {
  const { state, toast } = useStore()
  const empty = { title: '', dueDate: '', kind: 'application' as Deadline['kind'], universityId: '', program: '', sourceUrl: '', verified: false }
  const [f, setF] = useState(empty)
  const add = () => {
    if (!f.title || !f.dueDate) return toast('Title and date are required')
    items
      .create<Deadline>('deadlines', { ...f, universityId: f.universityId ? Number(f.universityId) : undefined, verifiedAt: f.verified ? new Date().toISOString() : undefined, status: 'open' })
      .then(() => setF(empty))
  }
  const list = [...state.deadlines].sort((a, b) => Number(a.status !== 'open') - Number(b.status !== 'open') || a.dueDate.localeCompare(b.dueDate))
  const uni = (id?: number) => state.universities.find((u) => u.id === id)?.name

  return (
    <>
      <JobLog module="deadlines" />
      <div className="toolbar">
        <JobButton kind="verify_deadlines" module="deadlines" label="AI: verify deadlines from official sources" disabled={!state.universities.length} />
        <span className="faint" style={{ fontSize: 12 }}>Dates are taken only from official pages; unverified ones are marked amber.</span>
      </div>
      <div className="cardlet" style={{ marginBottom: 16 }}>
        <div className="grid3">
          <Field label="Title" span={2}><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <Field label="Date"><input className="input" type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></Field>
          <Field label="Type"><StatusSelect value={f.kind} options={DL_KIND} onChange={(v) => setF({ ...f, kind: v })} /></Field>
          <Field label="University">
            <select className="select" value={f.universityId} onChange={(e) => setF({ ...f, universityId: e.target.value })}>
              <option value="">-</option>
              {state.universities.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>
          <Field label="Program"><input className="input" value={f.program} onChange={(e) => setF({ ...f, program: e.target.value })} /></Field>
          <Field label="Source URL" span={2}><input className="input" value={f.sourceUrl} onChange={(e) => setF({ ...f, sourceUrl: e.target.value })} /></Field>
          <Field label="Verified from an official source?">
            <label className="row"><input type="checkbox" checked={f.verified} onChange={(e) => setF({ ...f, verified: e.target.checked })} /> yes</label>
          </Field>
        </div>
        <button className="btn" style={{ marginTop: 10 }} onClick={add}><Plus size={13} /> Add deadline</button>
      </div>
      {list.length === 0 ? (
        <div className="muted-box">No deadlines yet. Add a university and start the "Verify deadlines" job.</div>
      ) : (
        <table className="table">
          <thead><tr><th>Left</th><th>Deadline</th><th>Date</th><th>Source</th><th>Status</th><th /></tr></thead>
          <tbody>
            {list.map((d) => {
              const n = daysUntil(d.dueDate)
              return (
                <tr key={d.id} style={{ opacity: d.status === 'open' ? 1 : 0.55 }}>
                  <td><span className={`chip ${d.status === 'open' ? urgency(n) : ''}`}>{dayLabel(n)}</span></td>
                  <td>
                    <b>{d.title}</b>
                    <div className="faint" style={{ fontSize: 11, marginTop: 3 }}>{statusLabel(d.kind)}{uni(d.universityId) ? ` · ${uni(d.universityId)}` : ''}{d.program ? ` · ${d.program}` : ''}</div>
                    {d.notes && <div className="dim" style={{ fontSize: 11.5, marginTop: 4 }}>{d.notes}</div>}
                  </td>
                  <td className="mono">{fmtDate(d.dueDate)}{d.dueTime ? ` ${d.dueTime}` : ''}</td>
                  <td>
                    {d.verified ? <span className="chip green"><ShieldCheck size={10} /> verified</span> : <span className="chip amber"><ShieldAlert size={10} /> unverified</span>}
                    <div style={{ marginTop: 4 }}><Ext href={d.sourceUrl}>source</Ext></div>
                  </td>
                  <td><StatusSelect value={d.status} options={['open', 'done', 'missed'] as const} onChange={(v) => items.patch<Deadline>('deadlines', d.id, { status: v })} /></td>
                  <td><DeleteBtn coll="deadlines" id={d.id} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </>
  )
}

// ---------------- Today ----------------

interface TrTaskView { id: string; date: string; type: string; text: string; minutes: number; section: string; doneOn: string | null }
const TR_TYPE: Record<string, string> = { L: 'lesson', R: 'reading', C: 'code', P: 'paper', W: 'writing', Q: 'test', X: 'review', S: 'other' }

/** The TRDesk "PhD plan": sync the board into it and tick tasks off from here. */
function TrdeskSection() {
  const { toast } = useStore()
  const [data, setData] = useState<{ plan: { title: string }; tasks: TrTaskView[]; overdue: TrTaskView[] } | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const load = () =>
    api<{ plan: { title: string }; tasks: TrTaskView[]; overdue: TrTaskView[] }>('/trdesk/upcoming')
      .then((d) => {
        setData(d)
        setErr('')
      })
      .catch((e) => setErr(String((e as Error).message)))
  useEffect(() => void load(), [])
  const sync = () => {
    setBusy(true)
    api<{ added: string[]; doneFromTrdesk: string[]; doneToTrdesk: string[]; moved: string[] }>('/trdesk/sync', { body: {} })
      .then((r) => {
        toast(`TRDesk: +${r.added.length} tasks, ${r.doneFromTrdesk.length + r.doneToTrdesk.length} completed, ${r.moved.length} moved`)
        return load()
      })
      .catch((e) => toast(String(e)))
      .finally(() => setBusy(false))
  }
  const toggle = (t: TrTaskView) =>
    api(`/trdesk/tasks/${t.id}/done`, { method: 'PUT', body: { done: !t.doneOn } })
      .then(load)
      .catch((e) => toast(String(e)))
  const today = todayISO()
  const rows = data ? [...data.overdue, ...data.tasks].slice(0, 14) : []
  // Optional integration: nothing shows until it answers, and nothing at all without a key.
  if ((!data && !err) || err.includes('TRDesk key')) return null
  return (
    <div className="prof-block" style={{ marginBottom: 16 }}>
      <div className="row" style={{ gap: 8, marginBottom: 8 }}>
        <div className="section-label grow">TRDesk · {data?.plan.title ?? 'PhD plan'}</div>
        <button className="btn sm" disabled={busy} onClick={sync} title="Deadlines and dated tasks are copied to TRDesk; completed tasks sync both ways">
          {busy ? <Spinner /> : null} Sync
        </button>
      </div>
      {err && <div className="muted-box" style={{ fontSize: 12 }}>{err.includes('No TRDesk plan') ? 'No PhD plan yet: "Sync" creates it in TRDesk.' : err}</div>}
      {data && rows.length === 0 && <div className="empty">No upcoming tasks in the TRDesk plan.</div>}
      <div className="list" style={{ overflow: 'visible' }}>
        {rows.map((t) => (
          <div key={t.id} className={`item ${t.doneOn ? 'done' : ''}`}>
            <button className={`check ${t.doneOn ? 'on' : ''}`} onClick={() => toggle(t)} title="Complete / reopen in TRDesk">
              {t.doneOn && <Check size={10} strokeWidth={3} />}
            </button>
            <span className="t" title={t.text}>{t.text}</span>
            <span className="m">{TR_TYPE[t.type] ?? t.type}{t.minutes ? ` · ${t.minutes} min` : ''}</span>
            <span className={`chip ${t.date < today ? 'red' : t.date === today ? 'amber' : 'cyan'}`}>{t.date === today ? 'today' : fmtDate(t.date)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function TodayPanel() {
  const { state } = useStore()
  const [title, setTitle] = useState('')
  const today = todayISO()
  const add = () => title.trim() && items.create<Task>('tasks', { title, dueDate: today, priority: 2, status: 'todo' }).then(() => setTitle(''))
  const cycle = (t: Task) => items.patch<Task>('tasks', t.id, { status: t.status === 'todo' ? 'doing' : t.status === 'doing' ? 'done' : 'todo' })
  const groups: [string, Task[]][] = [
    ['Overdue', state.tasks.filter((t) => t.status !== 'done' && t.dueDate && t.dueDate < today)],
    ['Today', state.tasks.filter((t) => t.dueDate === today || (!t.dueDate && t.status !== 'done'))],
    ['Upcoming', state.tasks.filter((t) => t.status !== 'done' && t.dueDate && t.dueDate > today)],
  ]
  return (
    <>
      <JobLog module="today" />
      <TrdeskSection />
      <div className="toolbar">
        <JobButton kind="daily_plan" module="today" label="AI: build my plan for today" />
        <input className="input" style={{ maxWidth: 380 }} value={title} placeholder="New task (for today)..." onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className="btn" onClick={add}><Plus size={13} /> Add</button>
      </div>
      {groups.map(([label, list]) =>
        list.length === 0 ? null : (
          <div key={label} style={{ marginBottom: 18 }}>
            <div className="section-label" style={{ marginBottom: 8 }}>{label} ({list.length})</div>
            <div className="list" style={{ overflow: 'visible' }}>
              {list.sort((a, b) => a.priority - b.priority).map((t) => (
                <div key={t.id} className={`item ${t.status === 'done' ? 'done' : ''}`} style={{ alignItems: 'flex-start', padding: '8px 10px' }}>
                  <button className={`check ${t.status === 'done' ? 'on' : t.status === 'doing' ? 'half' : ''}`} onClick={() => cycle(t)} title="todo → doing → done">
                    {t.status === 'done' && <Check size={10} strokeWidth={3} />}
                  </button>
                  <div className="grow">
                    <div className="t" style={{ whiteSpace: 'normal' }}>{t.title}</div>
                    {t.notes && <div className="faint" style={{ fontSize: 11.5, marginTop: 3 }}>{t.notes}</div>}
                  </div>
                  <span className="chip">P{t.priority}</span>
                  {t.dueDate && t.dueDate !== today && <span className="chip">{fmtDate(t.dueDate)}</span>}
                  {t.createdBy === 'ai' && <span className="chip violet">AI</span>}
                  <DeleteBtn coll="tasks" id={t.id} />
                </div>
              ))}
            </div>
          </div>
        ),
      )}
      {state.tasks.length === 0 && <div className="muted-box">No tasks yet. "AI: build my plan for today" looks at your deadlines and the board and builds a plan.</div>}
    </>
  )
}

// ---------------- Documents ----------------

const DOC_KINDS = ['sop', 'proposal', 'cv', 'email', 'cover_letter', 'note'] as const
const DOC_KIND_LABEL: Record<string, string> = { sop: 'SOP', proposal: 'Research proposal', cv: 'CV', email: 'Email', cover_letter: 'Cover letter', note: 'Note' }

export function DocumentsPanel() {
  const { state, toast } = useStore()
  const [sel, setSel] = useState<number | null>(state.docs[0]?.id ?? null)
  const [doc, setDoc] = useState<Doc | null>(null)
  useEffect(() => {
    if (sel) items.get<Doc>('docs', sel).then(setDoc).catch(() => setDoc(null))
    else setDoc(null)
  }, [sel])
  const create = () =>
    items.create<Doc>('docs', { title: 'New document', kind: 'note', content: '', status: 'draft' }).then((d) => setSel(d.id))
  const save = () => doc && items.patch<Doc>('docs', doc.id, doc).then(() => toast('Saved'))
  return (
    <div className="split">
      <div>
        <button className="btn" style={{ marginBottom: 10, width: '100%' }} onClick={create}><Plus size={13} /> New document</button>
        <div className="doclist">
          {state.docs.map((d) => (
            <button key={d.id} className={sel === d.id ? 'on' : ''} onClick={() => setSel(d.id)}>
              <div className="ellip" style={{ fontSize: 12.5 }}>{d.title}</div>
              <div className="faint" style={{ fontSize: 10.5, marginTop: 2 }}>{DOC_KIND_LABEL[d.kind]} · {statusLabel(d.status)}</div>
            </button>
          ))}
        </div>
      </div>
      {doc ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="grid3">
            <Field label="Title"><input className="input" value={doc.title} onChange={(e) => setDoc({ ...doc, title: e.target.value })} /></Field>
            <Field label="Type">
              <select className="select" value={doc.kind} onChange={(e) => setDoc({ ...doc, kind: e.target.value as Doc['kind'] })}>
                {DOC_KINDS.map((k) => <option key={k} value={k}>{DOC_KIND_LABEL[k]}</option>)}
              </select>
            </Field>
            <Field label="Status"><StatusSelect value={doc.status} options={['draft', 'review', 'final'] as const} onChange={(v) => setDoc({ ...doc, status: v })} /></Field>
          </div>
          <textarea className="textarea" style={{ minHeight: 360, fontFamily: 'var(--sans)' }} value={doc.content} onChange={(e) => setDoc({ ...doc, content: e.target.value })} />
          <div className="toolbar">
            <button className="btn primary" onClick={save}><Save size={13} /> Save</button>
            <AskTalvis label="Ask Talvis to review" text={`[S${doc.id}] Read the document "${doc.title}", point out its weak spots as a PhD admissions committee would see them, and write the improved version with save_document.`} />
            <AskTalvis label="Ask Talvis to write" text={`[S${doc.id}] Write a draft for "${doc.title}" (${DOC_KIND_LABEL[doc.kind]}) based on my profile, my topics and the real data on the board, and save it with save_document.`} />
            <span className="grow" />
            <DeleteBtn coll="docs" id={doc.id} />
          </div>
        </div>
      ) : (
        <div className="muted-box">Select a document or create a new one. Keep your SOP, research proposal, CV and emails to professors here; Talvis can write a draft from the real data on the board.</div>
      )}
    </div>
  )
}
