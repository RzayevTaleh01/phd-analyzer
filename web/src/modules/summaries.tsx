import type React from 'react'
import { Check, FileText, Languages, Library, Mail, Radar, ScrollText, ShieldAlert, ShieldCheck, UserRound, UsersRound } from 'lucide-react'
import { byAdmitChance, CONDITION_BY_KEY, rankingLabel } from '../../../shared/criteria'
import { directionCounts, overallScore } from '../../../shared/directions'
import type { AppState, Doc } from '../../../shared/types'
import { statusLabel, daysUntil, dayLabel, fmtShort, initials, monthShort, todayISO, urgency, weekday } from '../lib/util'
import { AdmitBar } from '../panels/ui'

type P = { s: AppState }

const uniName = (s: AppState, id?: number) => s.universities.find((u) => u.id === id)?.name

function Ring({ value, total }: { value: number; total: number }) {
  const r = 22
  const c = 2 * Math.PI * r
  const pct = total ? value / total : 0
  return (
    <svg width="58" height="58" viewBox="0 0 58 58">
      <circle cx="29" cy="29" r={r} fill="none" stroke="rgba(64,200,255,0.12)" strokeWidth="4" />
      <circle
        cx="29" cy="29" r={r} fill="none" stroke="var(--green)" strokeWidth="4" strokeLinecap="round"
        strokeDasharray={`${c * pct} ${c}`} transform="rotate(-90 29 29)"
        style={{ filter: 'drop-shadow(0 0 4px rgba(69,240,164,.6))' }}
      />
      <text x="29" y="33" textAnchor="middle" fontFamily="var(--mono)" fontSize="12" fill="var(--text)">
        {value}/{total}
      </text>
    </svg>
  )
}

export function TodaySummary({ s }: P) {
  const today = todayISO()
  const tasks = s.tasks.filter((t) => !t.dueDate || t.dueDate <= today)
  const done = tasks.filter((t) => t.status === 'done').length
  const overdue = tasks.filter((t) => t.status !== 'done' && t.dueDate && t.dueDate < today).length
  const urgent = s.deadlines.filter((d) => d.status === 'open' && daysUntil(d.dueDate) >= 0 && daysUntil(d.dueDate) <= 14).length
  const d = new Date()
  return (
    <>
      <div className="row">
        <div>
          <div className="big-count">{String(d.getDate()).padStart(2, '0')}</div>
          <div className="big-unit">{monthShort(d)} · {weekday(d)}</div>
        </div>
        <div className="grow" />
        <div className="col" style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
          {overdue > 0 && <span className="chip red">{overdue} overdue</span>}
          <span className="chip amber">{urgent} deadlines / 14d</span>
        </div>
        <Ring value={done} total={tasks.length} />
      </div>
      <div className="section-label">Tasks for today</div>
      <div className="list">
        {tasks.length === 0 && <div className="empty">No tasks for today. Ask Talvis to "build my plan for today".</div>}
        {tasks.map((t) => (
          <div key={t.id} className={`item ${t.status === 'done' ? 'done' : ''}`}>
            <span className={`check ${t.status === 'done' ? 'on' : t.status === 'doing' ? 'half' : ''}`}>
              {t.status === 'done' && <Check size={10} strokeWidth={3} />}
            </span>
            <span className="t">{t.title}</span>
            {t.createdBy === 'ai' && <span className="chip violet">AI</span>}
          </div>
        ))}
      </div>
    </>
  )
}

