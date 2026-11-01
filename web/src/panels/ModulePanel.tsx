import { useEffect, type CSSProperties, type FC } from 'react'
import { X } from 'lucide-react'
import type { ModuleKey } from '../../../shared/types'
import { Corners } from '../board/ModuleCard'
import { MODULE_BY_KEY } from '../modules/registry'
import { useStore } from '../store'
import { DeadlinesPanel, DocumentsPanel, ProfilePanel, TodayPanel, UniversitiesPanel } from './ApplyPanels'
import { GapsPanel, GroupsPanel, PapersPanel, PublishPanel, ResearchersPanel, TopicsPanel } from './ResearchPanels'
import { InsightsPanel, PositionsPanel } from './WebPanels'
import DirectionsPanel from './DirectionsPanel'

const PANELS: Record<Exclude<ModuleKey, 'core'>, FC> = {
  profile: ProfilePanel,
  universities: UniversitiesPanel,
  deadlines: DeadlinesPanel,
  today: TodayPanel,
  documents: DocumentsPanel,
  topics: TopicsPanel,
  groups: GroupsPanel,
  researchers: ResearchersPanel,
  papers: PapersPanel,
  gaps: GapsPanel,
  publish: PublishPanel,
  positions: PositionsPanel,
  insights: InsightsPanel,
  directions: DirectionsPanel,
}

export default function ModulePanel() {
  const { expanded, setExpanded } = useStore()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setExpanded(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setExpanded])
  if (!expanded || expanded === 'core') return null
  const def = MODULE_BY_KEY[expanded]
  const Icon = def.icon
  const Panel = PANELS[expanded]
  return (
    <>
      <div className="panel-veil" onClick={() => setExpanded(null)} />
      <section className={`panel ${def.wide ? 'wide' : ''}`} style={{ '--accent': def.accent } as CSSProperties}>
        <Corners />
        <div className="panel-head">
          <span style={{ color: def.accent, display: 'flex' }}><Icon size={20} /></span>
          <div>
            <div className="panel-title">{def.title}</div>
            <div className="panel-desc">{def.desc}</div>
          </div>
          <div className="panel-actions">
            <button className="icon-btn" onClick={() => setExpanded(null)} title="Close (Esc)"><X size={15} /></button>
          </div>
        </div>
        <div className="panel-body">
          <Panel key={expanded} />
        </div>
      </section>
    </>
  )
}
