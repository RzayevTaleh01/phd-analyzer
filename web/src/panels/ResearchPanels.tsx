import { Fragment, useEffect, useState } from 'react'
import { BookmarkPlus, ChevronDown, ChevronRight, LineChart, Plus, Search } from 'lucide-react'
import type { Gap, Group, Paper, Researcher, Topic, Venue } from '../../../shared/types'
import { api, items, type AuthorHit, type VenueHit, type WorkHit } from '../api'
import { az, initials } from '../lib/util'
import { useStore } from '../store'
import { AskTalvis, DeleteBtn, Ext, Field, JobButton, JobLog, Spinner, StatusSelect, yearNow } from './ui'

const doiUrl = (doi?: string) => (doi ? `https://doi.org/${doi}` : undefined)
const oaUrl = (id?: string) => (id ? `https://openalex.org/${id}` : undefined)

// Lets other panels open the paper search with a query.
let pendingPaperQuery = ''
export function openPaperSearch(q: string, open: () => void) {
  pendingPaperQuery = q
  open()
}

function Dots({ n }: { n: number }) {
  return (
    <span className="dots5" style={{ '--accent': 'var(--violet)' } as React.CSSProperties}>
      {[1, 2, 3, 4, 5].map((i) => <i key={i} className={i <= n ? 'on' : ''} />)}
    </span>
  )
}

function WorkCard({ h, onSave, saved }: { h: WorkHit; onSave?: () => void; saved?: boolean }) {
  const [more, setMore] = useState(false)
  const abs = h.tldr ?? h.abstract
  return (
    <div className="hit">
      <div className="hit-title">{h.title}</div>
      <div className="hit-meta">
        <span>{h.authors.slice(0, 4).join(', ')}{h.authors.length > 4 ? ' et al.' : ''}</span>
        <span className="chip">{h.year ?? '-'}</span>
        {h.venue && <span className="ellip" style={{ maxWidth: 280 }}>{h.venue}</span>}
        <span className="mono">{h.citedBy ?? 0} sitat</span>
        <span className="chip">{h.source === 's2' ? 'Semantic Scholar' : h.source === 'arxiv' ? 'arXiv' : 'OpenAlex'}</span>
      </div>
      {abs && (
        <div className="hit-abs">
          {h.tldr && <b style={{ color: 'var(--cyan-2)' }}>TLDR: </b>}
          {more || abs.length < 320 ? abs : `${abs.slice(0, 320)}...`}
          {abs.length >= 320 && <button className="mod-btn" style={{ width: 'auto', padding: '0 4px', fontSize: 11 }} onClick={() => setMore(!more)}>{more ? 'az' : 'çox'}</button>}
        </div>
      )}
      <div className="hit-actions">
        {onSave && (
          <button className="btn sm" disabled={saved} onClick={onSave}><BookmarkPlus size={12} /> {saved ? 'Kitabxanada' : 'Yadda saxla'}</button>
        )}
        <Ext href={doiUrl(h.doi) ?? h.url}>link</Ext>
        {h.pdfUrl && <Ext href={h.pdfUrl}>PDF</Ext>}
        {h.openalexId && <Ext href={oaUrl(h.openalexId)}>OpenAlex</Ext>}
      </div>
    </div>
  )
}

function useSavePaper() {
  const { toast } = useStore()
  const [savedKeys, setSaved] = useState<Set<string>>(new Set())
  const key = (h: WorkHit) => h.doi ?? h.openalexId ?? h.s2Id ?? h.arxivId ?? h.title
  const save = (h: WorkHit, topicIds: number[], researcherIds: number[] = []) =>
    api('/research/save-paper', { body: { hit: h, topicIds, researcherIds } })
      .then(() => setSaved((s) => new Set(s).add(key(h))))
      .catch((e) => toast(String(e)))
  return { save, isSaved: (h: WorkHit) => savedKeys.has(key(h)) }
}

// ---------------- Topics ----------------

function Trend({ q }: { q: string }) {
  const [data, setData] = useState<{ year: number; works: number }[] | null>(null)
  useEffect(() => void api<{ year: number; works: number }[]>(`/research/trend?q=${encodeURIComponent(q)}&from=2012`).then(setData).catch(() => setData([])), [q])
  if (!data) return <Spinner />
  if (!data.length) return <span className="faint">məlumat yoxdur</span>
  const max = Math.max(...data.map((d) => d.works))
  return (
    <div>
      <div className="trend">{data.map((d) => <i key={d.year} title={`${d.year}: ${d.works}`} style={{ height: `${(d.works / max) * 100}%` }} />)}</div>
      <div className="row between faint mono" style={{ fontSize: 9.5, marginTop: 3 }}><span>{data[0].year}</span><span>OpenAlex: ildə nəşr sayı</span><span>{data[data.length - 1].year}</span></div>
    </div>
  )
}

