import { useEffect, useState } from 'react'
import { Check, Plus, Save, Search, ShieldAlert, ShieldCheck } from 'lucide-react'
import AccountsSection from './Accounts'
import type { Deadline, Doc, Profile, Task, University } from '../../../shared/types'
import { api, items, type InstitutionHit, type Settings } from '../api'
import { az, dayLabel, daysUntil, fmtDate, todayISO, urgency } from '../lib/util'
import { useStore } from '../store'
import { CONDITIONS, COUNTRY_SUGGESTIONS, CONDITION_BY_KEY, DIRECTION_SUGGESTIONS, LANG_CERT_AZ, RANKING_LIMITS, RANKING_SYSTEMS, rankingLabel } from '../../../shared/criteria'
import { AskTalvis, DeleteBtn, Ext, Field, JobButton, JobLog, Spinner, StatusSelect, TagInput } from './ui'

const UNI_STATUS = ['interested', 'researching', 'applying', 'applied', 'interview', 'accepted', 'rejected'] as const
const DL_KIND = ['application', 'scholarship', 'interview', 'document', 'conference', 'journal', 'other'] as const

// ---------------- Profile + settings ----------------

export function ProfilePanel() {
  const { state, toast } = useStore()
  const [p, setP] = useState<Profile>(state.profile)
  const [dirty, setDirty] = useState(false)
  const [s, setS] = useState<Settings | null>(null)
  // Only reset the form when the saved profile changes, not on every board refresh.
  useEffect(() => {
    setP(state.profile)
    setDirty(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.profile.updatedAt])
  useEffect(() => void api<Settings>('/settings').then(setS), [])
  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => {
    setP((x) => ({ ...x, [k]: v }))
    setDirty(true)
  }
  const save = () =>
    api('/profile', { method: 'PUT', body: p }).then(() => {
      setDirty(false)
      toast('Profil yadda saxlandı')
    })
  const toggleCond = (key: string) => set('conditions', p.conditions.includes(key) ? p.conditions.filter((c) => c !== key) : [...p.conditions, key])

  return (
    <>
      <JobLog module="universities" />
      <div className="toolbar">
        <button className="btn primary" disabled={!dirty} onClick={save}><Save size={13} /> Yadda saxla</button>
        {dirty && <span className="chip amber">saxlanmayıb</span>}
        <span className="grow" />
        <JobButton kind="find_universities" module="universities" label="Bu kriteriyalarla universitet tap" disabled={dirty || !(p.directions.length || state.topics.length)} />
      </div>

      <div className="prof-block">
        <div className="section-label">Hədəflədiyim istiqamətlər</div>
        <TagInput value={p.directions} onChange={(v) => set('directions', v)} suggestions={DIRECTION_SUGGESTIONS} placeholder="məs. Natural Language Processing, Adaptive learning systems" />
      </div>

      <div className="prof-block">
        <div className="section-label">Hədəf ölkələr</div>
        <TagInput value={p.countries} onChange={(v) => set('countries', v)} suggestions={COUNTRY_SUGGESTIONS} placeholder="Ölkə yaz və Enter bas" />
      </div>

      <div className="prof-block">
        <div className="section-label">Universitet reytinqi</div>
        <div className="row" style={{ flexWrap: 'wrap', gap: 10 }}>
          <select className="select" style={{ width: 'auto' }} value={p.rankingSystem} onChange={(e) => set('rankingSystem', e.target.value)}>
            {RANKING_SYSTEMS.map((r) => <option key={r} value={r}>{r === 'any' ? 'İstənilən reytinq' : r}</option>)}
          </select>
          <select className="select" style={{ width: 'auto' }} value={p.rankingMax} onChange={(e) => set('rankingMax', Number(e.target.value))}>
            {RANKING_LIMITS.map((n) => <option key={n} value={n}>{n ? `Top ${n}` : 'Fərq etmir'}</option>)}
          </select>
          <span className="faint" style={{ fontSize: 12 }}>Talvis reytinqi rəsmi reytinq saytından, nəşr ili və link ilə yazır.</span>
        </div>
      </div>

      <div className="prof-block">
        <div className="section-label">Əlavə şərtlər</div>
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
          placeholder="Başqa şərtlər (məs. Erasmus+ əlaqəsi olsun, böyük şəhər, sənaye ilə birgə proqram...)"
          value={p.conditionsNote}
          onChange={(e) => set('conditionsNote', e.target.value)}
        />
      </div>

      <div className="prof-block">
        <div className="section-label">Haqqımda</div>
        <div className="grid2">
          <Field label="Ad"><input className="input" value={p.name} onChange={(e) => set('name', e.target.value)} /></Field>
          <Field label="Sahə"><input className="input" value={p.field} placeholder="məs. Computer Science / NLP" onChange={(e) => set('field', e.target.value)} /></Field>
          <Field label="Mərhələ"><input className="input" value={p.stage} placeholder="məs. PhD müraciəti" onChange={(e) => set('stage', e.target.value)} /></Field>
          <Field label="Hədəf qəbul"><input className="input" value={p.targetTerm} placeholder="məs. Fall 2027" onChange={(e) => set('targetTerm', e.target.value)} /></Field>
          <Field label="Vətəndaşlıq"><input className="input" value={p.citizenship} placeholder="məs. Azərbaycan" onChange={(e) => set('citizenship', e.target.value)} /></Field>
          <Field label="Dillər"><input className="input" value={p.languages} onChange={(e) => set('languages', e.target.value)} /></Field>
          <Field label="Təhsil (dərəcə, universitet, tədris dili)" span={2}>
            <input className="input" value={p.education} placeholder="məs. BSc Computer Science, ADA University, ingilis dilində, 2024" onChange={(e) => set('education', e.target.value)} />
          </Field>
          <Field label="Maraq sahələri" span={2}><textarea className="textarea" value={p.interests} onChange={(e) => set('interests', e.target.value)} /></Field>
          <Field label="Keçmiş (iş, layihələr, nəşrlər)" span={2}><textarea className="textarea" value={p.background} onChange={(e) => set('background', e.target.value)} /></Field>
        </div>
        <p className="faint" style={{ fontSize: 12, lineHeight: 1.5 }}>Vətəndaşlıq və əvvəlki təhsilin dili dil sertifikatından azadlığın (waiver) sənə aid olub-olmadığını müəyyən edir.</p>
      </div>

      <div className="section-label" style={{ margin: '22px 0 12px' }} id="claude-accounts">Claude hesabları</div>
      <AccountsSection />
      <p className="faint" style={{ fontSize: 12, lineHeight: 1.5 }}>
        Talvis sənin Claude abunəliklərinlə işləyir (API açarı lazım deyil). Hər hesab bu kompüterdə ayrıca qovluqda yadda qalır.
      </p>

      {s && (
        <>
          <div className="section-label" style={{ margin: '22px 0 12px' }}>Ayarlar</div>
          <div className="grid3">
            <Field label="Model">
              <select className="select" value={s.model} onChange={(e) => setS({ ...s, model: e.target.value })}>
                <option value="claude-opus-5-5">Claude Opus 5.5 (tövsiyə)</option>
                <option value="claude-sonnet-5-5">Claude Sonnet 5.5 (sürətli)</option>
                <option value="claude-fable-5-1">Claude Fable 5.1 (ən güclü)</option>
                <option value="claude-haiku-5-5">Claude Haiku 5.5 (ən sürətli)</option>
              </select>
            </Field>
            <Field label="Çat dərinliyi">
              <select className="select" value={s.chatEffort} onChange={(e) => setS({ ...s, chatEffort: e.target.value })}>
                {['low', 'medium', 'high', 'xhigh'].map((x) => <option key={x}>{x}</option>)}
              </select>
            </Field>
            <Field label="Araşdırma işləri dərinliyi">
              <select className="select" value={s.jobEffort} onChange={(e) => setS({ ...s, jobEffort: e.target.value })}>
                {['medium', 'high', 'xhigh', 'max'].map((x) => <option key={x}>{x}</option>)}
              </select>
            </Field>
            <Field label="OpenAlex API key (pulsuz)"><input className="input" type="password" value={s.openalexKey} onChange={(e) => setS({ ...s, openalexKey: e.target.value })} /></Field>
            <Field label="Semantic Scholar key (istəyə görə)"><input className="input" type="password" value={s.s2Key} onChange={(e) => setS({ ...s, s2Key: e.target.value })} /></Field>
            <Field label="OpenAlex mailto (istəyə görə)"><input className="input" value={s.mailto} onChange={(e) => setS({ ...s, mailto: e.target.value })} /></Field>
          </div>
          <p className="faint" style={{ fontSize: 12, lineHeight: 1.5 }}>
            OpenAlex açarsız da işləyir, amma IP üzrə gündəlik pulsuz limit kiçikdir. Pulsuz açar: <Ext href="https://openalex.org/settings/api">openalex.org/settings/api</Ext>
          </p>
          <button className="btn" onClick={() => api('/settings', { method: 'PUT', body: s }).then(() => toast('Ayarlar yadda saxlandı'))}><Save size={13} /> Ayarları saxla</button>
        </>
      )}
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
        toast(`${h.name} əlavə olundu`)
        setHits(null)
        setQ('')
      })
      .catch((e) => toast(String(e)))

  const prof = state.profile
  const sorted = [...state.universities].sort((a, b) => (a.rank ?? 99999) - (b.rank ?? 99999))

  return (
    <>
      <JobLog module="universities" />
      <div className="criteria-bar">
        <span className="section-label" style={{ marginRight: 4 }}>Kriteriyalar</span>
        {prof.directions.map((d) => <span key={d} className="chip cyan solid">{d}</span>)}
        {prof.countries.map((c) => <span key={c} className="chip cyan">{c}</span>)}
        <span className="chip">{rankingLabel(prof.rankingSystem, prof.rankingMax)}</span>
        {prof.conditions.map((k) => <span key={k} className="chip green" title={CONDITION_BY_KEY[k]?.label}>{CONDITION_BY_KEY[k]?.short ?? k}</span>)}
        {!prof.directions.length && !prof.countries.length && <span className="faint" style={{ fontSize: 12 }}>Profildə istiqamət, ölkə, reytinq və şərtləri seç.</span>}
        <span className="grow" />
        <button className="btn sm ghost" onClick={() => setExpanded('profile')}>Dəyiş</button>
      </div>
      <div className="toolbar">
        <JobButton kind="find_universities" module="universities" label="AI: kriteriyalara uyğun universitet tap" disabled={!(prof.directions.length || state.topics.length)} />
        <input className="input" style={{ maxWidth: 300 }} value={q} placeholder="Və ya adla axtar (OpenAlex)..." onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} />
        <button className="btn" onClick={search}>{busy ? <Spinner /> : <Search size={13} />} Axtar</button>
        <span className="grow" />
        <JobButton kind="verify_deadlines" module="deadlines" label="Deadline-ları yoxla" disabled={!state.universities.length} />
      </div>
      {hits && (
        <div className="hits" style={{ marginBottom: 16 }}>
          {hits.length === 0 && <div className="empty">Tapılmadı.</div>}
          {hits.map((h) => (
            <div key={h.openalexId} className="hit row">
              <span className="flag">{h.countryCode ?? '?'}</span>
              <div className="grow">
                <div className="hit-title">{h.name}</div>
                <div className="hit-meta">{h.city} · {h.worksCount?.toLocaleString()} iş · <Ext href={h.homepage}>{h.homepage}</Ext></div>
              </div>
              <button className="btn sm" onClick={() => add(h)}><Plus size={12} /> Əlavə et</button>
            </div>
          ))}
        </div>
      )}
      {state.universities.length === 0 ? (
        <div className="muted-box">Hələ universitet yoxdur. "AI: kriteriyalara uyğun universitet tap" profildəki istiqamət, ölkə, reytinq və şərtlərə görə real universitetləri tapıb (reytinq və dil tələbi mənbə linki ilə) bura yazır. Adla da axtarıb əlavə edə bilərsən.</div>
      ) : (
        <table className="table">
          <thead><tr><th>Universitet</th><th>Reytinq</th><th>Dil sertifikatı</th><th>Status</th><th>Tədqiqatçı</th><th>Deadline</th><th>AI</th><th /></tr></thead>
          <tbody>
            {sorted.map((u) => {
              const dls = state.deadlines.filter((d) => d.universityId === u.id && d.status === 'open').sort((a, b) => a.dueDate.localeCompare(b.dueDate))
              const lc = u.langCert ?? 'unknown'
              return (
                <tr key={u.id}>
                  <td style={{ maxWidth: 340 }}>
                    <div className="row"><span className="flag">{u.countryCode || '?'}</span><b>{u.name}</b> <Ext href={u.website} /></div>
                    <div className="faint" style={{ fontSize: 11, marginTop: 3 }}>{u.city}{u.openalexId ? ` · ${u.openalexId}` : ' · OpenAlex id yoxdur'}</div>
                    {u.fitNote && <div className="dim" style={{ fontSize: 11.5, marginTop: 4, lineHeight: 1.45 }}>{u.fitNote}</div>}
                  </td>
                  <td>
                    {u.rankLabel ? <span className="chip cyan">{u.rankLabel}</span> : <span className="faint">-</span>}
                    <div style={{ marginTop: 4 }}><Ext href={u.rankSource}>mənbə</Ext></div>
                  </td>
                  <td style={{ maxWidth: 200 }}>
                    <span className={`chip ${lc === 'not_required' ? 'green' : lc === 'waiver' ? 'amber' : lc === 'required' ? 'red' : ''}`} title={u.langCertNote}>{LANG_CERT_AZ[lc]}</span>
                    {u.langCertNote && <div className="faint" style={{ fontSize: 11, marginTop: 4, lineHeight: 1.4 }}>{u.langCertNote}</div>}
                    <div style={{ marginTop: 4 }}><Ext href={u.langCertSource}>mənbə</Ext></div>
                  </td>
                  <td><StatusSelect value={u.status} options={UNI_STATUS} onChange={(v) => items.patch<University>('universities', u.id, { status: v })} /></td>
                  <td className="mono">{state.researchers.filter((r) => r.universityId === u.id).length}</td>
                  <td>{dls[0] ? <span className={`chip ${urgency(daysUntil(dls[0].dueDate))}`}>{fmtDate(dls[0].dueDate)}</span> : <span className="faint">-</span>}</td>
                  <td>
                    <div className="row" style={{ gap: 6 }}>
                      <JobButton kind="scout_university" module="researchers" params={{ universityId: u.id }} label="Kəşf et" disabled={!(state.topics.length || prof.directions.length)} />
                      <JobButton kind="verify_deadlines" module="deadlines" params={{ universityId: u.id }} label="Deadline" />
                    </div>
                  </td>
                  <td><DeleteBtn coll="universities" id={u.id} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      {state.universities.length > 0 && !state.topics.length && !prof.directions.length && <p className="faint" style={{ fontSize: 12 }}>"Kəşf et" üçün profildə istiqamət və ya Mövzular moduluna mövzu əlavə et.</p>}
    </>
  )
}

// ---------------- Deadlines ----------------

export function DeadlinesPanel() {
  const { state, toast } = useStore()
  const empty = { title: '', dueDate: '', kind: 'application' as Deadline['kind'], universityId: '', program: '', sourceUrl: '', verified: false }
  const [f, setF] = useState(empty)
  const add = () => {
    if (!f.title || !f.dueDate) return toast('Başlıq və tarix lazımdır')
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
        <JobButton kind="verify_deadlines" module="deadlines" label="AI: deadline-ları rəsmi mənbədən yoxla" disabled={!state.universities.length} />
        <span className="faint" style={{ fontSize: 12 }}>Tarixlər yalnız rəsmi səhifədən götürülür; təsdiq olunmayanlar sarı işarələnir.</span>
      </div>
      <div className="cardlet" style={{ marginBottom: 16 }}>
        <div className="grid3">
          <Field label="Başlıq" span={2}><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <Field label="Tarix"><input className="input" type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></Field>
          <Field label="Növ"><StatusSelect value={f.kind} options={DL_KIND} onChange={(v) => setF({ ...f, kind: v })} /></Field>
          <Field label="Universitet">
            <select className="select" value={f.universityId} onChange={(e) => setF({ ...f, universityId: e.target.value })}>
              <option value="">-</option>
              {state.universities.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>
          <Field label="Proqram"><input className="input" value={f.program} onChange={(e) => setF({ ...f, program: e.target.value })} /></Field>
          <Field label="Mənbə URL" span={2}><input className="input" value={f.sourceUrl} onChange={(e) => setF({ ...f, sourceUrl: e.target.value })} /></Field>
          <Field label="Rəsmi mənbədən təsdiqli?">
            <label className="row"><input type="checkbox" checked={f.verified} onChange={(e) => setF({ ...f, verified: e.target.checked })} /> bəli</label>
          </Field>
        </div>
        <button className="btn" style={{ marginTop: 10 }} onClick={add}><Plus size={13} /> Deadline əlavə et</button>
      </div>
      {list.length === 0 ? (
        <div className="muted-box">Hələ deadline yoxdur. Universitet əlavə et və "Deadline yoxla" işini başlat.</div>
      ) : (
        <table className="table">
          <thead><tr><th>Qalıb</th><th>Deadline</th><th>Tarix</th><th>Mənbə</th><th>Status</th><th /></tr></thead>
          <tbody>
            {list.map((d) => {
              const n = daysUntil(d.dueDate)
              return (
                <tr key={d.id} style={{ opacity: d.status === 'open' ? 1 : 0.55 }}>
                  <td><span className={`chip ${d.status === 'open' ? urgency(n) : ''}`}>{dayLabel(n)}</span></td>
                  <td>
                    <b>{d.title}</b>
                    <div className="faint" style={{ fontSize: 11, marginTop: 3 }}>{az(d.kind)}{uni(d.universityId) ? ` · ${uni(d.universityId)}` : ''}{d.program ? ` · ${d.program}` : ''}</div>
                    {d.notes && <div className="dim" style={{ fontSize: 11.5, marginTop: 4 }}>{d.notes}</div>}
                  </td>
                  <td className="mono">{fmtDate(d.dueDate)}{d.dueTime ? ` ${d.dueTime}` : ''}</td>
                  <td>
                    {d.verified ? <span className="chip green"><ShieldCheck size={10} /> təsdiqli</span> : <span className="chip amber"><ShieldAlert size={10} /> təsdiqsiz</span>}
                    <div style={{ marginTop: 4 }}><Ext href={d.sourceUrl}>mənbə</Ext></div>
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

export function TodayPanel() {
  const { state } = useStore()
  const [title, setTitle] = useState('')
  const today = todayISO()
  const add = () => title.trim() && items.create<Task>('tasks', { title, dueDate: today, priority: 2, status: 'todo' }).then(() => setTitle(''))
  const cycle = (t: Task) => items.patch<Task>('tasks', t.id, { status: t.status === 'todo' ? 'doing' : t.status === 'doing' ? 'done' : 'todo' })
  const groups: [string, Task[]][] = [
    ['Gecikmiş', state.tasks.filter((t) => t.status !== 'done' && t.dueDate && t.dueDate < today)],
    ['Bu gün', state.tasks.filter((t) => t.dueDate === today || (!t.dueDate && t.status !== 'done'))],
    ['Gələcək', state.tasks.filter((t) => t.status !== 'done' && t.dueDate && t.dueDate > today)],
  ]
  return (
    <>
      <JobLog module="today" />
      <div className="toolbar">
        <JobButton kind="daily_plan" module="today" label="AI: bugünkü planımı qur" />
        <input className="input" style={{ maxWidth: 380 }} value={title} placeholder="Yeni tapşırıq (bu gün üçün)..." onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className="btn" onClick={add}><Plus size={13} /> Əlavə et</button>
      </div>
      {groups.map(([label, list]) =>
        list.length === 0 ? null : (
          <div key={label} style={{ marginBottom: 18 }}>
            <div className="section-label" style={{ marginBottom: 8 }}>{label} ({list.length})</div>
            <div className="list" style={{ overflow: 'visible' }}>
              {list.sort((a, b) => a.priority - b.priority).map((t) => (
                <div key={t.id} className={`item ${t.status === 'done' ? 'done' : ''}`} style={{ alignItems: 'flex-start', padding: '8px 10px' }}>
                  <button className={`check ${t.status === 'done' ? 'on' : t.status === 'doing' ? 'half' : ''}`} onClick={() => cycle(t)} title="todo → gedir → bitdi">
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
      {state.tasks.length === 0 && <div className="muted-box">Tapşırıq yoxdur. "AI: bugünkü planımı qur" deadline-lara və board-a baxıb plan qurur.</div>}
    </>
  )
}

// ---------------- Documents ----------------

const DOC_KINDS = ['sop', 'proposal', 'cv', 'email', 'cover_letter', 'note'] as const
const DOC_KIND_AZ: Record<string, string> = { sop: 'SOP', proposal: 'Research proposal', cv: 'CV', email: 'Email', cover_letter: 'Cover letter', note: 'Qeyd' }

export function DocumentsPanel() {
  const { state, toast } = useStore()
  const [sel, setSel] = useState<number | null>(state.docs[0]?.id ?? null)
  const [doc, setDoc] = useState<Doc | null>(null)
  useEffect(() => {
    if (sel) items.get<Doc>('docs', sel).then(setDoc).catch(() => setDoc(null))
    else setDoc(null)
  }, [sel])
  const create = () =>
    items.create<Doc>('docs', { title: 'Yeni sənəd', kind: 'note', content: '', status: 'draft' }).then((d) => setSel(d.id))
  const save = () => doc && items.patch<Doc>('docs', doc.id, doc).then(() => toast('Yadda saxlandı'))
  return (
    <div className="split">
      <div>
        <button className="btn" style={{ marginBottom: 10, width: '100%' }} onClick={create}><Plus size={13} /> Yeni sənəd</button>
        <div className="doclist">
          {state.docs.map((d) => (
            <button key={d.id} className={sel === d.id ? 'on' : ''} onClick={() => setSel(d.id)}>
              <div className="ellip" style={{ fontSize: 12.5 }}>{d.title}</div>
              <div className="faint" style={{ fontSize: 10.5, marginTop: 2 }}>{DOC_KIND_AZ[d.kind]} · {az(d.status)}</div>
            </button>
          ))}
        </div>
      </div>
      {doc ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="grid3">
            <Field label="Başlıq"><input className="input" value={doc.title} onChange={(e) => setDoc({ ...doc, title: e.target.value })} /></Field>
            <Field label="Növ">
              <select className="select" value={doc.kind} onChange={(e) => setDoc({ ...doc, kind: e.target.value as Doc['kind'] })}>
                {DOC_KINDS.map((k) => <option key={k} value={k}>{DOC_KIND_AZ[k]}</option>)}
              </select>
            </Field>
            <Field label="Status"><StatusSelect value={doc.status} options={['draft', 'review', 'final'] as const} onChange={(v) => setDoc({ ...doc, status: v })} /></Field>
          </div>
          <textarea className="textarea" style={{ minHeight: 360, fontFamily: 'var(--sans)' }} value={doc.content} onChange={(e) => setDoc({ ...doc, content: e.target.value })} />
          <div className="toolbar">
            <button className="btn primary" onClick={save}><Save size={13} /> Yadda saxla</button>
            <AskTalvis label="Talvis yoxlasın" text={`[S${doc.id}] "${doc.title}" sənədini oxu, PhD komissiyası gözü ilə zəif yerlərini göstər və təkmilləşdirilmiş versiyanı save_document ilə yaz.`} />
            <AskTalvis label="Talvis yazsın" text={`[S${doc.id}] "${doc.title}" (${DOC_KIND_AZ[doc.kind]}) üçün profilimə, mövzularıma və board-dakı real məlumatlara əsaslanan qaralama yaz və save_document ilə saxla.`} />
            <span className="grow" />
            <DeleteBtn coll="docs" id={doc.id} />
          </div>
        </div>
      ) : (
        <div className="muted-box">Sənəd seç və ya yenisini yarat. SOP, research proposal, CV və professorlara email-ləri burada saxla; Talvis board-dakı real məlumatla qaralama yaza bilər.</div>
      )}
    </div>
  )
}