export function DeadlinesSummary({ s }: P) {
  const open = s.deadlines
    .filter((d) => d.status === 'open' && daysUntil(d.dueDate) >= 0)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const next = open[0]
  const n = next ? daysUntil(next.dueDate) : 0
  return (
    <>
      {next ? (
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div>
            <div className="big-count" style={{ color: `var(--${urgency(n) === 'cyan' ? 'cyan' : urgency(n)})` }}>{n}</div>
            <div className="big-unit">days left</div>
          </div>
          <div className="grow" style={{ paddingBottom: 2 }}>
            <div className="ellip" style={{ fontWeight: 600, fontSize: 12.5 }}>{next.title}</div>
            <div className="ellip dim" style={{ fontSize: 11 }}>{uniName(s, next.universityId) ?? statusLabel(next.kind)} · {fmtShort(next.dueDate)}</div>
          </div>
        </div>
      ) : (
        <div className="empty">No open deadlines.</div>
      )}
      <div className="section-label">Next</div>
      <div className="list">
        {open.slice(1).map((d) => {
          const k = daysUntil(d.dueDate)
          return (
            <div key={d.id} className="item">
              <span className={`chip ${urgency(k)}`} style={{ minWidth: 52, justifyContent: 'center' }}>{dayLabel(k)}</span>
              <span className="t">{d.title}</span>
              {d.verified ? (
                <ShieldCheck size={13} color="var(--green)" />
              ) : (
                <span title="Not verified from a source"><ShieldAlert size={13} color="var(--amber)" /></span>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}

export function UniversitiesSummary({ s }: P) {
  const by = (st: string[]) => s.universities.filter((u) => st.includes(u.status)).length
  return (
    <>
      <div className="kpis">
        <div className="kpi"><div className="n">{s.universities.length}</div><div className="l">Selected</div></div>
        <div className="kpi"><div className="n">{by(['applying'])}</div><div className="l">Applying</div></div>
        <div className="kpi"><div className="n">{by(['applied', 'interview', 'accepted'])}</div><div className="l">Applied</div></div>
      </div>
      <div className="list">
        {s.universities.length === 0 && <div className="empty">Add target universities or tell Talvis.</div>}
        {[...s.universities].sort(byAdmitChance).map((u) => (
          <div key={u.id} className="item">
            <span className="flag">{u.countryCode}</span>
            <span className="t" title={u.rankLabel}>{u.name}</span>
            {u.admitChance !== undefined ? <AdmitBar chance={u.admitChance} compact /> : u.rank !== undefined && <span className="m" title={u.rankLabel}>#{u.rank}</span>}
            {u.langCert === 'not_required' && <span title="Language certificate not required"><Languages size={11} color="var(--green)" /></span>}
            {u.langCert === 'waiver' && <span title="Language certificate waiver possible"><Languages size={11} color="var(--amber)" /></span>}
            <span className="m row" style={{ gap: 3 }}>{s.researchers.filter((r) => r.universityId === u.id).length}<UsersRound size={10} /></span>
            <span className={`chip ${u.status === 'applying' ? 'amber' : u.status === 'accepted' ? 'green' : 'cyan'}`}>{statusLabel(u.status)}</span>
          </div>
        ))}
      </div>
    </>
  )
}

export function TopicsSummary({ s }: P) {
  return (
    <div className="list" style={{ gap: 7 }}>
      {s.topics.length === 0 && <div className="empty">Add the topics you are researching - all searches are based on them.</div>}
      {s.topics.map((t) => {
        const papers = s.papers.filter((p) => p.topicIds.includes(t.id)).length
        const gaps = s.gaps.filter((g) => g.topicId === t.id).length
        return (
          <div key={t.id} className="item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 5 }}>
            <div className="row">
              <span className="chip cyan solid">P{t.priority}</span>
              <span className="t" style={{ fontWeight: 600 }}>{t.title}</span>
            </div>
            <div className="row" style={{ gap: 4, flexWrap: 'nowrap', overflow: 'hidden' }}>
              {t.keywords.slice(0, 3).map((k) => <span key={k} className="chip">{k}</span>)}
              <span className="grow" />
              <span className="m mono dim row" style={{ fontSize: 10, gap: 3 }}>
                {papers}<Library size={10} /> {gaps}<Radar size={10} />
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function GroupsSummary({ s }: P) {
  return (
    <div className="list">
      {s.groups.length === 0 && <div className="empty">Scout on a university finds labs.</div>}
      {s.groups.map((g) => (
        <div key={g.id} className="item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 2 }}>
          <span className="t" style={{ fontWeight: 600 }}>{g.name}</span>
          <span className="ellip dim" style={{ fontSize: 11 }}>{uniName(s, g.universityId) ?? '-'}{g.piName ? ` · PI: ${g.piName}` : ''}</span>
        </div>
      ))}
    </div>
  )
}

export function ResearchersSummary({ s }: P) {
  const list = [...s.researchers].sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0))
  return (
    <div className="list">
      {list.length === 0 && <div className="empty">Who works on your topics at your chosen universities will appear here.</div>}
      {list.map((r) => (
        <div key={r.id} className="item">
          <span className="avatar">{initials(r.name)}</span>
          <div className="grow">
            <div className="row" style={{ gap: 6 }}>
              <span className="ellip" style={{ fontSize: 12, fontWeight: 600 }}>{r.name}</span>
              {r.status !== 'new' && <span className="chip amber">{statusLabel(r.status)}</span>}
            </div>
            <div className="row" style={{ gap: 6, marginTop: 3 }}>
              <span className="mono faint" style={{ fontSize: 9.5 }}>h{r.hIndex ?? '-'}</span>
              <div className="bar grow"><i style={{ width: `${r.relevance ?? 0}%` }} /></div>
              <span className="mono" style={{ fontSize: 9.5, color: 'var(--cyan-2)' }}>{r.relevance ?? 0}%</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export function PapersSummary({ s }: P) {
  const c = (st: string) => s.papers.filter((p) => p.status === st).length
  return (
    <>
      <div className="kpis">
        <div className="kpi"><div className="n">{c('to_read')}</div><div className="l">To read</div></div>
        <div className="kpi"><div className="n">{c('reading')}</div><div className="l">Reading</div></div>
        <div className="kpi"><div className="n">{c('read') + c('key')}</div><div className="l">Read</div></div>
      </div>
      <div className="list">
        {s.papers.length === 0 && <div className="empty">The library is empty. Search real papers from OpenAlex / Semantic Scholar / arXiv.</div>}
        {[...s.papers].reverse().map((p) => (
          <div key={p.id} className="item">
            <span className={`chip ${p.status === 'key' ? 'green' : p.status === 'reading' ? 'amber' : ''}`}>{p.year ?? '-'}</span>
            <span className="t">{p.title}</span>
            <span className="m">{p.citedBy ?? 0}↗</span>
          </div>
        ))}
      </div>
    </>
  )
}

function Dots({ n }: { n: number }) {
  return (
    <span className="dots5">
      {[1, 2, 3, 4, 5].map((i) => <i key={i} className={i <= n ? 'on' : ''} />)}
    </span>
  )
}

export function GapsSummary({ s }: P) {
  return (
    <div className="list" style={{ gap: 6 }}>
      {s.gaps.length === 0 && <div className="empty">Pick a topic and run a live gap analysis - evidence-backed gaps will appear here.</div>}
      {s.gaps.filter((g) => g.status !== 'discarded').map((g) => (
        <div key={g.id} className="item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 5 }}>
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <span className="mono" style={{ color: 'var(--accent)', fontSize: 10 }}>X{g.id}</span>
            <span style={{ fontSize: 12, lineHeight: 1.35, flex: 1 }}>{g.title}</span>
          </div>
          <div className="row" style={{ gap: 10 }}>
            <span className="mono faint" style={{ fontSize: 9 }}>NOVELTY</span><Dots n={g.novelty} />
            <span className="mono faint" style={{ fontSize: 9 }}>FEASIBILITY</span><Dots n={g.feasibility} />
            <span className="grow" />
            <span className={`chip ${g.status === 'shortlisted' || g.status === 'selected' ? 'violet' : ''}`}>{statusLabel(g.status)}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

export function PublishSummary({ s }: P) {
  const list = [...s.venues].sort((a, b) => (b.fit ?? 0) - (a.fit ?? 0))
  return (
    <div className="list">
      {list.length === 0 && <div className="empty">Where you can submit your paper: real journals and conferences, with h-index and OA/APC.</div>}
      {list.map((v) => (
        <div key={v.id} className="item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
          <div className="row">
            <span className="t" style={{ fontWeight: 600 }}>{v.name}</span>
            {v.isOa && <span className="chip green">OA</span>}
          </div>
          <div className="row" style={{ gap: 6 }}>
            <span className="mono faint" style={{ fontSize: 9.5 }}>{v.type === 'journal' ? 'JOURNAL' : 'CONF.'}{v.hIndex ? ` · h${v.hIndex}` : ''}</span>
            <div className="bar grow"><i style={{ width: `${v.fit ?? 0}%` }} /></div>
            <span className="mono" style={{ fontSize: 9.5, color: 'var(--accent)' }}>{v.fit ?? 0}%</span>
          </div>
        </div>
      ))}
    </div>
  )
}

const DOC_ICON: Record<Doc['kind'], typeof FileText> = {
  sop: ScrollText, cv: UserRound, proposal: FileText, email: Mail, cover_letter: Mail, note: FileText,
}

export function DocumentsSummary({ s }: P) {
  return (
    <div className="list">
      {s.docs.length === 0 && <div className="empty">SOP, research proposal, CV, emails to professors.</div>}
      {s.docs.map((d) => {
        const I = DOC_ICON[d.kind]
        return (
          <div key={d.id} className="item">
            <I size={13} color="var(--accent)" />
            <span className="t">{d.title}</span>
            <span className={`chip ${d.status === 'final' ? 'green' : d.status === 'review' ? 'amber' : ''}`}>{statusLabel(d.status)}</span>
          </div>
        )
      })}
    </div>
  )
}

function ProfRow({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="row" style={{ alignItems: 'flex-start', gap: 8 }}>
      <span className="mono faint" style={{ fontSize: 9, width: 72, flex: 'none', paddingTop: 3, letterSpacing: '0.12em' }}>{k}</span>
      <div className="row grow" style={{ gap: 4, flexWrap: 'wrap' }}>{children}</div>
    </div>
  )
}

export function ProfileSummary({ s }: P) {
  const p = s.profile
  if (!p.name && !p.field && !p.directions.length && !p.countries.length)
    return <div className="empty">Profile is empty. Choose your directions, target countries, ranking and conditions (e.g. no language certificate required) - the university search is based on them.</div>
  return (
    <>
      {(p.name || p.stage) && (
        <div className="row">
          <span className="avatar" style={{ width: 30, height: 30, fontSize: 11 }}>{initials(p.name || '?')}</span>
          <div className="grow">
            <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name || '-'}</div>
            <div className="ellip dim" style={{ fontSize: 11 }}>{[p.stage, p.targetTerm].filter(Boolean).join(' · ')}</div>
          </div>
        </div>
      )}
      <ProfRow k="DIRECTION">{p.directions.length ? p.directions.map((d) => <span key={d} className="chip cyan solid">{d}</span>) : <span className="faint">-</span>}</ProfRow>
      <ProfRow k="COUNTRY">{p.countries.length ? p.countries.map((c) => <span key={c} className="chip cyan">{c}</span>) : <span className="faint">any</span>}</ProfRow>
      <ProfRow k="RANKING"><span className="chip">{rankingLabel(p.rankingSystem, p.rankingMax)}</span></ProfRow>
      <ProfRow k="CONDITIONS">
        {p.conditions.length ? p.conditions.map((k) => <span key={k} className="chip green" title={CONDITION_BY_KEY[k]?.label}>{CONDITION_BY_KEY[k]?.short ?? k}</span>) : <span className="faint">-</span>}
      </ProfRow>
    </>
  )
}

export function PositionsSummary({ s }: P) {
  const open = s.positions.filter((p) => p.status !== 'dismissed')
  const soon = open.filter((p) => p.deadline && /^\d{4}-\d{2}-\d{2}$/.test(p.deadline) && daysUntil(p.deadline) >= 0 && daysUntil(p.deadline) <= 30).length
  const portals = new Set(open.map((p) => p.portal)).size
  return (
    <>
      <div className="kpis">
        <div className="kpi"><div className="n">{open.length}</div><div className="l">Positions</div></div>
        <div className="kpi"><div className="n">{open.filter((p) => p.status === 'shortlisted' || p.status === 'applying').length}</div><div className="l">Shortlisted</div></div>
        <div className="kpi"><div className="n">{soon}</div><div className="l">Within 30 days</div></div>
      </div>
      <div className="list">
        {open.length === 0 && <div className="empty">Let Talvis find PhD positions matching your profile from portals (DAAD, jobs.ac.uk, EURAXESS, PhDPortal...).</div>}
        {[...open].sort((a, b) => (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999')).map((p) => (
          <div key={p.id} className="item">
            <span className="t" title={p.title}>{p.title}</span>
            <span className="m">{p.portal}</span>
            {p.deadline && /^\d{4}-\d{2}-\d{2}$/.test(p.deadline) && <span className={`chip ${urgency(daysUntil(p.deadline))}`}>{fmtShort(p.deadline)}</span>}
          </div>
        ))}
      </div>
      {portals > 0 && <div className="faint" style={{ fontSize: 10.5, marginTop: 4 }}>from {portals} portals</div>}
    </>
  )
}

export function InsightsSummary({ s }: P) {
  return (
    <div className="list">
      {s.insights.length === 0 && <div className="empty">Pick a university: Talvis analyses what students there say on Reddit (supervision, stipend, workload), with evidence.</div>}
      {s.insights.map((i) => (
        <div key={i.id} className="item">
          <span className="t">{uniName(s, i.universityId) ?? i.subject}</span>
          <span className="m">{i.postsAnalyzed} posts</span>
          <span className={`chip ${i.sentiment > 0 ? 'green' : i.sentiment < 0 ? 'red' : 'amber'}`}>{i.sentiment > 0 ? '+' : ''}{i.sentiment}</span>
        </div>
      ))}
    </div>
  )
}

export function DirectionsSummary({ s }: P) {
  const counts = directionCounts(s)
  return (
    <div className="list">
      {s.directions.length === 0 && <div className="empty">Add your main directions (e.g. NLP, HCI, adaptive learning): Talvis compares which fits you best, with evidence.</div>}
      {s.directions.map((d) => {
        const score = overallScore(d.analysis?.scores, d.interest)
        const c = counts[d.id]
        return (
          <div key={d.id} className="item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 5 }}>
            <div className="row">
              <span style={{ width: 8, height: 8, borderRadius: 4, background: d.color, flexShrink: 0 }} />
              <span className="t" style={{ fontWeight: 600 }}>{d.name}</span>
              <span className="m">{c ? `${c.papers} papers · ${c.researchers} res. · ${c.positions} pos.` : ''}</span>
              <span className="chip" style={{ color: d.color, borderColor: d.color }}>{score !== undefined ? `${score}/10` : 'no analysis'}</span>
            </div>
            {score !== undefined && (
              <span className="scorebar" style={{ '--dc': d.color } as React.CSSProperties}><i style={{ width: `${score * 10}%` }} /></span>
            )}
          </div>
        )
      })}
    </div>
  )
}