export function TopicsPanel() {
  const { state, setExpanded } = useStore()
  const empty = { title: '', keywords: '', description: '', priority: '2' }
  const [f, setF] = useState(empty)
  const [trend, setTrend] = useState<number | null>(null)
  const add = () =>
    f.title.trim() &&
    items
      .create<Topic>('topics', { title: f.title, description: f.description, keywords: f.keywords.split(',').map((k) => k.trim()).filter(Boolean), priority: Number(f.priority) as 1 | 2 | 3, status: 'active' })
      .then(() => setF(empty))
  return (
    <>
      <JobLog module="gaps" />
      <div className="cardlet" style={{ marginBottom: 16 }}>
        <div className="grid3">
          <Field label="Mövzu" span={2}><input className="input" value={f.title} placeholder="məs. Low-resource machine translation" onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <Field label="Prioritet">
            <select className="select" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>
              <option value="1">P1 - əsas</option><option value="2">P2</option><option value="3">P3</option>
            </select>
          </Field>
          <Field label="Açar sözlər (vergüllə)" span={3}><input className="input" value={f.keywords} onChange={(e) => setF({ ...f, keywords: e.target.value })} /></Field>
          <Field label="Təsvir" span={3}><input className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        </div>
        <button className="btn" style={{ marginTop: 10 }} onClick={add}><Plus size={13} /> Mövzu əlavə et</button>
      </div>
      <div className="grid2">
        {state.topics.map((t) => (
          <div key={t.id} className="cardlet">
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <span className="chip cyan solid">P{t.priority}</span>
              <h4 className="grow">{t.title}</h4>
              <DeleteBtn coll="topics" id={t.id} />
            </div>
            {t.description && <p className="dim" style={{ fontSize: 12, margin: '4px 0 8px' }}>{t.description}</p>}
            <div className="row" style={{ flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>{t.keywords.map((k) => <span key={k} className="chip">{k}</span>)}</div>
            <div className="row faint mono" style={{ fontSize: 10.5, gap: 14, marginBottom: 10 }}>
              <span>{state.papers.filter((p) => p.topicIds.includes(t.id)).length} məqalə</span>
              <span>{state.gaps.filter((g) => g.topicId === t.id).length} gap</span>
              <span>{state.researchers.filter((r) => r.topicIds.includes(t.id)).length} tədqiqatçı</span>
            </div>
            {trend === t.id && <div style={{ marginBottom: 10 }}><Trend q={t.title} /></div>}
            <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
              <JobButton kind="gap_analysis" module="gaps" params={{ topicId: t.id }} label="Gap analizi" />
              <button className="btn sm ghost" onClick={() => openPaperSearch(t.title, () => setExpanded('papers'))}><Search size={12} /> Məqalə axtar</button>
              <button className="btn sm ghost" onClick={() => setTrend(trend === t.id ? null : t.id)}><LineChart size={12} /> Trend</button>
              <StatusSelect value={t.status} options={['active', 'paused', 'archived'] as const} onChange={(v) => items.patch<Topic>('topics', t.id, { status: v })} />
            </div>
          </div>
        ))}
      </div>
      {state.topics.length === 0 && <div className="muted-box">Mövzu yoxdur. Yuxarıda əlavə et və ya Talvis-ə mövzunu yaz.</div>}
    </>
  )
}

// ---------------- Groups ----------------

export function GroupsPanel() {
  const { state } = useStore()
  const empty = { name: '', universityId: '', piName: '', url: '', description: '' }
  const [f, setF] = useState(empty)
  const add = () => f.name && items.create<Group>('groups', { ...f, universityId: f.universityId ? Number(f.universityId) : undefined, topicIds: [] }).then(() => setF(empty))
  const uni = (id?: number) => state.universities.find((u) => u.id === id)?.name
  return (
    <>
      <div className="cardlet" style={{ marginBottom: 16 }}>
        <div className="grid3">
          <Field label="Qrup / lab adı"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Universitet">
            <select className="select" value={f.universityId} onChange={(e) => setF({ ...f, universityId: e.target.value })}>
              <option value="">-</option>
              {state.universities.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>
          <Field label="PI (rəhbər)"><input className="input" value={f.piName} onChange={(e) => setF({ ...f, piName: e.target.value })} /></Field>
          <Field label="URL" span={3}><input className="input" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} /></Field>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn" onClick={add}><Plus size={13} /> Qrup əlavə et</button>
          <span className="faint" style={{ fontSize: 12 }}>Universitetlərdə "Kəşf et" işi qrupları avtomatik tapır.</span>
        </div>
      </div>
      <div className="grid2">
        {state.groups.map((g) => (
          <div key={g.id} className="cardlet">
            <div className="row"><h4 className="grow">{g.name}</h4><Ext href={g.url} /><DeleteBtn coll="groups" id={g.id} /></div>
            <div className="dim" style={{ fontSize: 12 }}>{uni(g.universityId) ?? '-'}{g.piName ? ` · PI: ${g.piName}` : ''}</div>
            {g.description && <p className="dim" style={{ fontSize: 12, marginBottom: 0 }}>{g.description}</p>}
            <div className="row" style={{ flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
              {state.researchers.filter((r) => r.groupId === g.id).map((r) => <span key={r.id} className="chip cyan">{r.name}</span>)}
            </div>
          </div>
        ))}
      </div>
      {state.groups.length === 0 && <div className="muted-box">Qrup yoxdur.</div>}
    </>
  )
}

// ---------------- Researchers ----------------

function AuthorWorks({ id, query, researcherId }: { id: string; query?: string; researcherId?: number }) {
  const { state } = useStore()
  const [works, setWorks] = useState<WorkHit[] | null>(null)
  const { save, isSaved } = useSavePaper()
  useEffect(() => void api<WorkHit[]>(`/research/author-works?id=${id}&limit=12${query ? `&q=${encodeURIComponent(query)}` : ''}`).then(setWorks).catch(() => setWorks([])), [id, query])
  if (!works) return <div style={{ padding: 10 }}><Spinner /></div>
  const topicIds = state.topics.slice(0, 1).map((t) => t.id)
  return (
    <div className="hits" style={{ padding: '8px 0' }}>
      {works.length === 0 && <div className="empty">İş tapılmadı.</div>}
      {works.map((w) => <WorkCard key={w.openalexId} h={w} saved={isSaved(w)} onSave={() => save(w, topicIds, researcherId ? [researcherId] : [])} />)}
    </div>
  )
}

export function ResearchersPanel() {
  const { state, toast } = useStore()
  const [tab, setTab] = useState<'saved' | 'find'>(state.researchers.length ? 'saved' : 'find')
  const [open, setOpen] = useState<number | null>(null)
  const unis = state.universities.filter((u) => u.openalexId)
  const [uniId, setUniId] = useState<number | ''>(unis[0]?.id ?? '')
  const [q, setQ] = useState(state.topics[0]?.title ?? state.profile.directions[0] ?? '')
  const [hits, setHits] = useState<AuthorHit[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [openHit, setOpenHit] = useState<string | null>(null)
  const uni = state.universities.find((u) => u.id === uniId)
  const uniName = (id?: number) => state.universities.find((u) => u.id === id)?.name ?? '-'

  const find = () => {
    if (!uni?.openalexId || !q.trim()) return toast('Universitet və mövzu seç')
    setBusy(true)
    api<AuthorHit[]>(`/research/researchers?institutionId=${uni.openalexId}&q=${encodeURIComponent(q)}&limit=15`)
      .then(setHits)
      .catch((e) => toast(String(e)))
      .finally(() => setBusy(false))
  }
  const saveHit = (a: AuthorHit) => {
    const topic = state.topics.find((t) => t.title === q)
    api('/research/save-researcher', { body: { openalexId: a.openalexId, universityId: uni?.id, topicIds: topic ? [topic.id] : [], topicWorks: a.topicWorks } })
      .then(() => toast(`${a.name} yadda saxlandı`))
      .catch((e) => toast(String(e)))
  }
  const savedIds = new Set(state.researchers.map((r) => r.openalexId))
  const sorted = [...state.researchers].sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0) || (b.topicWorks ?? 0) - (a.topicWorks ?? 0))

  return (
    <>
      <JobLog module="researchers" />
      <div className="tabs">
        <button className={tab === 'saved' ? 'on' : ''} onClick={() => setTab('saved')}>Saxlanılanlar ({state.researchers.length})</button>
        <button className={tab === 'find' ? 'on' : ''} onClick={() => setTab('find')}>Kəşf (OpenAlex)</button>
      </div>

      {tab === 'find' && (
        <>
          <div className="toolbar">
            <select className="select" style={{ maxWidth: 260 }} value={uniId} onChange={(e) => setUniId(e.target.value ? Number(e.target.value) : '')}>
              {unis.length === 0 && <option value="">Əvvəl universitet əlavə et</option>}
              {unis.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <input className="input" style={{ maxWidth: 340 }} value={q} placeholder="Mövzu / açar söz" onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && find()} />
            <button className="btn" onClick={find}>{busy ? <Spinner /> : <Search size={13} />} Kim araşdırır?</button>
            {uni && <JobButton kind="scout_university" module="researchers" params={{ universityId: uni.id }} label="AI ilə tam kəşf" disabled={!(state.topics.length || state.profile.directions.length)} />}
          </div>
          <div className="row" style={{ gap: 4, flexWrap: 'wrap', marginBottom: 12 }}>
            {state.topics.map((t) => <button key={t.id} className="qchip" onClick={() => setQ(t.title)}>{t.title}</button>)}
            {state.profile.directions.map((d) => <button key={d} className="qchip" onClick={() => setQ(d)}>{d}</button>)}
          </div>
          {hits && (
            <div className="hits">
              {hits.length === 0 && <div className="empty">Bu universitetdə bu mövzuda nəşr tapılmadı. Başqa ifadə yoxla.</div>}
              {hits.map((a) => (
                <div key={a.openalexId} className="hit">
                  <div className="row">
                    <span className="avatar">{initials(a.name)}</span>
                    <div className="grow">
                      <div className="hit-title">{a.name}</div>
                      <div className="hit-meta">
                        <span>{a.institution ?? '-'}</span>
                        {a.isCurrent === false && <span className="chip amber">artıq orada olmaya bilər</span>}
                        <span className="mono">h{a.hIndex ?? '?'}</span>
                        <span className="mono">{a.topicWorks} uyğun iş</span>
                        <span className="mono">{a.worksCount} iş · {a.citedBy?.toLocaleString()} sitat</span>
                      </div>
                      <div className="row" style={{ gap: 4, flexWrap: 'wrap', marginTop: 6 }}>{a.topics.slice(0, 4).map((t) => <span key={t} className="chip">{t}</span>)}</div>
                    </div>
                    <button className="btn sm" disabled={savedIds.has(a.openalexId)} onClick={() => saveHit(a)}><BookmarkPlus size={12} /> {savedIds.has(a.openalexId) ? 'Saxlanıb' : 'Yadda saxla'}</button>
                    <button className="btn sm ghost" onClick={() => setOpenHit(openHit === a.openalexId ? null : a.openalexId)}>İşləri</button>
                  </div>
                  {openHit === a.openalexId && <AuthorWorks id={a.openalexId} query={q} />}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'saved' &&
        (sorted.length === 0 ? (
          <div className="muted-box">Hələ tədqiqatçı yoxdur. "Kəşf" tabında universitet + mövzu seç, və ya universitetdə "Kəşf et" AI işini başlat.</div>
        ) : (
          <table className="table">
            <thead><tr><th /><th>Tədqiqatçı</th><th>h</th><th>Uyğunluq</th><th>Əlaqə</th><th>Linklər</th><th /></tr></thead>
            <tbody>
              {sorted.map((r) => (
                <Fragment key={r.id}>
                  <tr>
                    <td><button className="mod-btn" onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button></td>
                    <td>
                      <b>{r.name}</b>
                      <div className="faint" style={{ fontSize: 11, marginTop: 3 }}>{uniName(r.universityId)}{r.position ? ` · ${r.position}` : ''}</div>
                      <div className="row" style={{ gap: 4, flexWrap: 'wrap', marginTop: 5 }}>{r.concepts.slice(0, 3).map((c) => <span key={c} className="chip">{c}</span>)}</div>
                    </td>
                    <td className="mono">{r.hIndex ?? '-'}</td>
                    <td style={{ minWidth: 110 }}>
                      <div className="row" style={{ gap: 6 }}><div className="bar grow"><i style={{ width: `${r.relevance ?? 0}%` }} /></div><span className="mono" style={{ fontSize: 10.5 }}>{r.relevance ?? '-'}</span></div>
                      <div className="faint mono" style={{ fontSize: 10, marginTop: 3 }}>{r.topicWorks ?? 0} mövzu işi</div>
                    </td>
                    <td><StatusSelect value={r.status} options={['new', 'to_contact', 'contacted', 'replied', 'meeting', 'declined'] as const} onChange={(v) => items.patch<Researcher>('researchers', r.id, { status: v })} /></td>
                    <td>
                      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                        <Ext href={r.homepage}>sayt</Ext>
                        {r.email && <a className="ext" href={`mailto:${r.email}`}>email</a>}
                        <Ext href={r.orcid}>ORCID</Ext>
                        <Ext href={oaUrl(r.openalexId)}>OpenAlex</Ext>
                      </div>
                    </td>
                    <td><DeleteBtn coll="researchers" id={r.id} /></td>
                  </tr>
                  {open === r.id && (
                    <tr>
                      <td />
                      <td colSpan={6}>
                        <div className="toolbar" style={{ marginBottom: 4 }}>
                          <AskTalvis label="Email qaralaması" text={`[R${r.id}] ${r.name} üçün ilk email qaralamasını yaz: onun son işlərindən 1-2-sinə real istinad et, mənim profilim və mövzumla əlaqələndir, qısa saxla və save_document ilə saxla.`} />
                          <AskTalvis label="Uyğunluğu təhlil et" text={`[R${r.id}] ${r.name} mənim üçün nə qədər uyğun supervisor-dur? Son işlərinə bax və səbəbləri ilə qiymətləndir.`} />
                        </div>
                        {r.openalexId ? <AuthorWorks id={r.openalexId} researcherId={r.id} query={state.topics.find((t) => r.topicIds.includes(t.id))?.title} /> : <div className="empty">OpenAlex id yoxdur.</div>}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        ))}
    </>
  )
}

// ---------------- Papers ----------------

function PaperRow({ p }: { p: Paper }) {
  const { state } = useStore()
  const [open, setOpen] = useState(false)
  const [full, setFull] = useState<Paper | null>(null)
  const [notes, setNotes] = useState(p.notes ?? '')
  useEffect(() => {
    if (open && !full) items.get<Paper>('papers', p.id).then(setFull)
  }, [open, full, p.id])
  const toggleTopic = (id: number) => items.patch<Paper>('papers', p.id, { topicIds: p.topicIds.includes(id) ? p.topicIds.filter((x) => x !== id) : [...p.topicIds, id] })
  return (
    <div className="hit">
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <button className="mod-btn" onClick={() => setOpen(!open)}>{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
        <div className="grow">
          <div className="hit-title">[P{p.id}] {p.title}</div>
          <div className="hit-meta">
            <span>{p.authors.slice(0, 3).join(', ')}{p.authors.length > 3 ? ' et al.' : ''}</span>
            <span className="chip">{p.year ?? '-'}</span>
            {p.venue && <span className="ellip" style={{ maxWidth: 260 }}>{p.venue}</span>}
            <span className="mono">{p.citedBy ?? 0} sitat</span>
            <Ext href={doiUrl(p.doi) ?? p.url}>link</Ext>
            {p.pdfUrl && <Ext href={p.pdfUrl}>PDF</Ext>}
          </div>
        </div>
        <StatusSelect value={p.status} options={['to_read', 'reading', 'read', 'key'] as const} onChange={(v) => items.patch<Paper>('papers', p.id, { status: v })} />
        <DeleteBtn coll="papers" id={p.id} />
      </div>
      {open && (
        <div style={{ paddingLeft: 32, marginTop: 8 }}>
          {full?.tldr && <div className="hit-abs"><b style={{ color: 'var(--cyan-2)' }}>TLDR: </b>{full.tldr}</div>}
          <div className="hit-abs">{full ? full.abstract ?? 'Abstract yoxdur.' : <Spinner />}</div>
          <div className="row" style={{ gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
            {state.topics.map((t) => (
              <button key={t.id} className={`qchip ${p.topicIds.includes(t.id) ? 'on' : ''}`} onClick={() => toggleTopic(t.id)}>{p.topicIds.includes(t.id) ? '✓ ' : ''}{t.title}</button>
            ))}
          </div>
          <textarea className="textarea" style={{ marginTop: 8, minHeight: 60 }} placeholder="Qeydlər..." value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== (p.notes ?? '') && items.patch<Paper>('papers', p.id, { notes })} />
          <div className="hit-actions">
            <AskTalvis label="İzah et" text={`[P${p.id}] məqaləsini sadə dillə izah et: problem, metod, data, nəticə, məhdudiyyətlər və mənim mövzum üçün nə deməkdir.`} />
            <AskTalvis label="Oxşar işlər" text={`[P${p.id}] məqaləsinə oxşar və onu sitat edən ən vacib yeni işləri tap (related_papers) və ən faydalılarını saxla.`} />
          </div>
        </div>
      )}
    </div>
  )
}

export function PapersPanel() {
  const { state, toast } = useStore()
  const initialQ = pendingPaperQuery
  const [tab, setTab] = useState<'lib' | 'search'>(initialQ || !state.papers.length ? 'search' : 'lib')
  const [filter, setFilter] = useState({ q: '', status: '', topic: '' })
  const [s, setS] = useState({ q: initialQ || state.topics[0]?.title || '', source: 'all', from: '', sort: 'relevance' })
  const [hits, setHits] = useState<WorkHit[] | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [topicId, setTopicId] = useState<number | ''>(state.topics[0]?.id ?? '')
  const { save, isSaved } = useSavePaper()

  const run = (q = s.q) => {
    if (!q.trim()) return
    setBusy(true)
    api<{ hits: WorkHit[]; errors: string[] }>(`/research/papers?q=${encodeURIComponent(q)}&source=${s.source}&sort=${s.sort}&limit=20${s.from ? `&from=${s.from}` : ''}`)
      .then((r) => {
        setHits(r.hits)
        setErrors(r.errors)
      })
      .catch((e) => toast(String(e)))
      .finally(() => setBusy(false))
  }
  useEffect(() => {
    if (initialQ) {
      pendingPaperQuery = ''
      run(initialQ)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const lib = state.papers.filter(
    (p) =>
      (!filter.status || p.status === filter.status) &&
      (!filter.topic || p.topicIds.includes(Number(filter.topic))) &&
      (!filter.q || `${p.title} ${p.authors.join(' ')} ${p.venue ?? ''}`.toLowerCase().includes(filter.q.toLowerCase())),
  )

  return (
    <>
      <div className="tabs">
        <button className={tab === 'lib' ? 'on' : ''} onClick={() => setTab('lib')}>Kitabxana ({state.papers.length})</button>
        <button className={tab === 'search' ? 'on' : ''} onClick={() => setTab('search')}>Real məqalə axtarışı</button>
      </div>
      {tab === 'search' && (
        <>
          <div className="toolbar">
            <input className="input" style={{ maxWidth: 380 }} value={s.q} placeholder="Axtarış (ingiliscə daha yaxşı)..." onChange={(e) => setS({ ...s, q: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && run()} />
            <select className="select sm" value={s.source} onChange={(e) => setS({ ...s, source: e.target.value })}>
              <option value="all">Hamısı</option><option value="openalex">OpenAlex</option><option value="semantic_scholar">Semantic Scholar</option><option value="arxiv">arXiv</option>
            </select>
            <select className="select sm" value={s.sort} onChange={(e) => setS({ ...s, sort: e.target.value })}>
              <option value="relevance">Uyğunluq</option><option value="cited">Ən çox sitat</option><option value="recent">Ən yeni</option>
            </select>
            <input className="input sm" style={{ width: 90 }} placeholder="ildən" value={s.from} onChange={(e) => setS({ ...s, from: e.target.value.replace(/\D/g, '').slice(0, 4) })} />
            <button className="btn primary" onClick={() => run()}>{busy ? <Spinner /> : <Search size={13} />} Axtar</button>
          </div>
          <div className="row" style={{ gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
            <span className="faint" style={{ fontSize: 12 }}>Saxlanılanlar bu mövzuya bağlanır:</span>
            <select className="select sm" value={topicId} onChange={(e) => setTopicId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">-</option>
              {state.topics.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
            {[`${yearNow - 2}`, `${yearNow - 5}`].map((y) => <button key={y} className="qchip" onClick={() => setS({ ...s, from: y })}>{y}+</button>)}
          </div>
          {errors.length > 0 && <div className="faint" style={{ fontSize: 11.5, marginBottom: 8 }}>Qeyd: {errors.join(' · ')}</div>}
          {hits && (
            <div className="hits">
              {hits.length === 0 && <div className="empty">Nəticə yoxdur.</div>}
              {hits.map((h, i) => <WorkCard key={`${h.doi ?? h.title}-${i}`} h={h} saved={isSaved(h)} onSave={() => save(h, topicId ? [topicId] : [])} />)}
            </div>
          )}
        </>
      )}
      {tab === 'lib' && (
        <>
          <div className="toolbar">
            <input className="input" style={{ maxWidth: 300 }} placeholder="Kitabxanada süz..." value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} />
            <select className="select sm" value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}>
              <option value="">Bütün statuslar</option>
              {['to_read', 'reading', 'read', 'key'].map((x) => <option key={x} value={x}>{az(x)}</option>)}
            </select>
            <select className="select sm" value={filter.topic} onChange={(e) => setFilter({ ...filter, topic: e.target.value })}>
              <option value="">Bütün mövzular</option>
              {state.topics.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          </div>
          <div className="hits">{lib.map((p) => <PaperRow key={p.id} p={p} />)}</div>
          {lib.length === 0 && <div className="muted-box">Kitabxana boşdur və ya filtrə uyğun məqalə yoxdur.</div>}
        </>
      )}
    </>
  )
}

// ---------------- Gaps ----------------

export function GapsPanel() {
  const { state } = useStore()
  const [topicId, setTopicId] = useState<number | ''>(state.topics[0]?.id ?? '')
  const paper = (id?: number) => state.papers.find((p) => p.id === id)
  const topic = (id?: number) => state.topics.find((t) => t.id === id)?.title
  const order = { selected: 0, shortlisted: 1, candidate: 2, discarded: 3 }
  return (
    <>
      <JobLog module="gaps" />
      <div className="toolbar">
        <select className="select" style={{ maxWidth: 320 }} value={topicId} onChange={(e) => setTopicId(e.target.value ? Number(e.target.value) : '')}>
          {state.topics.length === 0 && <option value="">Əvvəl mövzu əlavə et</option>}
          {state.topics.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
        </select>
        <JobButton kind="gap_analysis" module="gaps" params={{ topicId }} label="Real gap analizi başlat" disabled={!topicId} />
        <span className="faint" style={{ fontSize: 12 }}>OpenAlex + Semantic Scholar + arXiv; hər gap sübut məqalələri ilə və "artıq həll olunubmu" yoxlaması ilə.</span>
      </div>
      <div className="hits">
        {[...state.gaps].sort((a, b) => order[a.status] - order[b.status] || b.novelty + b.feasibility - (a.novelty + a.feasibility)).map((g) => (
          <div key={g.id} className="hit" style={{ opacity: g.status === 'discarded' ? 0.5 : 1 }}>
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <span className="mono" style={{ color: 'var(--violet)', fontSize: 11 }}>X{g.id}</span>
              <div className="grow">
                <div className="hit-title">{g.title}</div>
                <div className="hit-meta">
                  {topic(g.topicId) && <span className="chip cyan">{topic(g.topicId)}</span>}
                  <span className="mono faint" style={{ fontSize: 9.5 }}>YENİLİK</span><Dots n={g.novelty} />
                  <span className="mono faint" style={{ fontSize: 9.5 }}>İCRA</span><Dots n={g.feasibility} />
                </div>
              </div>
              <StatusSelect value={g.status} options={['candidate', 'shortlisted', 'selected', 'discarded'] as const} onChange={(v) => items.patch<Gap>('gaps', g.id, { status: v })} />
              <DeleteBtn coll="gaps" id={g.id} />
            </div>
            <div className="hit-abs" style={{ color: 'var(--text)' }}>{g.description}</div>
            {g.methods && <div className="hit-abs"><b style={{ color: 'var(--cyan-2)' }}>Metod / ilk eksperiment: </b>{g.methods}</div>}
            <div className="section-label" style={{ margin: '10px 0 6px' }}>Sübut</div>
            <div className="list" style={{ overflow: 'visible' }}>
              {g.evidence.map((e, i) => {
                const p = paper(e.paperId)
                return (
                  <div key={i} className="item" style={{ alignItems: 'flex-start' }}>
                    <span className="mono" style={{ fontSize: 10.5, color: 'var(--cyan-2)' }}>{e.ref}</span>
                    <div className="grow">
                      <div style={{ fontSize: 12 }}>{p ? <>{p.title} <span className="faint">({p.year})</span> <Ext href={doiUrl(p.doi) ?? p.url} /></> : 'məqalə silinib'}</div>
                      {e.note && <div className="faint" style={{ fontSize: 11.5, marginTop: 2 }}>{e.note}</div>}
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="hit-actions">
              <AskTalvis label="Tədqiqat sualına çevir" text={`[X${g.id}] gap-ı əsasında 2-3 konkret PhD tədqiqat sualı, hipotez və 6 aylıq ilk eksperiment planı təklif et. Yalnız board-dakı və yeni tapdığın real mənbələrə istinad et.`} />
              <AskTalvis label="Yenidən yoxla" text={`[X${g.id}] gap-ı hələ də açıqdırmı? Son 12 ayın işlərini (OpenAlex recent + arXiv) axtar və həll edən iş varsa göstər.`} />
            </div>
          </div>
        ))}
      </div>
      {state.gaps.length === 0 && <div className="muted-box">Hələ research gap yoxdur. Mövzu seç və "Real gap analizi başlat" bas - Talvis arxa planda ədəbiyyatı tarayıb sübutlu gap-ları bura yazacaq.</div>}
    </>
  )
}

// ---------------- Publish ----------------

export function PublishPanel() {
  const { state, toast } = useStore()
  const [f, setF] = useState({ title: '', abstract: '' })
  const [hits, setHits] = useState<VenueHit[] | null>(null)
  const [busy, setBusy] = useState(false)
  const quick = () => {
    const q = f.title.trim() || state.topics[0]?.title
    if (!q) return toast('Başlıq yaz')
    setBusy(true)
    api<VenueHit[]>(`/research/venues?q=${encodeURIComponent(q)}&limit=15`)
      .then(setHits)
      .catch((e) => toast(String(e)))
      .finally(() => setBusy(false))
  }
  const saveHit = (v: VenueHit) => api('/research/save-venue', { body: { openalexId: v.openalexId } }).then(() => toast(`${v.name} saxlanıldı`))
  const savedIds = new Set(state.venues.map((v) => v.openalexId))
  return (
    <>
      <JobLog module="publish" />
      <div className="cardlet" style={{ marginBottom: 16 }}>
        <Field label="Məqalənin başlığı"><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <div style={{ height: 10 }} />
        <Field label="Abstract (daha dəqiq uyğunluq üçün)"><textarea className="textarea" value={f.abstract} onChange={(e) => setF({ ...f, abstract: e.target.value })} /></Field>
        <div className="toolbar" style={{ marginTop: 10, marginBottom: 0 }}>
          <JobButton kind="venue_match" module="publish" params={f} label="AI: real jurnal/konfrans tap" disabled={!f.title.trim()} />
          <button className="btn" onClick={quick}>{busy ? <Spinner /> : <Search size={13} />} Sürətli statistik axtarış</button>
          <span className="faint" style={{ fontSize: 12 }}>Oxşar işlərin harada nəşr olunduğuna əsaslanır (OpenAlex).</span>
        </div>
      </div>
      {hits && (
        <table className="table" style={{ marginBottom: 20 }}>
          <thead><tr><th>Nəşr yeri</th><th>Növ</th><th>h-index</th><th>OA / DOAJ / APC</th><th>Oxşar iş</th><th /></tr></thead>
          <tbody>
            {hits.map((v) => (
              <tr key={v.openalexId}>
                <td><b>{v.name}</b><div className="faint" style={{ fontSize: 11 }}>{v.publisher ?? ''} <Ext href={v.homepage} /></div></td>
                <td>{v.type}</td>
                <td className="mono">{v.hIndex ?? '-'}</td>
                <td>
                  <span className={`chip ${v.isOa ? 'green' : ''}`}>{v.isOa ? 'OA' : 'abunə'}</span>{' '}
                  {v.inDoaj && <span className="chip green">DOAJ</span>}{' '}
                  {v.apcUsd ? <span className="chip amber">${v.apcUsd}</span> : null}
                </td>
                <td className="mono">{v.matchingWorks}</td>
                <td><button className="btn sm" disabled={savedIds.has(v.openalexId)} onClick={() => saveHit(v)}><BookmarkPlus size={12} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="section-label" style={{ marginBottom: 10 }}>Saxlanılan nəşr yerləri</div>
      {state.venues.length === 0 ? (
        <div className="muted-box">Hələ yoxdur. AI axtarışı scope, h-index, OA/APC, DOAJ və predatory risklərini yoxlayıb uyğunluq faizi ilə bura yazır.</div>
      ) : (
        <table className="table">
          <thead><tr><th>Nəşr yeri</th><th>Uyğunluq</th><th>Göstəricilər</th><th>Status</th><th /></tr></thead>
          <tbody>
            {[...state.venues].sort((a, b) => (b.fit ?? 0) - (a.fit ?? 0)).map((v) => (
              <tr key={v.id}>
                <td>
                  <b>{v.name}</b> <Ext href={v.homepage} />
                  <div className="faint" style={{ fontSize: 11 }}>{v.type}{v.publisher ? ` · ${v.publisher}` : ''}</div>
                  {v.reason && <div className="dim" style={{ fontSize: 11.5, marginTop: 4, maxWidth: 460 }}>{v.reason}</div>}
                </td>
                <td style={{ minWidth: 100 }}><div className="row" style={{ gap: 6 }}><div className="bar grow"><i style={{ width: `${v.fit ?? 0}%` }} /></div><span className="mono" style={{ fontSize: 10.5 }}>{v.fit ?? '-'}</span></div></td>
                <td className="mono" style={{ fontSize: 11 }}>h{v.hIndex ?? '?'} · {v.isOa ? 'OA' : 'abunə'}{v.inDoaj ? ' · DOAJ' : ''}{v.apcUsd ? ` · $${v.apcUsd}` : ''}</td>
                <td><StatusSelect value={v.status} options={['suggested', 'shortlisted', 'submitted', 'rejected', 'accepted'] as const} onChange={(x) => items.patch<Venue>('venues', v.id, { status: x })} /></td>
                <td><DeleteBtn coll="venues" id={v.id} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
